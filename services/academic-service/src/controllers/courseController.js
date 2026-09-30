const pool = require('../db');
const courseModel = require('../models/courseModel');
const programModel = require('../models/programModel');

// Express route handlers for /api/v1/academic/courses.
// Controllers validate input, call model functions, and map outcomes to HTTP status codes.
// Error responses always have the shape { error: "message" }.

// ---------- helpers ----------

// Parses a value into a positive integer id, or returns null if it isn't one.
// Why: ids arrive as strings in URLs ("5") and could be anything in a JSON body ("abc", -1, 2.5).
// Checking up front returns a clean 400 instead of sending junk to MySQL.
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Validates a course body for create (POST) and full replace (PUT).
// Returns { error } on failure or { data } with cleaned values on success.
// Why a shared function: POST and PUT accept the same fields, so the rules live in one place.
function validateCourseBody(body) {
  const { program_id, code, title, description, credit_hours, prerequisite_ids } = body ?? {};

  const missing = ['program_id', 'code', 'title', 'credit_hours'].filter(
    (field) => body?.[field] === undefined || body?.[field] === null || body?.[field] === ''
  );
  if (missing.length > 0) {
    return { error: `Missing required field(s): ${missing.join(', ')}` };
  }

  const programId = parseId(program_id);
  if (programId === null) {
    return { error: 'program_id must be a positive integer' };
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return { error: 'code must be a non-empty string' };
  }
  if (code.trim().length > 20) {
    return { error: 'code must be at most 20 characters' };
  }
  if (typeof title !== 'string' || title.trim() === '') {
    return { error: 'title must be a non-empty string' };
  }
  if (title.trim().length > 200) {
    return { error: 'title must be at most 200 characters' };
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: 'description must be a string if provided' };
  }
  const credits = Number(credit_hours);
  // TINYINT UNSIGNED holds 0-255; a course with 0 or more than 255 credit hours makes no sense.
  if (!Number.isInteger(credits) || credits < 1 || credits > 255) {
    return { error: 'credit_hours must be an integer between 1 and 255' };
  }

  // prerequisite_ids is optional. `undefined` means "not provided", which PUT treats as
  // "leave existing prerequisites alone". An empty array means "no prerequisites".
  let prerequisiteIds;
  if (prerequisite_ids !== undefined) {
    if (!Array.isArray(prerequisite_ids)) {
      return { error: 'prerequisite_ids must be an array of course ids' };
    }
    const parsed = prerequisite_ids.map(parseId);
    if (parsed.some((id) => id === null)) {
      return { error: 'prerequisite_ids must contain only positive integers' };
    }
    // Remove duplicates so [3, 3] doesn't trip the UNIQUE key on course_prerequisites.
    prerequisiteIds = [...new Set(parsed)];
  }

  return {
    data: {
      program_id: programId,
      code: code.trim(),
      title: title.trim(),
      description: description ?? null,
      credit_hours: credits,
      prerequisiteIds,
    },
  };
}

// Runs `work(conn)` inside a MySQL transaction: commit if it succeeds, roll back if it throws.
// Why: creating or updating a course takes several queries (course row plus prerequisite rows).
// Without a transaction, a failure halfway through would leave a course with only some of
// its prerequisites saved.
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    // Always return the connection to the pool, or the pool eventually runs dry.
    conn.release();
  }
}

// Checks that the program and every prerequisite id exist.
// Returns an error message string, or null if everything is valid.
// Why: MySQL would reject bad foreign keys anyway, but its error doesn't say *which* id
// was wrong. Checking first gives the client a precise 400.
async function checkReferences({ program_id, prerequisiteIds }) {
  const program = await programModel.getProgramById(program_id);
  if (!program) {
    return `program_id ${program_id} does not exist`;
  }
  if (prerequisiteIds && prerequisiteIds.length > 0) {
    const existing = await courseModel.getExistingCourseIds(prerequisiteIds);
    const unknown = prerequisiteIds.filter((id) => !existing.includes(id));
    if (unknown.length > 0) {
      return `prerequisite course id(s) do not exist: ${unknown.join(', ')}`;
    }
  }
  return null;
}

// Loads a course and attaches its resolved prerequisite list.
// Why: POST, GET-one and PUT all return the same shape, so it's built in one place.
async function loadCourseWithPrerequisites(id) {
  const course = await courseModel.getCourseById(id);
  if (!course) return null;
  course.prerequisites = await courseModel.getPrerequisitesForCourse(id);
  return course;
}

// ---------- handlers ----------

// POST /api/v1/academic/courses
// Creates a course and, optionally, links its prerequisites in the same transaction.
// Returns 201 with the created course, including resolved prerequisites.
async function createCourse(req, res) {
  const { error, data } = validateCourseBody(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const refError = await checkReferences(data);
    if (refError) return res.status(400).json({ error: refError });

    const id = await withTransaction(async (conn) => {
      const newId = await courseModel.createCourse(data, conn);
      for (const prereqId of data.prerequisiteIds ?? []) {
        await courseModel.addPrerequisite(newId, prereqId, conn);
      }
      return newId;
    });

    const course = await loadCourseWithPrerequisites(id);
    return res.status(201).json(course);
  } catch (err) {
    // UNIQUE key on courses.code: two courses can't share a code like "CS101".
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `A course with code "${data.code}" already exists` });
    }
    console.error('createCourse failed:', err);
    return res.status(500).json({ error: 'Failed to create course' });
  }
}

// GET /api/v1/academic/courses
// Lists all courses without their prerequisites. Use GET /courses/:id for prerequisites.
// Returns 200 with an array, which may be empty.
async function listCourses(req, res) {
  try {
    const courses = await courseModel.listCourses();
    return res.json(courses);
  } catch (err) {
    console.error('listCourses failed:', err);
    return res.status(500).json({ error: 'Failed to list courses' });
  }
}

// GET /api/v1/academic/courses/:id
// Returns one course with a `prerequisites` array of resolved courses (id, code, title,
// credit_hours). Returns 400 for a malformed id and 404 if the course doesn't exist.
async function getCourse(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  try {
    const course = await loadCourseWithPrerequisites(id);
    if (!course) return res.status(404).json({ error: `Course ${id} not found` });
    return res.json(course);
  } catch (err) {
    console.error('getCourse failed:', err);
    return res.status(500).json({ error: 'Failed to get course' });
  }
}

// PUT /api/v1/academic/courses/:id
// Full replacement of a course's fields (same required fields as POST).
// If `prerequisite_ids` is sent, it replaces the prerequisite list entirely ([] clears it).
// If it's left out, existing prerequisites are kept, so a simple title edit can't wipe them.
async function updateCourse(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  const { error, data } = validateCourseBody(req.body);
  if (error) return res.status(400).json({ error });

  // A course can't require itself.
  if (data.prerequisiteIds?.includes(id)) {
    return res.status(400).json({ error: 'A course cannot be its own prerequisite' });
  }

  try {
    const existing = await courseModel.getCourseById(id);
    if (!existing) return res.status(404).json({ error: `Course ${id} not found` });

    const refError = await checkReferences(data);
    if (refError) return res.status(400).json({ error: refError });

    await withTransaction(async (conn) => {
      await courseModel.updateCourse(id, data, conn);
      if (data.prerequisiteIds !== undefined) {
        await courseModel.removeAllPrerequisites(id, conn);
        for (const prereqId of data.prerequisiteIds) {
          await courseModel.addPrerequisite(id, prereqId, conn);
        }
      }
    });

    const course = await loadCourseWithPrerequisites(id);
    return res.json(course);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `A course with code "${data.code}" already exists` });
    }
    console.error('updateCourse failed:', err);
    return res.status(500).json({ error: 'Failed to update course' });
  }
}

// DELETE /api/v1/academic/courses/:id
// Deletes a course and its own prerequisite links. Returns 204 No Content on success
// (nothing left to send back), 404 if it doesn't exist, and 409 if other courses still
// list it as a prerequisite.
async function deleteCourse(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'id must be a positive integer' });

  try {
    const deleted = await courseModel.deleteCourse(id);
    if (deleted === 0) return res.status(404).json({ error: `Course ${id} not found` });
    return res.status(204).end();
  } catch (err) {
    // ON DELETE RESTRICT on course_prerequisites.prerequisite_course_id raises this error.
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: `Course ${id} is a prerequisite for other courses; remove it from their prerequisite lists first`,
      });
    }
    console.error('deleteCourse failed:', err);
    return res.status(500).json({ error: 'Failed to delete course' });
  }
}

module.exports = {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  deleteCourse,
};

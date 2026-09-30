const programModel = require('../models/programModel');

// Express route handlers for /api/v1/academic/programs.
// Controllers validate the request, call model functions, and pick the HTTP status code.
// They don't write SQL; that lives in the model.

// POST /api/v1/academic/programs
// Creates a program. `name` is required; `description` is optional.
// Why validate here: bad input fails fast with a clear 400 and never reaches the database.
async function createProgram(req, res) {
  // Express 5 leaves req.body undefined when the request has no JSON body, so default to {}.
  const { name, description } = req.body ?? {};

  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required and must be a non-empty string' });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ error: 'description must be a string if provided' });
  }

  try {
    const id = await programModel.createProgram({
      name: name.trim(),
      description: description ?? null,
    });
    const program = await programModel.getProgramById(id);
    return res.status(201).json(program);
  } catch (err) {
    // The UNIQUE key on programs.name raises ER_DUP_ENTRY for duplicate names.
    // 409 Conflict tells the client the input was well-formed but clashes with existing data.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `A program named "${name.trim()}" already exists` });
    }
    console.error('createProgram failed:', err);
    return res.status(500).json({ error: 'Failed to create program' });
  }
}

// GET /api/v1/academic/programs
// Lists all programs. An empty table returns 200 with [], not 404,
// because the collection exists even when it has no items.
async function listPrograms(req, res) {
  try {
    const programs = await programModel.listPrograms();
    return res.json(programs);
  } catch (err) {
    console.error('listPrograms failed:', err);
    return res.status(500).json({ error: 'Failed to list programs' });
  }
}

module.exports = {
  createProgram,
  listPrograms,
};

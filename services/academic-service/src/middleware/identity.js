const studentModel = require('../models/studentModel');

// Who is calling, and what their role may do.
//
// The gateway verifies the access token with auth-service, removes any identity headers a client
// sent, and forwards x-user-id / x-user-role / x-user-email / x-tenant-id (docs/gateway.md).
// academic-service is only reachable on the Docker network, so these headers can be trusted.
//
// A STUDENT account is linked to its academic record by email: the student row whose email is
// the account's email. Students only ever see or change their own record.

const ADMINS = ['SUPER_ADMIN', 'ADMIN'];
const STAFF_ROLES = [...ADMINS, 'STAFF'];
const EVERYONE = [...STAFF_ROLES, 'STUDENT'];

function identify(req, res, next) {
  const id = req.headers['x-user-id'];
  const role = req.headers['x-user-role'];
  if (!id || !role) {
    return res.status(401).json({ error: 'Missing user identity; call this API through the gateway' });
  }
  req.user = {
    id: String(id),
    role: String(role),
    email: req.headers['x-user-email'] ? String(req.headers['x-user-email']).toLowerCase() : null,
    tenantId: req.headers['x-tenant-id'] ? String(req.headers['x-tenant-id']) : null,
  };
  return next();
}

// Access rules, checked in order; the first rule whose method and path match decides.
// Paths are relative to /api/v1/academic.
//   roles        - roles allowed for any record
//   student      - where a STUDENT is also allowed, if the record is their own:
//                  'me' (always their own), 'param' (the :studentId in the path) or 'body' (body.studentId)
// Requests no rule matches are allowed for administrators only (so unknown routes still get 404).
const RULES = [
  // A student's own record and results. Staff see every student's.
  { method: 'GET', path: /^\/students\/me$/, roles: [], student: 'me' },
  { method: 'GET', path: /^\/students\/(\d+)\/(enrollments|grades|attendance|at-risk|transcript\/pdf)$/, roles: STAFF_ROLES, student: 'param' },
  // Course registration: students register themselves, administrators register anyone.
  { method: 'POST', path: /^\/enrollments$/, roles: ADMINS, student: 'body' },
  // Grade appeals are filed by the student the grade belongs to.
  { method: 'POST', path: /^\/grades\/\d+\/appeals$/, roles: ADMINS, student: 'body' },

  // The catalogue and the exam timetable: everyone reads.
  { method: 'GET', path: /^\/(programs|courses|semesters|exams)(\/\d+)?$/, roles: EVERYONE },

  // Teaching: lecturers (staff) and administrators.
  { method: 'GET', path: /^\/(instructors\/me\/offerings|courses\/\d+\/roster|sessions|grades|attendance\/session\/\d+|appeals(\/\d+)?|at-risk-students|students)$/, roles: STAFF_ROLES },
  { method: 'POST', path: /^\/(sessions|attendance|grades)$/, roles: STAFF_ROLES },
  { method: 'PUT', path: /^\/(grades\/\d+\/publish|appeals\/\d+\/status)$/, roles: STAFF_ROLES },

  // Administration: programs, courses, semesters, students and exams.
  { method: '*', path: /^\/(programs|courses|semesters|students|exams)(\/\d+)?$/, roles: ADMINS },
];

const forbidden = (res, message = 'You do not have permission to perform this action') =>
  res.status(403).json({ error: message });

// The academic record of the calling student, or null. Cached on the request.
async function ownStudent(req) {
  if (req.student === undefined) {
    req.student = req.user.email ? await studentModel.getStudentByEmail(req.user.email) : null;
  }
  return req.student;
}

async function authorize(req, res, next) {
  try {
    const rule = RULES.find((r) => (r.method === '*' || r.method === req.method) && r.path.test(req.path));
    if (!rule) return ADMINS.includes(req.user.role) ? next() : forbidden(res);
    if (rule.roles.includes(req.user.role)) return next();
    if (req.user.role !== 'STUDENT' || !rule.student) return forbidden(res);

    const student = await ownStudent(req);
    if (!student) {
      return rule.student === 'me'
        ? res.status(404).json({ error: `No student record uses your email (${req.user.email}). Ask the registrar to link your account.` })
        : forbidden(res, 'Your account is not linked to a student record');
    }
    const target = rule.student === 'me' ? student.id
      : rule.student === 'param' ? Number(rule.path.exec(req.path)[1])
        : Number(req.body?.studentId);
    return target === student.id ? next() : forbidden(res, 'Students can only access their own records');
  } catch (err) {
    return next(err);
  }
}

module.exports = { identify, authorize, ADMINS, STAFF_ROLES };

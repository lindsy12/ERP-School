# academic-service contract

## REST endpoints

Base URL: `http://academic-service:4002` (reach it through the gateway in production). No authentication yet; it will be added once auth-service is ready.
Every error response has the shape `{ "error": "message" }`. A request body that isn't valid JSON returns `400`.

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| GET | `/health` | — | `200 { status, service, db }` | `500` if the DB is unreachable. |
| POST | `/api/v1/programs` | `{ name*: string, description?: string }` | `201` Program | `400` missing/invalid `name`; `409` a program with that name already exists. |
| GET | `/api/v1/programs` | — | `200` Program[] | Ordered by `id`. Empty array if none. |
| POST | `/api/v1/courses` | `{ program_id*: int, code*: string(≤20), title*: string(≤200), credit_hours*: int 1–255, description?: string, prerequisite_ids?: int[] }` | `201` Course (with `prerequisites`) | Course and prerequisite links are saved in one transaction. `400` missing/invalid field, `program_id` doesn't exist, or unknown prerequisite id(s); `409` duplicate `code`. |
| GET | `/api/v1/courses` | — | `200` Course[] (without `prerequisites`) | Ordered by `id`. Use GET `/:id` for prerequisites. |
| GET | `/api/v1/courses/:id` | — | `200` Course (with `prerequisites`) | `400` non-integer id; `404` not found. |
| PUT | `/api/v1/courses/:id` | Same as POST | `200` Course (with `prerequisites`) | Full replace of course fields. If `prerequisite_ids` is sent it **replaces** the list (`[]` clears it); if omitted, prerequisites are unchanged. `400` invalid input or course listed as its own prerequisite; `404` not found; `409` duplicate `code`. |
| DELETE | `/api/v1/courses/:id` | — | `204` (no body) | Also removes this course's own prerequisite links. `404` not found; `409` another course still lists it as a prerequisite. |
| POST | `/api/v1/enrollments` | `{ studentId*: int, courseId*: int, semesterId*: int }` | `201` Enrollment | Publishes `academic.student.enrolled` after the row is saved. `400` missing/invalid field or student/course/semester doesn't exist; `409` prerequisites not met (body also has `missingPrerequisites: [{ id, code, title }]`) or already enrolled in this course this semester; `500` if `TUITION_AMOUNT` isn't configured (nothing is saved). If RabbitMQ is down the enrollment still succeeds and the missed event is logged. |
| GET | `/api/v1/students/:studentId/enrollments` | — | `200` StudentEnrollment[] | Includes dropped enrollments. Ordered by semester start date, then course code. `400` non-integer id; `404` student not found; `[]` if the student has no enrollments. |
| POST | `/api/v1/sessions` | `{ courseId*: int, semesterId*: int, sessionDate*: "YYYY-MM-DD", startTime*: "HH:MM[:SS]", endTime*: "HH:MM[:SS]" }` | `201` ClassSession | `400` missing/invalid field, `endTime` not after `startTime`, course/semester doesn't exist, or date outside the semester; `409` a session for that course, semester, date and start time already exists. |
| POST | `/api/v1/attendance` | `{ sessionId*: int, records*: [{ studentId: int, status: "present" \| "absent" \| "late" }] }` | `201 { session: ClassSession, records: AttendanceRecord[] }` | Records a whole session at once, all-or-nothing: if any record fails, nothing is saved. `400` invalid record (error names its index), a student listed twice, session doesn't exist, or student(s) not actively enrolled in the session's course and semester; `409` student(s) already marked for this session (error names them). |
| GET | `/api/v1/attendance/session/:sessionId` | — | `200 { session: ClassSession, records: AttendanceRecord[] }` | Records ordered by surname; `[]` if attendance hasn't been taken yet. `400` non-integer id; `404` session not found. |
| GET | `/api/v1/students/:studentId/attendance` | — | `200 { studentId, summary: AttendanceSummary, records: StudentAttendance[] }` | Records newest first. `400` non-integer id; `404` student not found. |
| POST | `/api/v1/grades` | `{ studentId*: int, courseId*: int, semesterId*: int, gradeLetter*: "A" \| "B" \| "C" \| "D" \| "F", gradePoints*: number 0–4 (≤ 2 decimals) }` | `201` Grade (new draft) or `200` Grade (draft corrected) | One grade per student, course and semester; posting again corrects the draft. `400` missing/invalid field, student/course/semester doesn't exist, or student not actively enrolled in that course that semester; `409` the grade is already published (published grades can't change). |
| PUT | `/api/v1/grades/:id/publish` | — | `200` Grade | Sets `published: true` and `published_at`, then publishes `academic.grade.published`. Idempotent: publishing an already-published grade returns `200` and does **not** send the event again. `400` non-integer id; `404` grade not found. |
| GET | `/api/v1/students/:studentId/grades` | — | `200 { studentId, gpa: number \| null, totalCredits: int, grades: StudentGrade[] }` | `gpa`/`totalCredits` count **published** grades only; `gpa` is `null` until one is published. `grades` includes drafts (see `published`). `400` non-integer id; `404` student not found. |

`*` = required.

**Prerequisite rule:** a prerequisite counts as met if the student has a non-dropped enrollment in it in a semester that **ended before the target semester starts**. Grades aren't tracked yet, so "enrolled" is treated as "completed"; this will change once grades exist.

**Program:** `{ id, name, description, created_at }`

**Course:** `{ id, program_id, code, title, description, credit_hours, created_at, prerequisites? }`, where `prerequisites` is `[{ id, code, title, credit_hours }]`.

**Enrollment:** `{ id, student_id, course_id, semester_id, status: "enrolled" | "dropped", enrolled_at }`

**StudentEnrollment:** Enrollment plus `course_code`, `course_title`, `semester_name`.

**ClassSession:** `{ id, course_id, semester_id, session_date: "YYYY-MM-DD", start_time: "HH:MM:SS", end_time: "HH:MM:SS", created_at }`

**AttendanceRecord:** `{ id, student_id, first_name, last_name, status, recorded_at }`

**StudentAttendance:** `{ id, session_id, session_date, start_time, end_time, course_id, course_code, course_title, semester_id, semester_name, status, recorded_at }`

**AttendanceSummary:** `{ totalSessions, presentSessions, lateSessions, percentage: number | null }`. `percentage = presentSessions / totalSessions × 100`, rounded to 2 decimals; `null` if there are no sessions yet. It counts sessions of courses the student is actively enrolled in (dropped courses excluded) where attendance has been taken; a student left off a taken register counts as not present. `late` does **not** count as present.

**Grade:** `{ id, student_id, course_id, semester_id, grade_letter, grade_points: number, published: boolean, published_at: timestamp | null, created_at }`

**StudentGrade:** Grade plus `course_code`, `course_title`, `credit_hours`, `semester_name`.

**GPA:** `Σ(grade_points × credit_hours) / Σ(credit_hours)` over published grades, rounded to 2 decimals. F (0.00) grades count.

## Publishes (RabbitMQ)

All events go to the durable **topic** exchange `school-events`, with the event name as the routing key. Messages are JSON (`content-type: application/json`) and persistent.

| Event name | Payload fields | Consumed by |
|---|---|---|
| `academic.student.enrolled` | `studentId`: int, `courseId`: int, `semesterId`: int, `enrolledAt`: ISO-8601 UTC string, `tuitionAmount`: number (flat rate from `TUITION_AMOUNT` for now; per-course later) | Finance (creates invoice), Notifications |
| `academic.grade.published` | `studentId`: int, `courseId`: int, `semesterId`: int, `gradeLetter`: "A" \| "B" \| "C" \| "D" \| "F", `publishedAt`: ISO-8601 UTC string | Notifications |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| | |

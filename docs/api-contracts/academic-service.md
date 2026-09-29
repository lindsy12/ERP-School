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

`*` = required.

**Prerequisite rule:** a prerequisite counts as met if the student has a non-dropped enrollment in it in a semester that **ended before the target semester starts**. Grades aren't tracked yet, so "enrolled" is treated as "completed"; this will change once grades exist.

**Program:** `{ id, name, description, created_at }`

**Course:** `{ id, program_id, code, title, description, credit_hours, created_at, prerequisites? }`, where `prerequisites` is `[{ id, code, title, credit_hours }]`.

**Enrollment:** `{ id, student_id, course_id, semester_id, status: "enrolled" | "dropped", enrolled_at }`

**StudentEnrollment:** Enrollment plus `course_code`, `course_title`, `semester_name`.

## Publishes (RabbitMQ)

All events go to the durable **topic** exchange `school-events`, with the event name as the routing key. Messages are JSON (`content-type: application/json`) and persistent.

| Event name | Payload fields | Consumed by |
|---|---|---|
| `academic.student.enrolled` | `studentId`: int, `courseId`: int, `semesterId`: int, `enrolledAt`: ISO-8601 UTC string, `tuitionAmount`: number (flat rate from `TUITION_AMOUNT` for now; per-course later) | Finance (creates invoice), Notifications |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| | |

# academic-service contract

## REST endpoints

Base URL: `http://localhost:3000` (the gateway), which forwards `/api/v1/academic/*` unchanged to `academic-service:4002`. Every `/api/v1/academic` call needs `Authorization: Bearer <token>`; the service reads the caller from the gateway's `x-user-id` / `x-user-role` headers (`401` without them). Students may read and file grade appeals; every other `POST`/`PUT`/`DELETE` needs `SUPER_ADMIN`, `ADMIN` or `STAFF` (`403` otherwise). Web pages are served at `/academic/`.
Every error response has the shape `{ "error": "message" }`. A request body that isn't valid JSON returns `400`.

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| GET | `/health` | — | `200 { status, service, db }` | `500` if the DB is unreachable. |
| POST | `/api/v1/academic/programs` | `{ name*: string, description?: string }` | `201` Program | `400` missing/invalid `name`; `409` a program with that name already exists. |
| GET | `/api/v1/academic/programs` | — | `200` Program[] | Ordered by `id`. Empty array if none. |
| POST | `/api/v1/academic/courses` | `{ program_id*: int, code*: string(≤20), title*: string(≤200), credit_hours*: int 1–255, description?: string, prerequisite_ids?: int[] }` | `201` Course (with `prerequisites`) | Course and prerequisite links are saved in one transaction. `400` missing/invalid field, `program_id` doesn't exist, or unknown prerequisite id(s); `409` duplicate `code`. |
| GET | `/api/v1/academic/courses` | — | `200` Course[] (without `prerequisites`) | Ordered by `id`. Use GET `/:id` for prerequisites. |
| GET | `/api/v1/academic/courses/:id` | — | `200` Course (with `prerequisites`) | `400` non-integer id; `404` not found. |
| PUT | `/api/v1/academic/courses/:id` | Same as POST | `200` Course (with `prerequisites`) | Full replace of course fields. If `prerequisite_ids` is sent it **replaces** the list (`[]` clears it); if omitted, prerequisites are unchanged. `400` invalid input or course listed as its own prerequisite; `404` not found; `409` duplicate `code`. |
| DELETE | `/api/v1/academic/courses/:id` | — | `204` (no body) | Also removes this course's own prerequisite links. `404` not found; `409` another course still lists it as a prerequisite. |
| POST | `/api/v1/academic/enrollments` | `{ studentId*: int, courseId*: int, semesterId*: int }` | `201` Enrollment | Publishes `academic.student.enrolled` after the row is saved. `400` missing/invalid field or student/course/semester doesn't exist; `409` prerequisites not met (body also has `missingPrerequisites: [{ id, code, title }]`) or already enrolled in this course this semester; `500` if `TUITION_AMOUNT` isn't configured (nothing is saved). If RabbitMQ is down the enrollment still succeeds and the missed event is logged. |
| GET | `/api/v1/academic/students/:studentId/enrollments` | — | `200` StudentEnrollment[] | Includes dropped enrollments. Ordered by semester start date, then course code. `400` non-integer id; `404` student not found; `[]` if the student has no enrollments. |
| POST | `/api/v1/academic/sessions` | `{ courseId*: int, semesterId*: int, sessionDate*: "YYYY-MM-DD", startTime*: "HH:MM[:SS]", endTime*: "HH:MM[:SS]" }` | `201` ClassSession | `400` missing/invalid field, `endTime` not after `startTime`, course/semester doesn't exist, or date outside the semester; `409` a session for that course, semester, date and start time already exists. |
| POST | `/api/v1/academic/attendance` | `{ sessionId*: int, records*: [{ studentId: int, status: "present" \| "absent" \| "late" }] }` | `201 { session: ClassSession, records: AttendanceRecord[] }` | Records a whole session at once, all-or-nothing: if any record fails, nothing is saved. `400` invalid record (error names its index), a student listed twice, session doesn't exist, or student(s) not actively enrolled in the session's course and semester; `409` student(s) already marked for this session (error names them). After saving, re-checks each listed student's at-risk status (may publish `academic.student.at_risk_flagged`). |
| GET | `/api/v1/academic/attendance/session/:sessionId` | — | `200 { session: ClassSession, records: AttendanceRecord[] }` | Records ordered by surname; `[]` if attendance hasn't been taken yet. `400` non-integer id; `404` session not found. |
| GET | `/api/v1/academic/students/:studentId/attendance` | — | `200 { studentId, summary: AttendanceSummary, records: StudentAttendance[] }` | Records newest first. `400` non-integer id; `404` student not found. |
| POST | `/api/v1/academic/grades` | `{ studentId*: int, courseId*: int, semesterId*: int, gradeLetter*: "A" \| "B" \| "C" \| "D" \| "F", gradePoints*: number 0–4 (≤ 2 decimals) }` | `201` Grade (new draft) or `200` Grade (draft corrected) | One grade per student, course and semester; posting again corrects the draft. `400` missing/invalid field, student/course/semester doesn't exist, or student not actively enrolled in that course that semester; `409` the grade is already published (published grades can't change). |
| PUT | `/api/v1/academic/grades/:id/publish` | — | `200` Grade | Sets `published: true` and `published_at`, then publishes `academic.grade.published`. Idempotent: publishing an already-published grade returns `200` and does **not** send the event again. On a real publish, also re-checks the student's at-risk status (may publish `academic.student.at_risk_flagged`). `400` non-integer id; `404` grade not found. |
| GET | `/api/v1/academic/students/:studentId/grades` | — | `200 { studentId, gpa: number \| null, totalCredits: int, grades: StudentGrade[] }` | `gpa`/`totalCredits` count **published** grades only; `gpa` is `null` until one is published. `grades` includes drafts (see `published`). `400` non-integer id; `404` student not found. |
| GET | `/api/v1/academic/students/:studentId/at-risk` | — | `200 { studentId, isAtRisk: boolean, reasons: string[], details: { attendancePercentage: number \| null, lastTwoPublishedGrades: [{ gradeId, courseCode, semesterName, gradeLetter, publishedAt }] }, storedFlag: AtRiskFlag \| null }` | Evaluated **live** from current attendance and grades, so it's accurate even if an automatic check was missed. `storedFlag` is the last state the automatic checks saved (`null` if never checked). Read-only: it doesn't update the stored flag or send events. `400` non-integer id; `404` student not found. |
| GET | `/api/v1/academic/at-risk-students` | — | `200` AtRiskStudent[] | Students whose **stored** flag is at risk, most recently flagged first; `[]` if none. For advisors. |
| POST | `/api/v1/academic/exams` | `{ courseId*: int, semesterId*: int, examDate*: "YYYY-MM-DD", startTime*: "HH:MM[:SS]", endTime*: "HH:MM[:SS]", room*: string(≤50) }` | `201` Exam | Checks for room conflicts before saving (see **Exam conflict rule**). `400` missing/invalid field, `endTime` not after `startTime`, course/semester doesn't exist, or date outside the semester; `409` overlaps existing exam(s) in that room and date: nothing is saved, and the body has `error` naming each clash (course code + time range) plus `conflicts: Exam[]`; `503` the room's booking lock was busy for over 5 s (retry). |
| GET | `/api/v1/academic/exams` | — | `200` Exam[] | Optional query filters `?semesterId=` and `?courseId=` (combinable). Ordered by date, start time, room. `400` if a filter is present but not a positive integer. |
| GET | `/api/v1/academic/exams/:id` | — | `200` Exam | `400` non-integer id; `404` not found. |
| PUT | `/api/v1/academic/exams/:id` | Same as POST | `200` Exam | Full replace. Re-runs the conflict check against the new room/date/times, **excluding this exam itself**. On `409` the exam is left unchanged. `400` / `409` / `503` as POST; `404` not found. |
| DELETE | `/api/v1/academic/exams/:id` | — | `204` (no body) | Frees the room slot. `400` non-integer id; `404` not found. |
| GET | `/api/v1/academic/semesters` | — | `200` Semester[] | Ordered by start date. Dates as `YYYY-MM-DD`. |
| POST | `/api/v1/academic/semesters` | `{ name*: string(≤50), startDate*: "YYYY-MM-DD", endDate*: "YYYY-MM-DD" }` | `201` Semester | `400` missing/invalid field or `endDate` before `startDate`; `409` duplicate name. |
| GET | `/api/v1/academic/students` | — | `200` Student[] | Ordered by last name. |
| POST | `/api/v1/academic/students` | `{ firstName*: string, lastName*: string, email*: string }` | `201` Student | `400` missing/invalid field; `409` duplicate email. |
| GET | `/api/v1/academic/instructors/me/offerings` | — | `200` Offering[] `{ course_id, course_code, course_title, credit_hours, semester_id, semester_name, semester_start, semester_end, enrolled_count }` | Courses have no instructor yet, so this lists every course/semester pair with enrolled students. |
| GET | `/api/v1/academic/courses/:courseId/roster?semesterId=` | — | `200` `[{ student_id, first_name, last_name, email, matric_number }]` | Actively enrolled students, by surname. `400` invalid ids. |
| GET | `/api/v1/academic/sessions?courseId=&semesterId=` | — | `200` ClassSession[] with `attendance_count` | `400` invalid ids. |
| GET | `/api/v1/academic/grades?courseId=&semesterId=` | — | `200` Grade[] | Drafts and published grades of one offering. `400` invalid ids. |

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

**At-risk rule:** a student is at risk if EITHER (a) their attendance percentage (AttendanceSummary) is **below 75**, reason `attendance_below_75`, OR (b) their two most recent **published** grades by `published_at` (ties broken by newest grade id) are **both** `F`, reason `two_consecutive_fails`. A `null` percentage (no sessions yet) doesn't trigger (a), exactly 75 is not at risk, and fewer than two published grades doesn't trigger (b). Checks run automatically after each attendance batch and each real grade publish; the stored flag changes on every check, but the event is only sent on a transition **into** at-risk.

**AtRiskFlag:** `{ id, student_id, is_at_risk: boolean, reasons: string[], flagged_at: timestamp | null, cleared_at: timestamp | null }`. `flagged_at` is when the most recent at-risk period started; `cleared_at` is when it ended (`null` while still at risk).

**AtRiskStudent:** `{ student_id, first_name, last_name, email, flagged_at, reasons: string[] }`

**Exam:** `{ id, course_id, course_code, course_title, semester_id, semester_name, exam_date: "YYYY-MM-DD", start_time: "HH:MM:SS", end_time: "HH:MM:SS", room, created_at }`

**Exam conflict rule:** two exams conflict if they're in the **same room** (case-insensitive, surrounding spaces ignored), on the **same date**, and their time ranges overlap. Ranges are half-open `[start, end)`, and `[s1, e1)` overlaps `[s2, e2)` when `s1 < e2 AND s2 < e1`. So partial overlaps, one exam inside another, and one exam surrounding another all conflict, but **back-to-back exams do not** (09:00–11:00 then 11:00–13:00 is fine). Semester and course don't matter to a room clash. Bookings for the same room are serialised with a lock, so two simultaneous requests can't double-book it.

## Publishes (RabbitMQ)

All events go to the durable **topic** exchange `school-events`, with the event name as the routing key. Messages are JSON (`content-type: application/json`) and persistent.

| Event name | Payload fields | Consumed by |
|---|---|---|
| `academic.student.enrolled` | `studentId`: int, `courseId`: int, `semesterId`: int, `enrolledAt`: ISO-8601 UTC string, `tuitionAmount`: number (flat rate from `TUITION_AMOUNT` for now; per-course later) | Finance (creates invoice), Notifications |
| `academic.grade.published` | `studentId`: int, `courseId`: int, `semesterId`: int, `gradeLetter`: "A" \| "B" \| "C" \| "D" \| "F", `publishedAt`: ISO-8601 UTC string | Notifications |
| `academic.student.at_risk_flagged` | `studentId`: int, `reasons`: string[] (`"attendance_below_75"` and/or `"two_consecutive_fails"`), `flaggedAt`: ISO-8601 UTC string. Sent once per **transition into** at-risk, not on every re-check; a student who recovers and becomes at risk again triggers a new event. | Notifications |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| | |

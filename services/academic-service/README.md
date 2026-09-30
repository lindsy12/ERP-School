# Academic Service

**Owner:** Person A

Owns: courses, grades, attendance, exam scheduling, at-risk-student flag, transcript export (PDF).

## Publishes (RabbitMQ)
- `academic.student.enrolled` — when a student enrolls in a course. Consumed by Finance (creates invoice) and Notifications.
- `academic.grade.published` — when results are published. Consumed by Notifications.
- `academic.student.at_risk_flagged` — when a student crosses the at-risk threshold. Consumed by Notifications.

## Owns its own database
`academic_db` — see docker-compose.yml. No other service touches these tables directly.

## Setup
1. Copy `.env.example` to `.env` and fill in real values (`TUITION_AMOUNT` is required for enrolment).
2. `npm install`
3. `npm run dev`

The tables in `src/db/schema.sql` are created at startup. For a demo, `npm run seed` (in Docker:
`docker compose exec academic-service npm run seed`) adds a program, four courses, two semesters,
ten students and their Fall 2026 enrolments; it does nothing if programs already exist.

## Access and pages
All routes are under `/api/v1/academic` and are called through the gateway. The caller comes from the
gateway's `x-user-id` / `x-user-role` / `x-user-email` headers (`401` without them). Each role has its own
rules and pages (see "Who may do what" in `docs/api-contracts/academic-service.md`):

- **Students** use `student-portal.html`: dashboard, course registration, courses, published grades with
  appeals and transcript PDF, attendance, exam timetable. A STUDENT sign-in account is linked to its
  student record by **email**: create the record on the Registrar page, then a STUDENT account with the
  same email on the Users page (`/auth/#/users`).
- **Staff** (lecturers) use `instructor-grading.html` (grades, registers, appeals) and see the exam
  timetable read-only.
- **Administrators** also get `registrar.html` (students, enrolment, programs, courses, semesters) and
  schedule exams on `exams.html`.

## Endpoints
See `docs/api-contracts/academic-service.md` for the full REST contract.

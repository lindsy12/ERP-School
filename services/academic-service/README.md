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
gateway's `x-user-id` / `x-user-role` headers (`401` without them). Students may read and file grade
appeals; other changes need `SUPER_ADMIN`, `ADMIN` or `STAFF`.

Pages (`client/`) are served at `/academic/`: grading & attendance and the exam timetable use the real
API with the ERP's shared sign-in; the student portal still shows sample data.

## Endpoints
See `docs/api-contracts/academic-service.md` for the full REST contract.

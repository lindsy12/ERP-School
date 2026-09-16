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
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev`

## Endpoints
See `docs/api-contracts/academic-service.md` for the full REST contract.

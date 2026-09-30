# Notification Service

**Owner:** Person D

Owns: consuming events from every other service and turning them into something a human sees.
Core (build first): in-app notifications — write a row to `notification_db`, expose
`GET /notifications` for the logged-in user to fetch their alerts.
Stretch (only after the core rubric is covered): real email via Nodemailer + a free SMTP provider.

## Subscribes (RabbitMQ)
- `academic.student.enrolled`
- `academic.grade.published`
- `academic.student.at_risk_flagged`
- `finance.invoice.created`
- `finance.payment.received`
- `hr.leave.approved`
- `hr.leave.rejected`
- `hr.payroll.processed`

## Owns its own database
`notification_db` — `notifications` (audience, optional userId, title, message, createdAt) and `notification_reads` (who has read what).

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev` (creates the tables at startup; `npm run migrate` does it alone)

Who sees what: events name students and employees by their ids in other services, not by login account,
so notifications go to an audience of roles (`STAFF` or `ADMINS`, see `src/services/audiences.js`), and
each user has their own read/unread state. The page is served at `/notifications/`.

## Endpoints
See `docs/api-contracts/notification-service.md` for the full REST contract.

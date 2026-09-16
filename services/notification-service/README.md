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
`notification_db` — a simple table: userId, message, read (bool), createdAt.

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev`

## Endpoints
See `docs/api-contracts/notification-service.md` for the full REST contract.

# Marketing & Finance Service

**Owner:** Person B

Owns: tuition invoices, payment tracking, mobile-money mock integration, expense tracking,
marketing campaign tracking (leads, conversions, ROI), monthly financial reports (FCFA).

## Subscribes (RabbitMQ)
- `academic.student.enrolled` — creates a tuition invoice for the newly enrolled student.

## Publishes (RabbitMQ)
- `finance.invoice.created` — consumed by Notifications.
- `finance.payment.received` — consumed by Notifications (digital receipt).

## Owns its own database
`finance_db` — see docker-compose.yml. No other service touches these tables directly.

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev`

## Endpoints
See `docs/api-contracts/finance-service.md` for the full REST contract.

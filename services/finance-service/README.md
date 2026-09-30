# Marketing & Finance Service

**Owner:** Person B

Owns: tuition invoices, payment tracking, mock mobile-money integration, expense tracking,
marketing campaign tracking (leads, conversions, ROI), and monthly financial reports (FCFA).

## Events

Subscribes to:
- `academic.student.enrolled` — creates a tuition invoice.

Publishes:
- `finance.invoice.created` — consumed by Notifications.
- `finance.payment.received` — consumed by Notifications.

## Local setup

1. Make sure `finance-db` and RabbitMQ are running.
2. Copy `.env.example` to `.env` if needed.
3. Run `npm install`.
4. Run `npm run migrate`.
5. Run `npm run dev`.

The local finance service runs on port `4003` and connects to the Docker MySQL mapping
`localhost:3308`.

## Main endpoints

- `/health`
- `/api/v1/finance/invoices`
- `/api/v1/finance/payments`
- `/api/v1/finance/payments/momo`
- `/api/v1/finance/expenses`
- `/api/v1/finance/campaigns`
- `/api/v1/finance/reports/monthly?month=&year=`
- `/api/v1/finance/docs`

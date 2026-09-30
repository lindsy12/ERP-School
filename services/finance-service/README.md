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

## Web pages

The Finance UI is a React/Vite app in `client-app/`. It is built into `client/` (the Docker image
does this) and served by this service at `/finance/`, so through the gateway it is
`http://localhost:3000/finance/`, the Finance card on the ERP home page. It uses the ERP's shared
sign-in (`/auth/js/session.js`) and calls `/api/v1/finance/*` through the gateway.

To work on the UI with hot reload: start the system (`docker compose up`), then in `client-app/`
run `npm install` and `npm run dev`, and open http://localhost:5173/finance/. Vite forwards `/api`
and `/auth` to the gateway on port 3000.

## Access

Only `SUPER_ADMIN`, `ADMIN` and `STAFF` may use the API (`403` for students). The caller comes from
the gateway's `x-user-id` / `x-user-role` headers (`401` without them), so call it through the gateway.

## Local setup

In Docker nothing is needed: tables are created at startup. To run the service on your machine:

1. Make sure `finance-db` and RabbitMQ are running.
2. Copy `.env.example` to `.env` if needed.
3. Run `npm install`, and `npm run build:client` for the pages.
4. Run `npm run dev` (it runs the migrations at startup; `npm run migrate` does it alone).

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

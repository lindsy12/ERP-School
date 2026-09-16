# Administration & HR Service

**Owner:** Person C

Owns: employee management (recruitment, payroll, attendance), leave tracking, performance tracking,
asset/inventory management. Payroll accounts for CNPS contribution and PAYE tax bracket.

## Publishes (RabbitMQ)
- `hr.leave.approved` — consumed by Notifications.
- `hr.leave.rejected` — consumed by Notifications.
- `hr.payroll.processed` — consumed by Notifications.

## Owns its own database
`hr_db` — see docker-compose.yml. No other service touches these tables directly.

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev`

## Endpoints
See `docs/api-contracts/hr-service.md` for the full REST contract.

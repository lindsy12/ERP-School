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
1. Copy `.env.example` to `.env` and fill in real values (`JWT_SECRET` must match auth-service's).
2. `npm install`
3. Start the DB: `docker compose up -d hr-db rabbitmq` (from the repo root).
4. `npm run dev` — listens on `PORT` (default 4004).

## Running tests
Tests run against a **real MySQL** instance (not an in-memory fake) — this needs
`node-gyp`/Python to build a SQLite driver, which isn't reliably available on
every machine, and SQLite's SQL semantics diverge from MySQL's in ways that can
mask real bugs (ENUM handling, GROUP BY strictness, etc).

1. `docker compose up -d hr-db` (publishes MySQL on host port `3307`, see root `docker-compose.yml`).
2. Copy `.env.example` to `.env.test` and set:
   ```
   DB_HOST=127.0.0.1
   DB_PORT=3307
   DB_USER=root
   DB_PASSWORD=rootpass
   DB_NAME=hr_db_test
   ```
3. `npm test` — creates `hr_db_test` if it doesn't exist, then resets tables between test files.

CI (`.github/workflows/ci.yml`) runs the same tests against a throwaway MySQL service
container, so no local setup is required for pushes/PRs to pass.

## Endpoints
See `docs/api-contracts/hr-service.md` for the full REST contract (base path `/api/v1/hr`).

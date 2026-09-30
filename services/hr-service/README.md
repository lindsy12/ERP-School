# Administration & HR Service

**Owner:** Person C

Owns: employee management (recruitment, payroll, attendance), leave tracking, performance tracking,
asset/inventory management. Payroll accounts for CNPS contribution and PAYE tax bracket. Ships its
own frontend in `client/` (plain HTML/CSS/JS, no build step).

Multi-tenant: every table is scoped by `tenantId` (the school), taken from the gateway's
`x-tenant-id` header (or a dev JWT's `tenant_id` claim) — see `docs/api-contracts/hr-service.md`.

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

## Running the real way — through the gateway

This is the actual path end users take, and it's been verified working end-to-end (real
password login, a real admin-created STAFF account logging in for itself, real HR data, zero
direct access to hr-service's own port). Both databases are intentionally empty (no demo data —
see "About the data" below), so this bootstraps a genuinely fresh school:

```bash
docker compose up -d --build             # whole stack: dbs, rabbitmq, auth-service, hr-service, gateway

# One-time: put YOUR OWN tenant id / email / password in services/auth-service/.env's
# SEED_TENANT_ID / SEED_SUPERADMIN_EMAIL / SEED_SUPERADMIN_PASSWORD first (any UUID works
# for the tenant id, e.g. `node -e "console.log(crypto.randomUUID())"`).
docker compose exec auth-service npm run migrate
docker compose exec auth-service npm run seed    # creates YOUR first SUPER_ADMIN account
```

Open `http://localhost:3000/hr/` (port **3000**, the gateway — not 4004) and log in with the
tenant id / email / password you just chose. From there, create real employees on the
Employees page, and real login accounts for them via auth-service's `POST
/api/v1/auth/users` (or its own frontend at `/auth/`, if built) — then link each employee to
their account with the "Auth user ID" field so self-service works for them.

The gateway proxies both `/api/v1/hr/*` (needs a token) and `/hr/*` (hr-service's static files,
GET/HEAD only, no token — see `gateway/src/config/services.js`'s `uiPrefix`) straight to
hr-service, which is never itself reachable from outside Docker.

### About the data

`hr_db` and `auth_db` were deliberately wiped of the demo/example data that was here during
development (fabricated employees, attendance, leave, assets, and the one demo `SUPER_ADMIN`
account) so the team can test with real input instead of fake names. `scripts/seed-demo.js`
still exists and is safe to run any time you want realistic-looking demo data back for a
screenshot or a quick check (`docker compose exec hr-service node scripts/seed-demo.js`) — it
refuses to overwrite existing employees, so it won't clobber real data.

## Running the UI without the gateway or auth-service

For working on hr-service in isolation, before auth-service/gateway existed or without running
the whole stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.hr-dev.yml up -d --build
docker compose exec hr-service node scripts/seed-demo.js     # demo employees/attendance/leave/assets
docker compose exec hr-service node scripts/dev-token.js ADMIN
```

Open `http://localhost:4004/hr/`, paste the token under "Use an access token instead". The
`docker-compose.hr-dev.yml` overlay is what publishes hr-service's port to the host — the base
`docker-compose.yml` never does. `scripts/dev-token.js` refuses to run with `NODE_ENV=production`.

## Running tests
Tests run against a **real MySQL** instance (not an in-memory fake) — this needs
`node-gyp`/Python to build a SQLite driver, which isn't reliably available on
every machine, and SQLite's SQL semantics diverge from MySQL's in ways that can
mask real bugs (ENUM handling, GROUP BY strictness, etc).

1. `docker compose up -d hr-db` (publishes MySQL on host port `3309`, see root `docker-compose.yml`).
2. Copy `.env.example` to `.env.test` and set:
   ```
   DB_HOST=127.0.0.1
   DB_PORT=3309
   DB_USER=root
   DB_PASSWORD=rootpass
   DB_NAME=hr_db_test
   ```
3. `npm test` — creates `hr_db_test` if it doesn't exist, then resets tables between test files.

CI (`.github/workflows/ci.yml`) runs the same tests against a throwaway MySQL service
container, so no local setup is required for pushes/PRs to pass.

## Endpoints
See `docs/api-contracts/hr-service.md` for the full REST contract (base path `/api/v1/hr`), including
auth (gateway headers vs. dev JWT), error format, and every event payload.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

School ERP built as microservices for the SEN4121 final exam (team of 5). Mostly a **scaffold**: only `services/auth-service` has code so far (Express 5 + mysql2 + Jest/Supertest, `GET /health`, Dockerfile, enabled in compose). The other services have no `package.json`, `src/`, or `Dockerfile` yet, their compose blocks are commented out, and the API contract files in `docs/api-contracts/` are empty templates. When adding a service's code, also add its `Dockerfile`, uncomment its compose block, and make sure `npm test` works there (CI runs it).

## Commands

Stack is Node.js 20 + MySQL 8 + RabbitMQ (implied by CI and `.env.example` files).

- Whole system: `docker compose up --build` (copy each folder's `.env.example` to `.env` first; `.env` is gitignored)
- One service, from its folder (`gateway/` or `services/<name>/`): `npm install`, then `npm run dev`
- Tests, per service: `npm test` — CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` and then `docker build` for each of the 6 folders on pushes/PRs to `main`, so every service needs a `package-lock.json`, a `test` script, and a `Dockerfile`
- RabbitMQ management UI: http://localhost:15672 (guest/guest)

## Architecture

```
client ──► gateway :3000 ──► auth-service :4001          (auth_db)
                        ├──► academic-service :4002      (academic_db)
                        ├──► finance-service :4003       (finance_db)
                        ├──► hr-service :4004            (hr_db)
                        └──► notification-service :4005  (notification_db)
            services ◄──► RabbitMQ (amqp://rabbitmq:5672) ◄──► services
```

- **Gateway is the only container exposed to the host.** Everything else uses `expose`, reachable only on the Docker network by service name (e.g. `http://auth-service:4001`).
- **Gateway has no business logic.** It routes, verifies JWTs by delegating to Auth Service, rate-limits (`RATE_LIMIT_*` env), and forwards `x-user-id` / `x-user-role` headers downstream. Business rules belong in the owning service.
- **Downstream services trust the forwarded `x-user-id` / `x-user-role` headers** for identity and RBAC. They never query auth tables.
- **Database-per-service:** a service must never read another service's tables. Cross-service data flows only via REST through the Gateway or via RabbitMQ events.
- Auth Service handles bcrypt hashing, access and refresh tokens with rotation (`JWT_SECRET`, `ACCESS_TOKEN_MINUTES=15`, `REFRESH_TOKEN_DAYS=7`), account lockout, and RBAC roles. User classes: Super Admin, Admin, Staff, Student.
- Each service folder has `src/` (backend) and `client/` (that module's own frontend pages).

### Events

Names follow `domain.entity.action`, with the action in past tense. Current event map, from the service READMEs:

| Event | Publisher | Consumers |
|---|---|---|
| `academic.student.enrolled` | academic | finance (creates tuition invoice), notification |
| `academic.grade.published` | academic | notification |
| `academic.student.at_risk_flagged` | academic | notification |
| `finance.invoice.created` | finance | notification |
| `finance.payment.received` | finance | notification (digital receipt) |
| `hr.leave.approved` / `hr.leave.rejected` | hr | notification |
| `hr.payroll.processed` | hr | notification |

Record event payload fields and REST endpoints in `docs/api-contracts/<service>.md` **before** building the consumer side. If you add or change an event, update the publisher's README, the notification-service README, and the contract files.

### Domain notes
- Finance amounts are in **FCFA**. Mobile-money payments use a mock integration.
- HR payroll must account for **CNPS** contributions and **PAYE** tax brackets.
- Notification core is in-app only: a table of `userId, message, read, createdAt` plus `GET /notifications`. Email via Nodemailer/SMTP is a stretch goal; leave it until the core rubric is covered.

## Team conventions

- Folder ownership: A = academic, B = finance, C = hr, D = auth + gateway + notification, E = CI, compose, and `docs/`. Keep changes within the folder the task is about unless the task is explicitly cross-service.
- Branches: `<type>/<service>-<short-description>`. The type is `feature|fix|chore|docs` and the service is `academic|finance|hr|auth|gateway|notification|devops`. Cross-service work is named by the workflow instead, e.g. `feature/enrollment-invoice-event`.
- No direct pushes to `main`; all changes go through a reviewed PR.
- Docs: `docs/srs.md` follows ISO/IEC/IEEE 29148. The SRS plus the technical report must stay under 20 pages. UML diagrams go in `docs/uml/`.

# School ERP — SEN4121 Final Examination Project

Microservices ERP system for Academic, Marketing & Finance, and Administration & HR modules.
Built by a team of 5 for the SEN4121 Large System Environment final exam.

## Architecture at a glance

- **API Gateway** — single entry point, routes to all services, handles auth delegation + rate limiting
- **Auth Service** — login, JWT issuing/verification, RBAC
- **Academic Service** — courses, grades, attendance, exams (own database)
- **Marketing & Finance Service** — invoices, payments, campaigns (own database)
- **Administration & HR Service** — employees, payroll, leave (own database)
- **Notification Service** — consumes events from RabbitMQ, delivers in-app (and later, optionally, email) notifications
- **RabbitMQ** — message broker connecting services asynchronously (e.g. `academic.student.enrolled` → Finance creates an invoice)

Each service owns its own database schema. No service reads another service's tables directly —
cross-service communication only happens via the Gateway's REST calls or RabbitMQ events.

## Team ownership

| Person | Owns | Folder(s) | Rubric marks |
|---|---|---|---|
| A | Academic Service (+ its frontend) | `services/academic-service/` | Academic Module (8) |
| B | Marketing & Finance Service (+ its frontend) | `services/finance-service/` | Finance Module (8) |
| C | Administration & HR Service (+ its frontend) | `services/hr-service/` | HR Module (8) |
| D | Auth Service, API Gateway, Notification Service | `services/auth-service/`, `gateway/`, `services/notification-service/` | Auth (6), Microservices & API Integration (7) |
| E | DevOps, Testing, Docs | `.github/workflows/`, `docker-compose.yml`, `docs/` | DevOps (6), Testing & QA (4), Non-Functional Reqs (5), SRS & UML (7) |

Each service folder has a `src/` (backend) and `client/` (that service's own frontend pages) subfolder.

## Event naming convention

`domain.entity.action` — always past tense on the action, since it announces something that already happened.

Examples:
- `academic.student.enrolled`
- `finance.invoice.created`
- `hr.leave.approved`

Agree on exact payload fields for every event in `docs/api-contracts/` **before** building the consumer side.

## Branch naming

`<type>/<service>-<short-description>`

- **type**: `feature`, `fix`, `chore`, `docs`
- **service**: `academic`, `finance`, `hr`, `auth`, `gateway`, `notification`, `devops`

Examples: `feature/academic-course-crud`, `fix/finance-invoice-total`, `chore/devops-ci-pipeline`, `docs/srs-consolidation`

For a change that spans two services (e.g. the enrollment→invoice event), name it by the workflow instead: `feature/enrollment-invoice-event`.

## Git workflow

**One-time setup** (repo owner):
```bash
git init
git add .
git commit -m "Initial repo structure"
git remote add origin <YOUR_REPO_URL>
git push -u origin main
```
Then add the other 4 teammates as collaborators on GitHub (Settings → Collaborators).

**Everyone, once:**
```bash
git clone <YOUR_REPO_URL>
cd school-erp
```

**Starting new work:**
```bash
git checkout main
git pull
git checkout -b feature/<service>-<short-description>
```

**While working:**
```bash
git add .
git commit -m "Add course CRUD endpoints"
git push -u origin feature/<service>-<short-description>
```

**Finishing:** open a Pull Request on GitHub, assign a teammate to review, merge only after approval.
Nobody pushes directly to `main`.

## Running the whole system locally

```bash
docker compose up --build
```

See `docker-compose.yml` for ports and service names. Copy `.env.example` to `.env` in each service
folder and fill in real values before running — `.env` files are gitignored on purpose.

## Docs

- `docs/srs.md` — Software Requirements Specification
- `docs/uml/` — use-case, class, sequence, ERD, deployment diagrams
- `docs/api-contracts/` — REST endpoint + RabbitMQ event contracts for every service, agreed before coding

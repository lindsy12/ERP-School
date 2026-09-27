# hr-service contract

Base path: `/api/v1/hr` (versioned per the brief's API-versioning requirement — note this
is a `v1` prefix vs. the plain `/api/hr` used in the team's original user-story draft).

## Auth

Every route except `GET /health` requires identity, from one of two places (see
`src/middleware/auth.js`):

1. **The API Gateway** (the real path, in production and in the demo) — it has already
   verified the token against auth-service and forwards `x-user-id` (UUID), `x-user-role`
   (`SUPER_ADMIN` / `ADMIN` / `STAFF` / `STUDENT`) and `x-tenant-id` (UUID) per
   `docs/gateway.md`. hr-service trusts these headers outright; it never sees the raw token.
2. **`Authorization: Bearer <jwt>`, verified directly** with the shared `JWT_SECRET` —
   **dev-only**, for working on hr-service without the gateway or auth-service running.
   Claims mirror auth-service's access token: `{ sub, role, tenant_id }` (see
   `docs/api-contracts/auth-service.md`). Mint one with
   `npm run dev-token -- <ROLE> [tenantId] [userId]`.

**Multi-tenant:** every table has a `tenantId` column and every query is scoped by
`req.user.tenantId`. A record from another tenant is reported as 404, identically to a
record that doesn't exist — its existence must not leak across tenants.

**Self-service linkage:** `employeeId` is hr-service's own concept — auth-service knows
nothing about it. It's resolved on every request by looking up `Employee.userId ===
req.user.id` (scoped by tenant). An HR manager links an account by setting the "Auth user
ID" field on the employee record (`PUT/POST /employees` `userId`, an auth-service UUID).

"HR Manager" in the user stories maps to roles `ADMIN` and `SUPER_ADMIN` (the brief's
canonical role list has no separate HR role).

## REST endpoints

| Method | Path | Auth | Request body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/employees` | ADMIN/SUPER_ADMIN | firstName, lastName, email, phone?, department, role, hireDate, baseSalary, userId? | 201 Employee | matricule auto-generated `EMP<year>-<seq>` per tenant; audit-logged |
| GET | `/employees?search=&department=&status=&page=&limit=` | ADMIN/SUPER_ADMIN | — | 200 `{data,total,page,limit,totalPages}` | paginated, 10/page default |
| GET | `/employees/me` | any authenticated | — | 200 Employee | the caller's own linked record; 404 if unlinked |
| GET | `/employees/:id` | ADMIN/SUPER_ADMIN | — | 200 Employee | |
| PUT | `/employees/:id` | ADMIN/SUPER_ADMIN | any field except matricule | 200 Employee | |
| DELETE | `/employees/:id` | ADMIN/SUPER_ADMIN | — | 200 `{message, employee}` | soft delete → status=inactive |
| GET | `/attendance/qr/:employeeId` | self or manager | — | 200 `{employeeId, image, qrData}` | base64 PNG, regenerates daily |
| POST | `/attendance/checkin` | any authenticated | qrData, location? | 201 `{message, attendance}` | 409 if already checked in; late after 08:30 |
| POST | `/attendance/checkout` | any authenticated | employeeId? (manager only; else from token) | 200 `{message, attendance}` | 400 if no check-in on record |
| GET | `/attendance/my?month=&year=` | self | — | 200 `{employeeId, calendar[]}` | present/late/absent/leave/weekend |
| GET | `/attendance/my/:employeeId?month=&year=` | self or manager | — | 200 same as above | manager view of a specific employee |
| POST | `/leaves` | any authenticated | employeeId? (manager only; else from token), type, startDate, endDate, reason?, attachmentUrl? | 201 Leave | days = business days excl. weekends; 400 if balance insufficient (annual only) |
| GET | `/leaves/my` | any authenticated | — | 200 Leave[] | the caller's own requests |
| GET | `/leaves?status=&employeeId=` | ADMIN/SUPER_ADMIN | — | 200 Leave[] | |
| GET | `/leaves/calendar?month=&year=` | ADMIN/SUPER_ADMIN | — | 200 `{month, year, leaves[]}` | approved leaves overlapping the month |
| GET | `/leaves/balance/:employeeId?year=` | self or manager | — | 200 `{annual:{total,used,remaining}, sick:{used}, ...}` | resets Jan 1 (new year = new balance row) |
| PUT | `/leaves/:id/approve` | ADMIN/SUPER_ADMIN | — | 200 Leave | approver is always the caller (never client-supplied); deducts balance; publishes `hr.leave.approved` |
| PUT | `/leaves/:id/reject` | ADMIN/SUPER_ADMIN | rejectionReason (required) | 200 Leave | publishes `hr.leave.rejected` |
| POST | `/payroll/generate` | ADMIN/SUPER_ADMIN | month, year | 201 `{payroll, items[]}` | 409 if already generated for that period |
| GET | `/payroll?month=&year=` | ADMIN/SUPER_ADMIN | — | 200 `{payroll, items[]}` | |
| GET | `/payroll/my` | any authenticated | — | 200 `[{id, month, year, net, paidAt}]` | the caller's own paid payslips |
| PUT | `/payroll/item/:itemId` | ADMIN/SUPER_ADMIN | bonus?, deductions? | 200 PayrollItem | 409 if parent payroll already paid |
| PUT | `/payroll/:id/pay` | ADMIN/SUPER_ADMIN | — | 200 `{message, payroll}` | locks edits; publishes `hr.payroll.processed` |
| GET | `/payroll/payslip/:itemId` | self (owner of item) or manager | — | 200 `application/pdf` | 403 until payroll status = paid |
| POST/GET/PUT/DELETE | `/assets` | ADMIN/SUPER_ADMIN (GET: any authenticated) | name, category, serialNumber, status, assignedTo?, purchaseDate?, value? | Asset(s) | minimal inventory tracking; `assignedTo` must be an employee in the caller's own tenant |
| GET | `/dashboard/stats` | ADMIN/SUPER_ADMIN | — | 200 `{cards, charts}` | totals, today's attendance breakdown, 7-day trend, per-department counts |
| GET | `/health` | none | — | 200/503 `{service, status, db, timestamp}` | liveness + DB check |

### Error format (all endpoints)

Same convention as every service in the system (see root `CLAUDE.md`):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request is invalid",
             "details": [{ "field": "email", "message": "\"email\" must be a valid email" }] } }
```

`details` appears only on `VALIDATION_ERROR`. Codes used: `VALIDATION_ERROR`, `UNAUTHORIZED`,
`INVALID_TOKEN`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_QR`, `INVALID_JSON`,
`PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`.

## Payroll calculation (configurable, simplified — see `src/config/payrollConfig.js`)

- `cnpsEmployee = min(baseSalary * 0.042, 27500)` (PVID employee contribution, ceiling in FCFA)
- `taxable = baseSalary - cnpsEmployee`
- `paye` = marginal IRPP over configurable brackets (0% / 10% / 15% / 25% / 35%)
- `net = baseSalary - cnpsEmployee - paye + bonus - deductions`

These are published-rate approximations for exam purposes, explicitly flagged as
simplified/configurable per the brief — verify against the current CNPS/DGI schedule
before citing exact figures in the defense.

## Publishes (RabbitMQ, exchange `erp.events`, topic routing key = event name)

| Event name | Payload fields | Consumed by |
|---|---|---|
| `hr.leave.approved` | tenantId, leaveId, employeeId, type, startDate, endDate, message | Notification service |
| `hr.leave.rejected` | tenantId, leaveId, employeeId, rejectionReason, message | Notification service |
| `hr.payroll.processed` | tenantId, payrollId, month, year, employeeCount, totalNet | Notification service (and Finance, if it wants to reconcile) |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| _(none yet)_ | HR currently has no cross-service consumers; add here if Finance/Academic events should trigger HR-side effects |

## Frontend

`client/` is a plain HTML/CSS/JS app (no build step), served by hr-service itself at `/hr/`
in dev (`docker-compose.hr-dev.yml` publishes it to the host; behind the gateway it would be
proxied at the same path). Login posts to `/api/v1/auth/login` with `{ tenant_id, email,
password }` and stores the returned `access_token`. See `client/js/api.js` for the request
helper and `scripts/dev-token.js` / `scripts/seed-demo.js` for working without a live
auth-service.

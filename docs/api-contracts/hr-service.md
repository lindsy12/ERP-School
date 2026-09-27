# hr-service contract

Base path: `/api/v1/hr` (versioned per the brief's API-versioning requirement — note this
is a `v1` prefix vs. the plain `/api/hr` used in the team's original user-story draft).

All routes require `Authorization: Bearer <JWT>` issued by **auth-service**, verified here
with the shared `JWT_SECRET`. **Expected JWT payload:** `{ id, role, employeeId }` —
`role` must be one of `SuperAdmin | Admin | Staff | Student`; `employeeId` links a Staff
account to its `hr-service` Employee row for self-service endpoints (my attendance, my
leave balance, request leave, payslip download). auth-service needs to populate
`employeeId` on login for Staff accounts that are also HR employees — flag this to Person D.

"HR Manager" in the user stories maps to roles `Admin` and `SuperAdmin` (the brief's
canonical role list has no separate HR role).

## REST endpoints

| Method | Path | Auth | Request body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/employees` | Admin/SuperAdmin | firstName, lastName, email, phone?, department, role, hireDate, baseSalary | 201 Employee | matricule auto-generated `EMP<year>-<seq>`; audit-logged |
| GET | `/employees?search=&department=&status=&page=&limit=` | Admin/SuperAdmin | — | 200 `{data,total,page,limit,totalPages}` | paginated, 10/page default |
| GET | `/employees/:id` | Admin/SuperAdmin | — | 200 Employee | |
| PUT | `/employees/:id` | Admin/SuperAdmin | any field except matricule | 200 Employee | |
| DELETE | `/employees/:id` | Admin/SuperAdmin | — | 200 `{message, employee}` | soft delete → status=inactive |
| GET | `/attendance/qr/:employeeId` | self or manager | — | 200 `{employeeId, image}` | base64 PNG, regenerates daily |
| POST | `/attendance/checkin` | any authenticated | qrData, location? | 201 `{message, attendance}` | 409 if already checked in; late after 08:30 |
| POST | `/attendance/checkout` | any authenticated | employeeId? (else from token) | 200 `{message, attendance}` | 400 if no check-in on record |
| GET | `/attendance/my?month=&year=` | self | — | 200 `{employeeId, calendar[]}` | present/late/absent/leave/weekend |
| GET | `/attendance/my/:employeeId?month=&year=` | self or manager | — | 200 same as above | manager view of a specific employee |
| POST | `/leaves` | any authenticated | employeeId? (else from token), type, startDate, endDate, reason?, attachmentUrl? | 201 Leave | days = business days excl. weekends; 400 if balance insufficient (annual only) |
| GET | `/leaves?status=&employeeId=` | Admin/SuperAdmin | — | 200 Leave[] | |
| GET | `/leaves/calendar?month=&year=` | Admin/SuperAdmin | — | 200 `{month, year, leaves[]}` | approved leaves overlapping the month |
| GET | `/leaves/balance/:employeeId?year=` | self or manager | — | 200 `{annual:{total,used,remaining}, sick:{used}, ...}` | resets Jan 1 (new year = new balance row) |
| PUT | `/leaves/:id/approve` | Admin/SuperAdmin | approvedBy? | 200 Leave | deducts balance; publishes `hr.leave.approved` |
| PUT | `/leaves/:id/reject` | Admin/SuperAdmin | rejectionReason (required) | 200 Leave | publishes `hr.leave.rejected` |
| POST | `/payroll/generate` | Admin/SuperAdmin | month, year | 201 `{payroll, items[]}` | 409 if already generated for that period |
| GET | `/payroll?month=&year=` | Admin/SuperAdmin | — | 200 `{payroll, items[]}` | |
| PUT | `/payroll/item/:itemId` | Admin/SuperAdmin | bonus?, deductions? | 200 PayrollItem | 409 if parent payroll already paid |
| PUT | `/payroll/:id/pay` | Admin/SuperAdmin | — | 200 `{message, payroll}` | locks edits; publishes `hr.payroll.processed` |
| GET | `/payroll/payslip/:itemId` | self (owner of item) or manager | — | 200 `application/pdf` | 403 until payroll status = paid |
| POST/GET/PUT/DELETE | `/assets` | Admin/SuperAdmin (GET: any authenticated) | name, category, serialNumber, status, assignedTo?, purchaseDate?, value? | Asset(s) | minimal inventory tracking |
| GET | `/dashboard/stats` | Admin/SuperAdmin | — | 200 `{cards, charts}` | totals, today's attendance breakdown, 7-day trend, per-department counts |
| GET | `/health` | none | — | 200/503 `{service, status, db}` | liveness + DB check |

Error codes throughout: 400 validation, 401 missing/invalid token, 403 RBAC, 404 not found,
409 conflict (duplicate email, already checked in, already approved/paid, etc).

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
| `hr.leave.approved` | leaveId, employeeId, type, startDate, endDate, message | Notification service |
| `hr.leave.rejected` | leaveId, employeeId, rejectionReason, message | Notification service |
| `hr.payroll.processed` | payrollId, month, year, employeeCount, totalNet | Notification service (and Finance, if it wants to reconcile) |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| _(none yet)_ | HR currently has no cross-service consumers; add here if Finance/Academic events should trigger HR-side effects |

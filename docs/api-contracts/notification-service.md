# notification-service contract

Called through the gateway (`http://localhost:3000`) with `Authorization: Bearer <token>`. The service reads
the caller from the gateway's `x-user-id` / `x-user-role` / `x-tenant-id` headers (`401` without them).
Errors are `{ "error": { "code", "message" } }`. Swagger UI: `/api/v1/notifications/docs`. Web page: `/notifications/`.

Events name students and employees by their ids in other services, never by login account, so each
notification goes to an **audience**: `STAFF` (Super Admin, Admin, Staff) or `ADMINS` (Super Admin, Admin).
If an event payload carries `userId`, it goes to that user only. Read state is kept per user.

## REST endpoints

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| GET | `/health` | — | `200 { status, service, db }` | `500` if the DB is unreachable. |
| GET | `/api/v1/notifications` | — | `200 [{ id, eventType, title, message, read, createdAt }]` | Newest first. Query: `unread=true`, `limit` (1–200, default 50). |
| GET | `/api/v1/notifications/unread-count` | — | `200 { unread }` | |
| PATCH | `/api/v1/notifications/:id/read` | — | `204` | For the caller only. `400` bad id; `404` not one of the caller's notifications. |
| POST | `/api/v1/notifications/read-all` | — | `200 { marked }` | Number newly marked as read. |

## Publishes (RabbitMQ)

Nothing.

## Subscribes to (RabbitMQ)

Queue `notification-service` on the `erp.events` topic exchange. Payloads may be sent bare or wrapped as
`{ event, emittedAt, data }` (hr-service does this). Redelivered events are stored once.

| Event name | Payload fields used | Audience | Notification |
|---|---|---|---|
| `academic.student.enrolled` | `studentId, courseId, semesterId` | STAFF | Student enrolled |
| `academic.grade.published` | `studentId, courseId, semesterId, gradeLetter, publishedAt` | STAFF | Grade published |
| `academic.student.at_risk_flagged` | `studentId, reasons[], flaggedAt` | STAFF | Student at risk |
| `finance.invoice.created` | `invoiceId, invoiceNumber, studentId, amount` | STAFF | Invoice created |
| `finance.payment.received` | `paymentId, invoiceId, amount, method` | STAFF | Payment received (digital receipt) |
| `hr.leave.approved` | `tenantId, leaveId, employeeId, startDate, endDate` | STAFF | Leave approved |
| `hr.leave.rejected` | `tenantId, leaveId, employeeId, rejectionReason` | STAFF | Leave rejected |
| `hr.payroll.processed` | `tenantId, payrollId, month, year, employeeCount, totalNet` | ADMINS | Payroll processed |

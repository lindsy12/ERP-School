# Finance Service API Contract

All finance amounts are in **FCFA**.

Called through the gateway (`http://localhost:3000`) with `Authorization: Bearer <token>`. The service reads the caller from the gateway's `x-user-id` / `x-user-role` headers: `401` without them, `403` unless the role is `SUPER_ADMIN`, `ADMIN` or `STAFF`. Errors are `{ "error": { "code", "message" } }`. The web pages are served at `/finance/` (built from `client-app/`).

## REST endpoints

| Method | Path | Request body / query | Purpose |
|---|---|---|---|
| POST | `/api/v1/finance/invoices` | `studentId, academicYear, amount, dueDate` | Create a tuition invoice |
| GET | `/api/v1/finance/invoices` | `studentId?`, `status?` | List invoices |
| GET | `/api/v1/finance/invoices/:id` | — | Get invoice and balance |
| GET | `/api/v1/finance/invoices/student/:studentId` | — | List a student's invoices |
| POST | `/api/v1/finance/payments` | `invoiceId, amount, method` | Record a payment |
| GET | `/api/v1/finance/payments` | `invoiceId?` | List payments |
| GET | `/api/v1/finance/invoices/:invoiceId/payments` | — | List payments for an invoice |
| POST | `/api/v1/finance/payments/momo` | `invoiceId, amount, phoneNumber` | Record a mock mobile-money payment |
| POST | `/api/v1/finance/expenses` | `description, category?, amount, expenseDate` | Record an expense |
| GET | `/api/v1/finance/expenses` | — | List expenses |
| POST | `/api/v1/finance/campaigns` | `name, budget, startDate, endDate, leads?, conversions?, revenue?` | Create marketing campaign |
| GET | `/api/v1/finance/campaigns` | — | List campaigns |
| PATCH | `/api/v1/finance/campaigns/:id` | changed campaign fields | Update campaign |
| GET | `/api/v1/finance/reports/monthly?month=&year=` | — | Monthly FCFA financial report |

## RabbitMQ

### Subscribes

| Event | Payload | Action |
|---|---|---|
| `academic.student.enrolled` | `studentId, courseId, semesterId, tuitionAmount` (also accepts `eventId`, `amount`, `academicYear`, `dueDate`) | Creates a tuition invoice of `tuitionAmount` due in 30 days. Idempotent: one invoice per `eventId`, or per student + course + semester when there is none. |

### Publishes

| Event | Payload | Consumer |
|---|---|---|
| `finance.invoice.created` | `eventId, invoiceId, invoiceNumber, studentId, amount` | Notification service |
| `finance.payment.received` | `eventId, paymentId, invoiceId, amount, method, phoneNumber?` | Notification service |

## Health

`GET /health` returns the service and database status.

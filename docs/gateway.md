# API Gateway: what every service can rely on

The gateway (`gateway/`, port **3000**) is the only way into the system. Clients never talk to a
service directly: in Docker Compose only the gateway publishes a port. This page tells each
service team **which requests reach them and which headers they can trust**.

## Routing table

Defined in `gateway/src/config/services.js` (our documented static service registry).

| Path prefix | Service | Internal URL (env var) |
|---|---|---|
| `/api/v1/auth` | auth-service | `http://auth-service:4001` (`AUTH_SERVICE_URL`) |
| `/api/v1/academic` | academic-service | `http://academic-service:4002` (`ACADEMIC_SERVICE_URL`) |
| `/api/v1/finance` | finance-service | `http://finance-service:4003` (`FINANCE_SERVICE_URL`) |
| `/api/v1/hr` | hr-service | `http://hr-service:4004` (`HR_SERVICE_URL`) |
| `/api/v1/notifications` | notification-service | `http://notification-service:4005` (`NOTIFICATION_SERVICE_URL`) |

- **The full path is forwarded unchanged.** `GET /api/v1/hr/employees?page=2` reaches hr-service
  as `GET /api/v1/hr/employees?page=2`, so **mount your routes under your prefix** (e.g.
  `app.use('/api/v1/hr', router)`).
- A prefix matches whole path segments only: `/api/v1/hrx` does not go to hr-service.
- Method, query string, body and other headers are passed through as sent.
- Each service must answer `GET /health` (not under the prefix) with `200`; the gateway's own
  `GET /health` reports every service as `up` or `down`.

## Public routes (no token needed)

Defined in `gateway/src/config/publicRoutes.js`. Exact method + path; everything else needs a token.

| Method | Path |
|---|---|
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/refresh` (not implemented in auth-service yet) |
| any | `/health` |

## Every other request

1. The client must send `Authorization: Bearer <access_token>` (from login).
2. The gateway asks auth-service `GET /api/v1/auth/verify` (3 s timeout) whether the token is
   valid **and** the user is still active.
3. Only then is the request forwarded, with the identity headers below added.

## Headers your service receives

| Header | Value | Trust it? |
|---|---|---|
| `x-user-id` | the user's UUID | **Yes.** Set by the gateway from auth-service's answer. |
| `x-user-role` | `SUPER_ADMIN`, `ADMIN`, `STAFF` or `STUDENT` | **Yes.** Same. |
| `x-tenant-id` | the user's school (tenant) UUID | **Yes.** Same. Filter your queries by it. |
| `x-request-id` | correlation ID (UUID or the client's own) | For logs only; include it in your log lines. |
| `x-forwarded-for`, `-proto`, `-host` | original client IP / scheme / host | Informational. |
| `authorization` | the caller's original `Bearer` token | You don't need it; never log it. |

**Why you can trust the identity headers:** the gateway **deletes** any `x-user-id`,
`x-user-role`, `x-tenant-id` (and any other `x-user-*`) that a client sends, on every request,
before anything else runs. They are then set only after auth-service confirms the token. Without
that deletion, anyone could send `x-user-role: SUPER_ADMIN` and your service would believe it.

This only holds because services are **unreachable except through the gateway**:
- never add a `ports:` entry for your service in `docker-compose.yml` (use `expose:`);
- don't read identity from anywhere else (query string, body).

On public routes these headers are absent. Use `requireRole` (copy
`services/auth-service/src/middleware/requireRole.js`) and set `req.user` from the headers as its
comment shows.

## Errors the gateway itself returns

Same shape as every service: `{ "error": { "code": "...", "message": "..." } }`.

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | No `Authorization: Bearer ...` header on a protected route |
| 401 | `INVALID_TOKEN`, `TOKEN_EXPIRED`, `UNAUTHORIZED` | auth-service rejected the token (its code is passed through; `TOKEN_EXPIRED` means "refresh and retry"; `UNAUTHORIZED` here means the user was disabled or deleted) |
| 404 | `NOT_FOUND` | Path matches no service prefix (after authentication) |
| 502 | `SERVICE_UNAVAILABLE` | The target service is down or unreachable |
| 503 | `AUTH_UNAVAILABLE` | auth-service is down, too slow (>3 s), or returned something unusable |
| 504 | `GATEWAY_TIMEOUT` | The target service sent nothing back within 10 s (`PROXY_TIMEOUT_MS`) |
| 500 | `INTERNAL_ERROR` | Bug in the gateway |

Anything else (400, 403, your own 404s...) comes from your service and is passed through as is.

## Also applied to every response

- `x-request-id` response header (the same ID your service received).
- Security headers from helmet (`X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, ...).
- CORS: only origins listed in the gateway's `CORS_ORIGIN` env var; `x-request-id` is readable by
  the browser.
- One JSON log line per request in `docker compose logs gateway`:
  `time, requestId, method, path, status, durationMs, userId`.

## Not yet implemented

- Rate limiting (`RATE_LIMIT_*` env vars are reserved for it).
- `POST /api/v1/auth/refresh` in auth-service (the route is already public at the gateway).

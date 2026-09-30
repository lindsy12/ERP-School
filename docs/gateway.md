# API Gateway: what every service can rely on

The gateway (`gateway/`, port **3000**) is the only way into the system. Clients never talk to a
service directly: in Docker Compose only the gateway publishes a port. This page tells each
service team **which requests reach them and which headers they can trust**.

## Routing table

Defined in `gateway/src/config/services.js` (our documented static service registry).

| API prefix | Web pages | Service | Internal URL (env var) |
|---|---|---|---|
| `/api/v1/auth` | `/auth/` | auth-service | `http://auth-service:4001` (`AUTH_SERVICE_URL`) |
| `/api/v1/academic` | `/academic/` | academic-service | `http://academic-service:4002` (`ACADEMIC_SERVICE_URL`) |
| `/api/v1/finance` | `/finance/` | finance-service | `http://finance-service:4003` (`FINANCE_SERVICE_URL`) |
| `/api/v1/hr` | `/hr/` | hr-service | `http://hr-service:4004` (`HR_SERVICE_URL`) |
| `/api/v1/notifications` | `/notifications/` | notification-service | `http://notification-service:4005` (`NOTIFICATION_SERVICE_URL`) |

`GET /` redirects to `/auth/`, the sign-in page. See [Web pages](#web-pages) below.

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
| POST | `/api/v1/auth/refresh` |
| any | `/health` |
| GET, HEAD | `/` and everything under each service's web-pages prefix (`/auth/...`, `/hr/...`, ...) |

## Web pages

Each service serves its own pages (its `client/` folder, plain HTML/CSS/JS) under its web-pages prefix,
and the gateway forwards `GET`/`HEAD` there **without a token check**: a browser opening a page can't
send one. The pages then call the API with the token. So:

- Serve **only static files** under your web-pages prefix, e.g.
  `app.use('/hr', express.static(path.join(__dirname, '..', 'client')))`. Never an API route: it would
  be public, and it gets no identity headers.
- Call the API with **relative URLs** (`/api/v1/hr/...`): pages and API share the gateway's origin
  (`http://localhost:3000`), so there is no CORS to deal with.
- **Sign-in is shared.** The session lives in `localStorage` (`erp_access_token`, `erp_refresh_token`,
  `erp_tenant_id`), which every page on the origin can read. Instead of writing your own, import the
  helper served by auth-service:

  ```js
  import { api, requireSession, signOut } from '/auth/js/session.js';

  requireSession();                               // not signed in -> /auth/, then back to this page
  const leaves = await api('/api/v1/hr/leaves');  // adds the token, refreshes it when it expires
  window.addEventListener('auth:expired', () => requireSession()); // session ended (logout, disabled...)
  ```

  `api()` returns the parsed JSON or throws an `ApiError` with `status`, `code`, `message`, `details`.
  To send users to sign in, link to `/auth/?next=<your page>`; `/auth/?school=<tenant id>` fills in the
  School ID (admins find that link on the Users page).
- Page files don't count against the global rate limit (a page load is a dozen files).
- Pages get a Content-Security-Policy that allows scripts from the site only: no inline `<script>` blocks and no `onclick="..."` attributes. Load scripts from files. The academic pages predate this and are marked `inlineScripts: true` in `gateway/src/config/services.js`, which allows inline scripts under `/academic/` only.
- `GET /favicon.ico` answers `204` without a token, so browsers don't log a `401` on every page.

## Every other request

1. The client must send `Authorization: Bearer <access_token>` (from login).
2. The gateway asks auth-service `GET /api/v1/auth/verify` (3 s timeout) whether the token is
   valid, not revoked (logout, password change) **and** the user is still active. The role it
   returns is the user's current role in the database, not the one written in the token.
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
| 401 | `INVALID_TOKEN`, `TOKEN_EXPIRED`, `UNAUTHORIZED` | auth-service rejected the token (its code is passed through; `TOKEN_EXPIRED` means "refresh and retry"; `INVALID_TOKEN` also covers tokens revoked by logout or a password change; `UNAUTHORIZED` here means the user was disabled or deleted) |
| 429 | `RATE_LIMITED` | Too many requests (see Rate limits below); `Retry-After` says how many seconds to wait |
| 404 | `NOT_FOUND` | Path matches no service prefix (after authentication) |
| 502 | `SERVICE_UNAVAILABLE` | The target service is down or unreachable |
| 503 | `AUTH_UNAVAILABLE` | auth-service is down, too slow (>3 s), or returned something unusable |
| 504 | `GATEWAY_TIMEOUT` | The target service sent nothing back within 10 s (`PROXY_TIMEOUT_MS`) |
| 500 | `INTERNAL_ERROR` | Bug in the gateway |

Anything else (400, 403, your own 404s...) comes from your service and is passed through as is.

## Rate limits

Counted per minute (`RATE_LIMIT_WINDOW_MS`) in the gateway, so services don't need their own.

| Limiter | Applies to | Counted per | Default (env var) |
|---|---|---|---|
| Login | `POST /api/v1/auth/login` | client IP | 10 (`AUTH_RATE_LIMIT_MAX`) |
| Refresh | `POST /api/v1/auth/refresh` | client IP (own counter) | 10 (`AUTH_RATE_LIMIT_MAX`) |
| Global | every other route except `/health` | user id if the token is valid, otherwise client IP | 100 (`RATE_LIMIT_MAX`) |

Responses carry the standard `RateLimit` and `RateLimit-Policy` headers (e.g. `limit=100, remaining=87, reset=41`);
a 429 also carries `Retry-After`. Every 429 is logged as a JSON line with `event: "rate_limited"`, the
`requestId` and the `key` (`user:<id>` or `ip:<address>`). Counters live in the gateway's memory, which is
only correct for one gateway replica: see [scaling-strategy.md](scaling-strategy.md).

## Also applied to every response

- `x-request-id` response header (the same ID your service received).
- Security headers from helmet (`X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, ...).
- CORS: only origins listed in the gateway's `CORS_ORIGIN` env var; `x-request-id` is readable by
  the browser.
- One JSON log line per request in `docker compose logs gateway`:
  `time, requestId, method, path, status, durationMs, userId`.

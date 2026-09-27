# API Gateway

**Owner:** Person D

The single entry point for every client request. Routes to the right service, verifies
JWTs (delegating to Auth Service), forwards `x-user-id` / `x-user-role` headers downstream,
and enforces rate limiting. Contains NO business logic — if you're tempted to add a business
rule here, it belongs in the owning service instead.

This is the only container exposed to the host machine (port 3000) — every other service
is reachable only from inside the Docker network.

## What it does today
- **Routing** via the static service registry in `src/config/services.js`: `/api/v1/auth`,
  `/api/v1/academic`, `/api/v1/finance`, `/api/v1/hr`, `/api/v1/notifications`. The full path is
  forwarded unchanged (`/api/v1/auth/login` reaches auth-service as `/api/v1/auth/login`).
- **Errors:** service down → `502 SERVICE_UNAVAILABLE`; no answer within `PROXY_TIMEOUT_MS` → `504 GATEWAY_TIMEOUT`.
- **Correlation ID:** `x-request-id` is kept or generated, forwarded, and returned; one JSON log line per request.
- **`GET /health`:** the gateway plus every service's `/health` (`ok` or `degraded`, always 200).
- **Security:** helmet headers, CORS limited to `CORS_ORIGIN`, client-sent `x-user-*` headers are removed.
- Not yet: JWT verification and rate limiting.

Never add `express.json()` (or any body parser) before the proxies: it consumes the request body
and POSTs would reach services empty and time out.

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev` (or `docker compose up --build gateway auth-service` from the repo root)
4. `npm test`

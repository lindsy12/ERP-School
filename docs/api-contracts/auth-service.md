# auth-service contract

Base path: `/api/v1/auth`. Interactive docs: `/api/v1/auth/docs` (Swagger UI), raw spec: `/api/v1/auth/openapi.json`.
The OpenAPI spec lives in `services/auth-service/src/docs/openapi.js`; keep this file and that one in sync.

## REST endpoints

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `{ tenant_id: uuid, email: string, password: string }` | 200 `{ access_token, refresh_token, token_type: "Bearer", expires_in: 900 }` | 400 `VALIDATION_ERROR` (with `details`) or `INVALID_JSON`. 401 `INVALID_CREDENTIALS` "Invalid email or password", identical for unknown email, wrong password and disabled account. Response has `Cache-Control: no-store`. |
| GET | `/api/v1/auth/me` | none; header `Authorization: Bearer <access_token>` | 200 `{ id, email, role, tenant_id }` | 401 `UNAUTHORIZED` (missing/malformed header, or user deleted/disabled), `INVALID_TOKEN`, `TOKEN_EXPIRED`. Never returns the password hash. |
| GET | `/api/v1/auth/verify` | none; header `Authorization: Bearer <access_token>` | 200 `{ id, role, tenant_id }` | **For the gateway only** (see `docs/gateway.md`): it turns the result into `x-user-id`, `x-user-role`, `x-tenant-id`. Same 401 codes as `/me`, so disabled/deleted users are rejected at once. `Cache-Control: no-store`. |
| GET | `/health` | none | 200 `{ "status": "ok", "service": "auth" }` | Not under the `/api/v1` prefix; used by Docker's health check. |

### Access token (JWT)

- Signed with HS256 using `JWT_SECRET`; lifetime `ACCESS_TOKEN_MINUTES` (15).
- Claims: `sub` (user id), `role` (`SUPER_ADMIN` / `ADMIN` / `STAFF` / `STUDENT`), `tenant_id`, `iat`, `exp`, `jti` (unique token id).

### Refresh token

- Opaque random string (32 bytes, base64url), lifetime `REFRESH_TOKEN_DAYS` (7).
- Only its SHA-256 hash is stored, in `refresh_tokens`. Each login creates a new row in `token_families`
  (the session, which owns `user_id`), and every token issued for that session points to it via `family_id`.
- `/refresh` and `/logout` are not implemented yet.

### Error format (all endpoints)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid",
             "details": [{ "field": "email", "message": "must be a valid email address" }] } }
```

`details` appears only on `VALIDATION_ERROR`. Codes: `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CREDENTIALS`,
`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`.

## Publishes (RabbitMQ)

| Event name | Payload fields | Consumed by |
|---|---|---|
| none yet | | |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| none | |

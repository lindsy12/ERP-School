# auth-service contract

Base path: `/api/v1/auth`. Interactive docs: `/api/v1/auth/docs` (Swagger UI), raw spec: `/api/v1/auth/openapi.json`.
The OpenAPI spec lives in `services/auth-service/src/docs/openapi.js`; keep this file and that one in sync.

## REST endpoints

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `{ tenant_id: uuid, email: string, password: string }` | 200 `{ access_token, refresh_token, token_type: "Bearer", expires_in: 900 }` | 400 `VALIDATION_ERROR` (with `details`) or `INVALID_JSON`. 401 `INVALID_CREDENTIALS` "Invalid email or password", identical for unknown email, wrong password and disabled account. 423 `ACCOUNT_LOCKED` "Account temporarily locked" (see Account lockout). Response has `Cache-Control: no-store`. |
| POST | `/api/v1/auth/refresh` | `{ refresh_token: string }` | 200 same shape as `/login` | Rotation: the token sent is revoked and a new one is issued in the same family. 401 `INVALID_REFRESH_TOKEN` "Refresh token is invalid or expired" for unknown, expired, revoked or reused tokens (client must log in again). Reusing an already-rotated token revokes the whole family and logs `auth.refresh_token.reuse_detected`. 400 `VALIDATION_ERROR`. `Cache-Control: no-store`. Public at the gateway. |
| POST | `/api/v1/auth/logout` | `{ refresh_token: string }`; header `Authorization: Bearer <access_token>` | 204 | Revokes the token's whole family (the session). Idempotent. 401 `INVALID_REFRESH_TOKEN` if the refresh token is unknown or belongs to another user; the usual access-token 401s. Access tokens already issued stay valid until they expire (max 15 min). |
| POST | `/api/v1/auth/users/{id}/unlock` | none; header `Authorization: Bearer <access_token>` | 204 | **ADMIN / SUPER_ADMIN only** (403 `FORBIDDEN` otherwise). Clears the lockout. Only users in the caller's tenant; any other id gets 404 `NOT_FOUND`, same as a missing user. 400 `VALIDATION_ERROR` if `id` is not a UUID. |
| GET | `/api/v1/auth/me` | none; header `Authorization: Bearer <access_token>` | 200 `{ id, email, role, tenant_id }` | 401 `UNAUTHORIZED` (missing/malformed header, or user deleted/disabled), `INVALID_TOKEN`, `TOKEN_EXPIRED`. Never returns the password hash. |
| GET | `/api/v1/auth/verify` | none; header `Authorization: Bearer <access_token>` | 200 `{ id, role, tenant_id }` | **For the gateway only** (see `docs/gateway.md`): it turns the result into `x-user-id`, `x-user-role`, `x-tenant-id`. Same 401 codes as `/me`, so disabled/deleted users are rejected at once. `Cache-Control: no-store`. |
| GET | `/health` | none | 200 `{ "status": "ok", "service": "auth" }` | Not under the `/api/v1` prefix; used by Docker's health check. |

### Access token (JWT)

- Signed with HS256 using `JWT_SECRET`; lifetime `ACCESS_TOKEN_MINUTES` (15).
- Claims: `sub` (user id), `role` (`SUPER_ADMIN` / `ADMIN` / `STAFF` / `STUDENT`), `tenant_id`, `iat`, `exp`, `jti` (unique token id).

### Account lockout

- Each wrong password for an existing account adds 1 to `users.failed_login_attempts`. At `MAX_FAILED_ATTEMPTS`
  (default 5) `locked_until` is set to now + `LOCKOUT_MINUTES` (default 15), and that attempt already returns 423.
- While `locked_until` is in the future, every login returns 423 `ACCOUNT_LOCKED` **before** the password is
  checked, and attempts are not counted.
- A successful login resets the count to 0 and `locked_until` to NULL. After a lock expires, the next wrong
  password starts a new count at 1.
- Attempts against unknown emails are not counted (there is no row to count on).
- Each lockout is logged as a JSON line with `event: "auth.account.locked"` (`userId`, `tenantId`,
  `failedAttempts`, `lockedUntil`); an admin unlock as `event: "auth.account.unlocked"` (`userId`, `tenantId`,
  `unlockedBy`).

### Refresh token

- Opaque random string (32 bytes, base64url), lifetime `REFRESH_TOKEN_DAYS` (7).
- Only its SHA-256 hash is stored, in `refresh_tokens`. Each login creates a new row in `token_families`
  (the session, which owns `user_id`), and every token issued for that session points to it via `family_id`.
- **Rotation:** each refresh token works once. `/refresh` sets the old row's `revoked_at` and `replaced_by`
  (the new token's id) and inserts the new token in the same family, in one transaction that locks the old row.
- **Reuse detection:** a token that is already revoked while its family is still active means a copy was used
  after rotation (stolen, or replayed). The family and all its tokens are revoked, a JSON warning with
  `userId`, `familyId`, `tokenId` (never the token) is logged, and 401 is returned. Other sessions of the same
  user are not affected.
- **Logout** sets `revoked_at` on the family and its tokens. A token from a revoked family gets 401 without a
  reuse warning.

### Error format (all endpoints)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid",
             "details": [{ "field": "email", "message": "must be a valid email address" }] } }
```

`details` appears only on `VALIDATION_ERROR`. Codes: `VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`,
`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `FORBIDDEN`, `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`.

## Publishes (RabbitMQ)

| Event name | Payload fields | Consumed by |
|---|---|---|
| none yet | | |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| none | |

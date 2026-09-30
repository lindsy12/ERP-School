# auth-service contract

Base path: `/api/v1/auth`. Interactive docs: `/api/v1/auth/docs` (Swagger UI), raw spec: `/api/v1/auth/openapi.json`.
The OpenAPI spec lives in `services/auth-service/src/docs/openapi.js`; keep this file and that one in sync.

## REST endpoints

| Method | Path | Request body | Response | Notes |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | `{ tenant_id: uuid, email: string, password: string }` | 200 `{ access_token, refresh_token, token_type: "Bearer", expires_in: 900 }` | 400 `VALIDATION_ERROR` (with `details`) or `INVALID_JSON`. 401 `INVALID_CREDENTIALS` "Invalid email or password", identical for unknown email, wrong password and disabled account. 423 `ACCOUNT_LOCKED` "Account temporarily locked" (see Account lockout). Response has `Cache-Control: no-store`. |
| POST | `/api/v1/auth/refresh` | `{ refresh_token: string }` | 200 same shape as `/login` | Rotation: the token sent is revoked and a new one is issued in the same family. 401 `INVALID_REFRESH_TOKEN` "Refresh token is invalid or expired" for unknown, expired, revoked or reused tokens (client must log in again). Reusing an already-rotated token revokes the whole family and logs `auth.refresh_token.reuse_detected`. 400 `VALIDATION_ERROR`. `Cache-Control: no-store`. Public at the gateway. |
| POST | `/api/v1/auth/logout` | `{ refresh_token: string }`; header `Authorization: Bearer <access_token>` | 204 | Revokes the token's whole family (the session) **and the access token sent with the call** (see Revoking access tokens). Other sessions are not affected. Ending an already-ended session succeeds (with a still-valid access token, e.g. from another session). 401 `INVALID_REFRESH_TOKEN` if the refresh token is unknown or belongs to another user; the usual access-token 401s. |
| POST | `/api/v1/auth/change-password` | `{ current_password: string, new_password: string }`; header `Authorization: Bearer <access_token>` | 200 same shape as `/login` | Any logged-in user, for their own account. `new_password`: 8+ characters, at most 72 bytes, different from the current one. Wrong `current_password`: 400 `VALIDATION_ERROR` with `details: [{ field: "current_password", message: "is incorrect" }]`, **counted as a failed login** (5 in a row: 423 `ACCOUNT_LOCKED`). On success every session of the user ends, access tokens issued before now are rejected, and the returned pair starts a new session. Logs `auth.password.changed`. `Cache-Control: no-store`. |
| GET | `/api/v1/auth/me` | none; header `Authorization: Bearer <access_token>` | 200 `{ id, email, role, tenant_id }` | 401 `UNAUTHORIZED` (missing/malformed header, or user deleted/disabled), `INVALID_TOKEN` (bad signature, or revoked), `TOKEN_EXPIRED`. Never returns the password hash. |
| GET | `/api/v1/auth/verify` | none; header `Authorization: Bearer <access_token>` | 200 `{ id, email, role, tenant_id }` | **For the gateway only** (see `docs/gateway.md`): it turns the result into `x-user-id`, `x-user-email`, `x-user-role`, `x-tenant-id`. Same 401 codes as `/me`. `role` is read from the database, so role changes, disabled/deleted users and revoked tokens apply from the next request. `Cache-Control: no-store`. |
| GET | `/health` | none | 200 `{ "status": "ok", "service": "auth" }` | Not under the `/api/v1` prefix; used by Docker's health check. |

### Account management (ADMIN / SUPER_ADMIN)

All under `/api/v1/auth/users`, all need `Authorization: Bearer <access_token>`; other roles get 403 `FORBIDDEN`.
Everything is limited to the caller's own school: an id from another school gets 404 `NOT_FOUND`, the same as a
missing one. Changing an account (PATCH, reset-password, unlock) also needs the caller to **outrank** it:

| Caller | May create and change |
|---|---|
| SUPER_ADMIN | ADMIN, STAFF, STUDENT |
| ADMIN | STAFF, STUDENT |

So nobody changes their own account or a peer's here (they use `/change-password`), and SUPER_ADMIN accounts are
only created by `npm run seed`. Otherwise 403 `FORBIDDEN`. The rule lives in `src/config/roles.js`.

**User object** (never contains the password hash):
`{ id, tenant_id, email, role, is_active: boolean, locked_until: ISO date | null, created_at: ISO date }`.
`locked_until` is set only while a lockout is running.

| Method | Path | Request | Response | Notes |
|---|---|---|---|---|
| POST | `/users` | `{ email, password, role }` | 201 user; `Location: /api/v1/auth/users/{id}` | Email is trimmed and lower-cased. `password`: 8+ characters, at most 72 bytes. 409 `EMAIL_TAKEN` if the email exists in this school (the same email in another school is fine). 400 `VALIDATION_ERROR` lists every bad field, including fields that are not allowed. Logs `auth.user.created`. |
| GET | `/users?role=&page=&limit=` | none | 200 `{ data: [user], page, limit, total }` | Newest first. `page` ≥ 1 (default 1), `limit` 1–100 (default 20), optional `role` filter. `total` counts all matching accounts. |
| GET | `/users/{id}` | none | 200 user | 404 `NOT_FOUND`. |
| PATCH | `/users/{id}` | `{ role?, is_active? }` (at least one) | 200 user | New `role` must be one the caller may create. `is_active: false` disables the account and ends all its sessions; its access tokens are refused on the next request. Other fields are refused (400). Logs `auth.user.updated`. |
| POST | `/users/{id}/reset-password` | `{ new_password }` | 204 | For a user who forgot their password; the admin passes it on. Ends all sessions, rejects the user's existing access tokens, clears any lockout. Logs `auth.password.reset`. |
| POST | `/users/{id}/unlock` | none | 204 | Clears the lockout early. Logs `auth.account.unlocked`. |

There is no self-registration and no emailed "forgot password" link: accounts are created by admins, and a
forgotten password is reset by one. Accounts are never deleted, only disabled, so their history stays intact.

### Access token (JWT)

- Signed with HS256 using `JWT_SECRET`; lifetime `ACCESS_TOKEN_MINUTES` (15).
- Claims: `sub` (user id), `role` (`SUPER_ADMIN` / `ADMIN` / `STAFF` / `STUDENT`), `tenant_id`, `iat`, `exp`, `jti` (unique token id).
- The `role` claim is informational. Every endpoint that takes an access token (including `/verify`) reads the
  user from the database and uses the **current** role.

### Revoking access tokens

A valid signature is not enough: every request that carries an access token also checks, in the database, that

1. the user still exists and `is_active` is true (otherwise 401 `UNAUTHORIZED`);
2. the token's `jti` is not in `revoked_access_tokens`: **logout** puts it there, until the token would have
   expired anyway (otherwise 401 `INVALID_TOKEN` "Access token has been revoked");
3. the token's `iat` is not before `users.tokens_valid_after`: **change-password** and **reset-password** set it to
   the current second, which ends every access token of that user at once (same 401).

Clients treat these 401s like any other `INVALID_TOKEN`: log in again. Only `TOKEN_EXPIRED` means "refresh and
retry".

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
`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `FORBIDDEN`, `NOT_FOUND`, `EMAIL_TAKEN`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`.

## Publishes (RabbitMQ)

| Event name | Payload fields | Consumed by |
|---|---|---|
| none yet | | |

## Subscribes to (RabbitMQ)

| Event name | Action taken |
|---|---|
| none | |

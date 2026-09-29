# Auth Service

**Owner:** Person D

Owns: user registration/login, password hashing (bcrypt), JWT issuing + verification,
refresh-token rotation, session/account-lockout logic, RBAC role data.

This is the most security-sensitive service in the project — get it working early (day 2-3),
since every other service's protected routes depend on the Gateway being able to verify a token.

## Owns its own database
`auth_db` — users, roles, refresh tokens. No other service touches these tables directly;
other services trust the `x-user-id` / `x-user-role` headers forwarded by the Gateway instead.

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run migrate` (again after pulling new files in `src/db/migrations/`)
4. `npm run seed` for the first SUPER_ADMIN, then `npm run dev`

## Accounts
There is no self-registration. The SUPER_ADMIN from the seed creates ADMINs; ADMINs create STAFF and
STUDENT accounts with `POST /api/v1/auth/users`, and reset forgotten passwords with
`POST /api/v1/auth/users/{id}/reset-password`. Everyone changes their own password with
`POST /api/v1/auth/change-password`.

## Endpoints
See `docs/api-contracts/auth-service.md` for the full REST contract, or `/api/v1/auth/docs` (Swagger UI).

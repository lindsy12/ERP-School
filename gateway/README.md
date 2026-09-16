# API Gateway

**Owner:** Person D

The single entry point for every client request. Routes to the right service, verifies
JWTs (delegating to Auth Service), forwards `x-user-id` / `x-user-role` headers downstream,
and enforces rate limiting. Contains NO business logic — if you're tempted to add a business
rule here, it belongs in the owning service instead.

This is the only container exposed to the host machine (port 3000) — every other service
is reachable only from inside the Docker network.

## Setup
1. Copy `.env.example` to `.env` and fill in real values.
2. `npm install`
3. `npm run dev`

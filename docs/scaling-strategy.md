# Scaling strategy

How the School ERP can handle more users by running **more copies (replicas)** of the same
container, and what must change before we do.

## 1. Our services are stateless

A service is *stateless* when it keeps nothing important in its own memory between two requests.
Everything it needs comes with the request or from its database. Then any copy can answer any
request, and adding copies adds capacity.

| Component | Where the state lives | Stateless? |
|---|---|---|
| Gateway | Nothing about users is stored. Each request brings its own token; the routing table comes from config. | Yes (except the rate-limit counters, see §3) |
| auth-service | Users, roles and refresh tokens are in MySQL (`auth_db`). The access token (JWT) is self-contained: any copy with the same `JWT_SECRET` can check it. | Yes |
| academic / finance / hr / notification | Their own MySQL database each; identity comes from the gateway's headers on every request. | Yes, if built the same way (no in-memory sessions or caches that must be shared) |

**Rule for every team:** never keep sessions, "logged-in user" objects, uploaded files or
counters in a variable in your Node process. Put them in your database (or Redis, later).

## 2. Running several replicas

Docker Compose can start several copies of one service:

```bash
docker compose up -d --scale auth-service=3
```

Docker's internal DNS then answers `auth-service` with all 3 addresses, in rotating order, and
the gateway spreads requests across them (it looks the name up again on every request).

Before this works in our `docker-compose.yml`:

1. **Remove `container_name:`** from any service you want to scale. Docker requires each container
   to have a unique name, and Compose refuses to scale a service with a fixed one (tested: *"Remove
   the custom name to scale the service"*).
2. **The gateway publishes host port 3000**, and only one container can own it. To run several
   gateways, put a load balancer (e.g. Nginx or Traefik) in front that owns port 3000 and spreads
   traffic across gateway replicas, which then use `expose:` only. Also set `TRUST_PROXY=1` in the
   gateway (see §4).
3. **Run migrations once**, not in every replica: `docker compose exec auth-service npm run migrate`
   (it is a separate command for exactly this reason: two copies migrating at the same time could clash).
4. **RabbitMQ consumers:** several replicas reading the same queue *share* the messages (each event
   goes to one replica), so handlers must be safe to run twice for the same event (idempotent),
   because a message is redelivered if a replica dies halfway.

## 3. The rate limiter is the one piece of shared state

The gateway limits requests (100/min per user or IP, 10/min per IP on login and refresh).
To do that it must **count** requests, and today those counts live in the gateway's **memory**
(express-rate-limit's default `MemoryStore`).

With **one** gateway that is correct. With **several** it breaks:

- **Each replica has its own counters.** With 3 gateways behind a load balancer, an attacker's
  login attempts are spread over 3 separate counters, so they get about **30 guesses per minute
  instead of 10**. The limit silently multiplies by the number of replicas.
- **Counts disagree.** A user can be blocked by one replica and allowed by the next, depending on
  where the load balancer sends each request.
- **Restarts reset them.** Every deploy or crash gives everyone a fresh budget.

**The fix: a shared store.** Keep the counters in **Redis**, a small, very fast in-memory database
that all gateway replicas talk to. Each request increments *the same* counter no matter which
replica handles it, Redis does this atomically (two replicas can't both read "9" and write "10"),
and it expires counters automatically at the end of the window.

In code this is one option on each limiter in `gateway/src/middleware/rateLimiters.js`:

```js
const { RedisStore } = require('rate-limit-redis');
// ...
store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args), prefix: `rl:${name}:` }),
```

plus a `redis` service in `docker-compose.yml` (internal only) and a `REDIS_URL` variable.
**We don't need it while we run a single gateway**, so it is not added yet.

## 4. Client IP behind proxies (`TRUST_PROXY`)

Rate limiting by IP needs the *real* client address. Express's `trust proxy` setting decides
where that address comes from:

- **`TRUST_PROXY=false` (today).** Nothing sits in front of the gateway, so the address of the TCP
  connection is the client. Any `X-Forwarded-For` header is ignored, because a client could write
  anything in it (`X-Forwarded-For: 1.2.3.4`) to get a fresh rate-limit counter on every request.
- **`TRUST_PROXY=1` (with a load balancer).** Every connection now comes *from the load balancer*,
  so without this every user would share the balancer's IP and one busy classroom would block
  everyone. `1` means "trust exactly one proxy hop": use the address the load balancer appended to
  `X-Forwarded-For`, and ignore anything the client wrote before it.
- **Never `true`** (trust every hop): the gateway refuses to start with it, because the client
  could then choose its own IP.

## 5. Summary

| Can scale today | Needs work first |
|---|---|
| auth-service (after removing `container_name`) | Several gateways: load balancer in front, `TRUST_PROXY=1`, Redis for rate limits |
| Other services, if they keep no state in memory | MySQL itself: one instance per service (read replicas are out of scope) |

FROM node:20-alpine

WORKDIR /app

# Install dependencies first so Docker can cache this layer between code changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY client ./client
COPY scripts ./scripts

# Deliberately NOT NODE_ENV=production: scripts/seed-demo.js and scripts/dev-token.js
# (see README's "Running the UI without the gateway or auth-service") refuse to run
# under that env on purpose, since dev-token.js can mint a token for any role/tenant.
USER node
EXPOSE 4004

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4004/health || exit 1

CMD ["node", "src/server.js"]

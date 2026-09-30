FROM node:20-alpine

WORKDIR /app

# Install dependencies first so Docker can cache this layer between code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY client ./client

ENV NODE_ENV=production
USER node
EXPOSE 4005

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:4005/health || exit 1

CMD ["node", "src/server.js"]

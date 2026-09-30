# Stage 1: build the React pages (client-app/) into client/.
FROM node:20-alpine AS client
WORKDIR /app/client-app
COPY client-app/package*.json ./
RUN npm ci
COPY client-app ./
RUN npm run build

# Stage 2: the service itself.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=client /app/client ./client
USER node
EXPOSE 4003
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:4003/health || exit 1
CMD ["node", "src/server.js"]

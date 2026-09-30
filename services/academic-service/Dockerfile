FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 4002

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 `
  CMD wget -qO- http://localhost:4002/health || exit 1

USER node

CMD ["node", "src/app.js"]

FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY client ./client
COPY scripts ./scripts

EXPOSE 4004

CMD ["node", "src/server.js"]

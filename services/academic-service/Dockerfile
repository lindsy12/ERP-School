FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first: this layer is only rebuilt when package.json / package-lock.json change,
# not on every source edit. --omit=dev skips nodemon.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy only the source, not the whole folder. There's no .dockerignore, so `COPY . .` would
# bake .env (DB password) into the image and overwrite the Linux node_modules installed above
# with the host's copy. The service reads nothing outside src/ at runtime. Config comes from
# environment variables (docker-compose's env_file), not a .env file in the image.
COPY src ./src

# Run as the image's built-in unprivileged user, not root.
USER node

EXPOSE 4002

CMD ["node", "src/app.js"]

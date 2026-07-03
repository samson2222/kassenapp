# Stage 1: Build React frontend
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:24-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=3000
# DATA_DIR should be set to a mounted volume path in Coolify, e.g. /data
# ADMIN_PASSWORD should be set as a secret in Coolify

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server/index.js"]

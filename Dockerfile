# ── Build Stage ──
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Production Stage ──
FROM node:22-alpine AS production
WORKDIR /app

# Create non-root user
RUN addgroup -S mcp && adduser -S mcp -G mcp

COPY package*.json ./
RUN npm ci --production --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY README.md CONFIGURATION.md mcp-terminal.config.json ./

# Use non-root user
USER mcp

ENV NODE_ENV=production

# HTTP health endpoint (enable with HTTP_PORT env var)
EXPOSE 3000

# Default: stdio mode. For HTTP mode, use: docker run -e HTTP_PORT=3000 ...
ENTRYPOINT ["node", "dist/index.js"]

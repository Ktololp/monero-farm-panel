FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY build.mjs ./
COPY web ./web
RUN npm run build:web && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
LABEL org.opencontainers.image.title="Monero Farm Panel" \
      org.opencontainers.image.description="Self-hosted Monero/XMRig farm management dashboard" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package.json ./package.json
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /app/data /app/certs && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "src/start.js"]

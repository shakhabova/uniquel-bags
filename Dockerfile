# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/images \
    && chown -R node:node /data

COPY --from=build --chown=node:node /app/dist/standalone ./
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/uniquel-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/uniquel-entrypoint.sh \
    && chmod +x /usr/local/bin/uniquel-entrypoint.sh \
    && /bin/sh -n /usr/local/bin/uniquel-entrypoint.sh \
    && test -f /app/server.js

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/uniquel-entrypoint.sh"]
CMD ["node", "server.js"]

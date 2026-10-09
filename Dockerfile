FROM node:24.21.0-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1 KEKBOT_RUN_JOBS=0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && apt-get clean
RUN npm install --global pnpm@10.26.0
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.21.0-bookworm-slim AS runtime
ARG VCS_REF=unknown
ARG VERSION=0.1.0-beta.1
LABEL org.opencontainers.image.title="KekBot" org.opencontainers.image.source="https://github.com/DangerMouseUK/kekbot" org.opencontainers.image.revision=$VCS_REF org.opencontainers.image.version=$VERSION org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_MANUAL_SIG_HANDLE=1 KEKBOT_RUN_JOBS=1 KEKBOT_DATA_DIR=/data HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# Apply available Debian security fixes. The shipped image needs Node, not its
# bundled npm/Corepack/Yarn tools; retain the build-stage toolchain above.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /data && chown node:node /data /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/LICENSE ./LICENSE
COPY --from=build --chown=node:node /app/docs/DEPENDENCIES.md ./DEPENDENCIES.md
COPY --from=build --chown=node:node /app/output/licenses ./THIRD_PARTY_LICENSES
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

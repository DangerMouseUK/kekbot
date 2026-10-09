FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
ENV NEXT_TELEMETRY_DISABLED=1 KEKBOT_RUN_JOBS=0
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install --global pnpm@10.26.0
COPY package.json pnpm-lock.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime-files
# Install the actual runtime closure into a separate root, retaining apk's real
# package database. No shell, package manager or build tools enter the image.
RUN apk --root /runtime --initdb --no-scripts --no-cache \
    --repositories-file /etc/apk/repositories --keys-dir /etc/apk/keys \
    add musl libgcc libstdc++ \
    && mkdir -p /runtime/usr/local/bin /runtime/app /runtime/data /runtime/home/node /runtime/tmp \
    && cp /usr/local/bin/node /runtime/usr/local/bin/node \
    && cp /etc/os-release /runtime/etc/os-release \
    && printf 'node:x:1000:1000:Node:/home/node:/sbin/nologin\n' > /runtime/etc/passwd \
    && printf 'node:x:1000:\n' > /runtime/etc/group \
    && chown -R 1000:1000 /runtime/app /runtime/data /runtime/home/node \
    && chmod 1777 /runtime/tmp
COPY licenses/runtime /legal
COPY scripts/runtime-notices.mjs /runtime-notices.mjs
RUN node /runtime-notices.mjs /runtime /usr/local/LICENSE /legal
# Include original component notices in the small, checksum-pinned musl source.
# This checksum also matches Alpine's reviewed musl source SHA512 provenance.
ADD --checksum=sha256:d585fd3b613c66151fc3249e8ed44f77020cb5e6c1e635a616d3f9f82460512a https://musl.libc.org/releases/musl-1.2.6.tar.gz /runtime/app/THIRD_PARTY_LICENSES/runtime/musl-1.2.6-source.tar.gz

FROM scratch AS runtime
ARG VCS_REF=unknown
ARG VERSION=0.1.0-beta.1
LABEL org.opencontainers.image.title="KekBot" org.opencontainers.image.source="https://github.com/DangerMouseUK/kekbot" org.opencontainers.image.revision=$VCS_REF org.opencontainers.image.version=$VERSION org.opencontainers.image.licenses="MIT"
ENV PATH=/usr/local/bin NODE_VERSION=24.21.0 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_MANUAL_SIG_HANDLE=1 KEKBOT_RUN_JOBS=1 KEKBOT_DATA_DIR=/data HOSTNAME=0.0.0.0 PORT=3000
COPY --from=runtime-files /runtime /
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/LICENSE ./LICENSE
COPY --from=build --chown=node:node /app/docs/DEPENDENCIES.md ./DEPENDENCIES.md
COPY --from=build --chown=node:node /app/output/licenses ./THIRD_PARTY_LICENSES
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]

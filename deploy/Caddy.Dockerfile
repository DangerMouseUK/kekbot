# The official 2.11.6 Docker tag is not published yet. Keep its version pinned
# using the official release binary and checksum on an immutable image base.
FROM caddy:2.11.4@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52
ARG TARGETARCH
ADD --checksum=sha256:22c84f8d2d4e4e0e2d422f8049fdd0fc1ed8d5665d0fe166f506c7fd863b4555 https://github.com/caddyserver/caddy/releases/download/v2.11.6/caddy_2.11.6_linux_amd64.tar.gz /tmp/caddy.tar.gz
RUN apk add --no-cache --upgrade zlib=1.3.2-r1 \
    && test "$TARGETARCH" = "amd64" \
    && tar -xzf /tmp/caddy.tar.gz -C /usr/bin caddy \
    && rm /tmp/caddy.tar.gz \
    && caddy version | grep '^v2.11.6 '

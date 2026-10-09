FROM golang:1.27.2-alpine3.24@sha256:85dc1069ac644ea3c527b177303a406eb3358192816cd7f9e5848eb658851673 AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
WORKDIR /build
COPY deploy/caddy/go.mod deploy/caddy/go.sum ./
RUN go mod download && go mod verify
COPY deploy/caddy/main.go ./
# Retain symbols so the exact binary can be checked for vulnerable packages.
RUN go build -mod=readonly -trimpath -buildvcs=false -o /caddy .

FROM caddy:2.11.4@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52
ARG TARGETARCH
COPY --from=build /caddy /usr/bin/caddy
RUN apk add --no-cache --upgrade zlib=1.3.2-r1 \
    && test "$TARGETARCH" = "amd64" \
    && caddy version | grep '^v2.11.6 '

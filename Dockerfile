FROM node:lts-alpine AS builder

USER node
WORKDIR /app
COPY --chown=node:node app/ ./

RUN npm ci \
    && npx tsc \
    && npx tsc -p tsconfig.client.json

FROM node:lts-alpine AS runner

RUN apk --no-cache add curl

USER node
WORKDIR /app
COPY --from=builder --chown=node:node app/ ./

# --ignore-scripts: no install hooks from dependencies in the final image
RUN npm ci --omit=dev --ignore-scripts

ARG PACKAGE_VERSION
ENV APP_VERSION=${PACKAGE_VERSION}
ENV NODE_ENV=production

# 3000 = guest portal (public), 3001 = admin pages (publish only behind authentication)
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fs http://localhost:3000/share/healthcheck -o /dev/null || exit 1

CMD ["node", "dist/index.js" ]

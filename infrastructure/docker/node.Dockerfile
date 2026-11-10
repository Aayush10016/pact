FROM node:24.18.0-alpine AS builder
WORKDIR /app
RUN npm install --global pnpm@11.20.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/config/package.json ./packages/config/package.json
RUN --mount=type=cache,id=pact-pnpm,target=/pnpm/store pnpm install --frozen-lockfile --store-dir=/pnpm/store --fetch-timeout=600000 --network-concurrency=4
COPY . .
RUN pnpm prepare:packages && pnpm --filter @pact/api build
FROM builder AS web-build
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV PACT_CONTAINER_BUILD=true
RUN pnpm --filter @pact/web build

FROM builder AS api-build
RUN --mount=type=cache,id=pact-pnpm,target=/pnpm/store pnpm --filter @pact/api deploy --legacy --prod --frozen-lockfile /out/api --store-dir=/pnpm/store --fetch-timeout=600000 --network-concurrency=4
# Legacy deploy preserves workspace links. Replace only these two known links with
# compiled workspace packages so the runtime is independent of the build directory.
RUN test -L /out/api/node_modules/@pact/types && test -L /out/api/node_modules/@pact/shared \
    && rm /out/api/node_modules/@pact/types /out/api/node_modules/@pact/shared \
    && mkdir -p /out/api/node_modules/@pact/types /out/api/node_modules/@pact/shared \
    && cp /app/packages/types/package.json /out/api/node_modules/@pact/types/package.json \
    && cp -R /app/packages/types/dist /out/api/node_modules/@pact/types/dist \
    && cp /app/packages/shared/package.json /out/api/node_modules/@pact/shared/package.json \
    && cp -R /app/packages/shared/dist /out/api/node_modules/@pact/shared/dist

FROM node:24.18.0-alpine AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
CMD ["node", "apps/web/server.js"]

FROM node:24.18.0-alpine AS api
WORKDIR /app
COPY --from=api-build --chown=node:node /out/api ./apps/api
# Retain the existing migration and diagnostic entrypoints used by Compose and CI.
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/infrastructure/docker/migrations ./infrastructure/docker/migrations
RUN ln -s apps/api/node_modules node_modules
USER node
CMD ["node", "apps/api/dist/main.js"]

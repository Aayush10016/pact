FROM node:24.18.0-alpine AS base
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
USER node
FROM base AS web
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
USER root
RUN pnpm --filter @pact/web build
USER node
WORKDIR /app/apps/web
CMD ["pnpm", "exec", "next", "start", "--hostname", "0.0.0.0"]
FROM base AS api
CMD ["node", "apps/api/dist/main.js"]

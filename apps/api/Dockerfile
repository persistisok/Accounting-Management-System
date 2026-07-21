FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV XDG_CACHE_HOME=/tmp/prisma-cache

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run prisma:generate -w @ledger/api && npm run build -w @ledger/api

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

USER node
EXPOSE 3000
CMD ["sh", "-c", "npm run prisma:deploy -w @ledger/api && node apps/api/dist/main.js"]

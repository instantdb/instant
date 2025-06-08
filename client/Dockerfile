FROM node:20 AS builder
WORKDIR /app
COPY client/ .
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm build-packages
WORKDIR /app/www
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app/www
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate
COPY --from=builder /app /app
EXPOSE 3000
CMD ["pnpm", "start"]

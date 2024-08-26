FROM node:20
WORKDIR /app
COPY . .

RUN corepack enable pnpm && pnpm i

ENV NODE_ENV=production
RUN pnpm run build

WORKDIR /app/www

EXPOSE 3000

CMD ["pnpm", "start"]
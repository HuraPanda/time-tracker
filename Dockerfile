FROM node:22-alpine

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@10.8.0 --activate

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json nest-cli.json eslint.config.mjs ./
COPY src ./src
COPY test ./test

RUN pnpm install --frozen-lockfile
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start:prod"]

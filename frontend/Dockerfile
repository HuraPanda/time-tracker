FROM node:22-alpine

WORKDIR /app

RUN corepack enable
RUN corepack prepare pnpm@10.8.0 --activate

COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.app.json vite.config.ts index.html ./
COPY src ./src

RUN pnpm install --frozen-lockfile

EXPOSE 5173

CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]

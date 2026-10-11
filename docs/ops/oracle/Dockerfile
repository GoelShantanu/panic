FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY src ./src
COPY docs/database/migrations ./docs/database/migrations
COPY tsconfig.json ./tsconfig.json
RUN npm ci && npm run web:build
ENV NODE_ENV=production
USER node
CMD ["node", "src/apps/web/src/cli/serve.ts"]

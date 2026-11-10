FROM oven/bun:1 AS build
WORKDIR /app
COPY . .
RUN bun install && NITRO_PRESET=node-server bun run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=3000 HOST=0.0.0.0
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

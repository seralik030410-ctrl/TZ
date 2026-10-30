FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/db/migrations ./db/migrations
RUN npm ci --omit=dev --ignore-scripts=false
ENV PORT=3000
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]

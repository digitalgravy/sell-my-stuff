FROM node:24-slim AS build

# Needed here, not just in the runtime stage below -- the homepage ("/")
# is statically prerendered by `next build`, which runs in THIS stage, so
# a component reading process.env.GIT_COMMIT bakes in whatever value (or
# lack of one) is set at build time, not at container start.
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run typecheck && npm run lint && npm run build

FROM node:24-slim AS runtime

ARG GIT_COMMIT
ENV NODE_ENV=production
ENV GIT_COMMIT=$GIT_COMMIT
WORKDIR /app
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chown=node:node entrypoint.sh ./
RUN chmod +x entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["./entrypoint.sh"]

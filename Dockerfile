# Production image for the frontend (Coolify, Docker or any container host).
# Stage 1: build the static site with Astro.
FROM node:24-alpine AS build

WORKDIR /app

# Public PortalTrip API URL. Set at build time because Astro embeds it in the bundle.
# In Coolify: environment variable PUBLIC_API_URL marked as "Build Variable".
ARG PUBLIC_API_URL=http://localhost:8080
ENV PUBLIC_API_URL=$PUBLIC_API_URL

RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Stage 2: serve dist/ with nginx.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1

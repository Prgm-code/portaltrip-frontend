# Imagen de producción del frontend (Coolify, Docker o cualquier host de contenedores).
# Etapa 1: compila el sitio estático con Astro.
FROM node:24-alpine AS build

WORKDIR /app

# URL pública de PortalTrip API. Se fija en tiempo de build porque Astro la incrusta en el bundle.
# En Coolify: variable de entorno PUBLIC_API_URL marcada como "Build Variable".
ARG PUBLIC_API_URL=http://localhost:8080
ENV PUBLIC_API_URL=$PUBLIC_API_URL

RUN npm install -g pnpm@10.34.5

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Etapa 2: sirve dist/ con nginx.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1

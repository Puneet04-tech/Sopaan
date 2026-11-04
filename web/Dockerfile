# Build the PWA and serve it as static files. Build context is the repository root.
FROM node:20-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci
COPY tools/package.json tools/package-lock.json ./tools/
RUN npm --prefix tools ci
COPY tools ./tools
COPY packs ./packs
COPY web ./web
# Regenerate the signed artifacts copied into web/public, then typecheck + build.
RUN npm --prefix tools run packs && npm --prefix web run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80

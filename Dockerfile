# Etapa 1: compilar la aplicación Angular.
FROM node:22-alpine AS build
ENV NG_CLI_ANALYTICS=false
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY . .
RUN npx ng build

# Etapa 2: servir los archivos estáticos. config.json se escribe al arrancar, con API_BASE_URL.
FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/config.json.template /etc/nginx/templates-config/config.json.template
COPY --chmod=0755 nginx/40-write-config.sh /docker-entrypoint.d/40-write-config.sh
COPY --from=build /app/dist/pos-frontend/browser /usr/share/nginx/html

EXPOSE 80

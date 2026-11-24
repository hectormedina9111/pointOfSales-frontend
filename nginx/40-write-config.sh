#!/bin/sh
# Escribe /usr/share/nginx/html/config.json con la dirección del backend de este nodo.
# Solo actúa si API_BASE_URL está definida; si no, se conserva el config.json de la compilación.
# Se ejecuta con el entrypoint de la imagen nginx, después de sus pasos de envsubst.

if [ -n "${API_BASE_URL:-}" ]; then
  envsubst '${API_BASE_URL}' < /etc/nginx/templates-config/config.json.template > /usr/share/nginx/html/config.json
  echo "40-write-config: config.json written with apiBaseUrl=${API_BASE_URL}"
fi

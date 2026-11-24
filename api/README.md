# Cliente de la API

Esta carpeta guarda el contrato OpenAPI del backend (`openapi.json`). A partir del paso 2, el cliente HTTP de `src/app/api` se genera desde ese archivo con `ng-openapi-gen`.

## Cómo actualizar el cliente

1. Levanta el backend (la central escucha en `http://localhost:8080`). En el entorno de Vagrant ya está levantado.
2. Desde la carpeta del frontend ejecuta:

   ```bash
   npm run api:update
   ```

   El comando descarga `http://localhost:8080/v3/api-docs` a `api/openapi.json` y regenera `src/app/api`.
3. Revisa el cambio con `git diff` y haz commit de `api/openapi.json` junto con `src/app/api`.

## Reglas

- Nunca edites `src/app/api` a mano: se sobrescribe en cada generación.
- Si un endpoint cambia en el backend, vuelve a generar y corrige los errores de compilación que aparezcan; el compilador avisa de cada llamada afectada.
- `api/openapi.json` sí va al repositorio, para que el CI compile sin necesidad del backend.

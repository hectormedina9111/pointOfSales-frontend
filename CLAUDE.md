# CLAUDE.md: Frontend del punto de venta

Reglas permanentes para trabajar en este repositorio. El plan completo está en `docs/plan.md` del backend (repositorio `pointOfSales`), sección "MVP del frontend (Angular)". Consúltalo antes de diseñar o cambiar cualquier pantalla. Si algo aquí contradice el plan, manda este archivo y avisa de la diferencia.

## Idioma

- **Todo el código va en inglés:** nombres de archivos, clases, métodos, variables, claves de traducción, rutas, campos, valores y nombres de pruebas. Los mensajes de commit también van en inglés, en modo imperativo (`Add node information page`).
- **Solo la documentación va en español:** `docs/`, README, `CLAUDE.md`, `api/README.md` y comentarios dirigidos a personas del equipo.
- **Ningún texto visible para la persona va escrito en plantillas ni en el código.** Todo texto (incluidos los mensajes de error) sale de `public/i18n/es.json` y `public/i18n/en.json`, con la misma clave en los dos archivos. En las plantillas se usa siempre `{{ 'clave' | translate }}`.
- `npm run check:i18n` (también en el CI) falla si una clave usada no existe en los dos archivos o si los archivos no tienen las mismas claves. nginx sirve `/i18n/` sin caché para que el navegador nunca use un diccionario viejo.
- El idioma por defecto es español. Se guarda en `localStorage` (con try/catch) y se envía al backend en `Accept-Language`.

## Stack (no cambiar sin acordarlo)

- Angular 22, TypeScript en modo estricto, componentes standalone (sin `NgModule`), signals y `inject()`.
- Zoneless: `provideZonelessChangeDetection()`. No se instala `zone.js`.
- Bootstrap 5.3 con ng-bootstrap 21 (MIT). **No usar PrimeNG** (su licencia es de pago para empresas que no son pequeñas).
- Sin librerías de traducción de terceros: el servicio propio está en `src/app/core/i18n`.
- Sin pruebas en esta etapa (ver "Pruebas").
- Dependencias mínimas: no agregar una librería sin acordarlo.

## Arquitectura

- `src/app/core`: servicios transversales (configuración de la web en `config/`, datos del nodo en `system/`, i18n, interceptores HTTP en `http/`). Se importa desde cualquier parte, pero `core` nunca importa de `features`.
- `src/app/shared`: pipes y componentes reutilizables sin lógica de negocio.
- `src/app/features/<nombre>`: una carpeta por pantalla o área funcional (`home`, luego `session`, `users`, `catalog`, etc.).
- `src/app/api`: cliente HTTP generado desde el OpenAPI del backend (a partir del paso 2). **Nunca se edita a mano.** Se regenera con `npm run api:update`.
- Hasta que se ejecute `npm run api:update` por primera vez, los servicios tipados se escriben a mano en `src/app/core/api` (hoy lo son todos los servicios de la aplicación), con interfaces que coinciden con los records Java del backend. Cuando se genere `src/app/api`, esos servicios se sustituyen por el cliente generado y se borran.
- Las llamadas a la API usan **rutas relativas** que empiezan por `/api/`. El interceptor `api-base-url` les antepone `apiBaseUrl`, que se lee de `config.json` al arrancar (`AppConfigService`). Nunca se escribe una URL absoluta ni un puerto en el código.
- **Una web por nodo:** cada nodo (central, tienda 1, tienda 2) sirve su propia web y esa web solo llama a su propio backend, con llamadas directas (CORS). No hay proxy ni selector de servidor.
- `public/config.json` es la configuración de `npm start` (apunta a la central en la máquina virtual). En Docker, `API_BASE_URL` genera el `config.json` de cada nodo al arrancar el contenedor.
- **Formularios con pasos:** los formularios con muchos campos o varios pasos se hacen como asistente por pasos (stepper). Cada paso marca sus campos obligatorios con `*` y no deja avanzar hasta que son válidos; el último paso muestra un resumen antes de guardar.
  - Reutilizar `app-stepper` + `app-step` (`src/app/shared/components/stepper`), solo con Bootstrap. Cada `app-step` recibe `labelKey` y `[controls]`; el asistente emite `finish` solo si todos los pasos son válidos.
  - Reutilizar `app-field-label` (`src/app/shared/components/field-label`) para la etiqueta de todo campo nuevo: `<app-field-label targetId="id-del-control" [required]="true">{{ 'clave' | translate }}</app-field-label>`. Muestra el `*` rojo y el texto "obligatorio" para lectores de pantalla.
- La lógica de negocio no va en las plantillas: si una pantalla necesita decidir algo, eso se calcula en el componente o en un servicio.

## API del backend

- Rutas bajo `/api/v1`. Errores en RFC 9457 (`application/problem+json`) con la propiedad `code`.
- Al mostrar un error, se muestra el texto traducido de la aplicación; el campo `detail` solo se muestra como detalle adicional.
- Los permisos de cada botón salen de `/me/privileges` (paso 2). No se fijan roles en el código.
- Algunos errores del backend no traen `code`: las credenciales incorrectas (401), la cuenta bloqueada (423), el cambio de contraseña pendiente (403 del filtro) y la validación (400 con `errors`). `resolveErrorCode` deduce el código del estado HTTP cuando falta; las pantallas pueden indicar el código exacto (por ejemplo `INVALID_CREDENTIALS` en el login).
- Sesión: los tokens se guardan en `sessionStorage`. Con la contraseña pendiente, el backend solo permite `GET /me`, `POST /me/password` y `POST /auth/logout`, así que menús y privilegios no se cargan hasta que se cambie la contraseña.

## Testing

- **Dos etapas:** primero solo se construye la aplicación, **sin escribir pruebas nuevas**. Las pruebas se escriben en una segunda etapa, al terminar el frontend. Mientras tanto no hay pruebas en el repositorio y el CI solo compila.
- Para entonces: pruebas de servicios y pipes con Vitest o Karma (se decidirá entonces), y pruebas de las pantallas contra el backend real cuando aplique.
- Antes de dar una tarea por terminada: `npm run build` debe compilar sin errores.

## Forma de trabajo

- Alcance actual: **MVP 3A: caja y venta** (ver `docs/plan.md` del backend).
- Cambios pequeños y enfocados; un commit por paso lógico.
- Si una decisión no está en el plan o lo contradice, preguntar antes de implementarla y, una vez decidida, actualizar `docs/plan.md` del backend.

## Flujo de Git

- Nunca hacer push directo a `main`.
- Cada paso va en su propia rama `feature/step-N-<nombre>`.
- Al terminar un paso: push de la rama y Pull Request hacia `main`, con la descripción de los requerimientos cubiertos y cómo probarlos.
- El CI (GitHub Actions) debe pasar antes de unir el PR.
- No empezar el siguiente paso hasta que el PR esté revisado y unido a `main`.
- Excepción autorizada por el responsable: cuando él lo pide, los pasos se encadenan en PRs apilados, cada uno apuntando a la rama del anterior.
- Si el CI genera `package-lock.json` por primera vez, lo sube al PR el propio workflow. Ese archivo siempre se versiona.

## Límite de uso del plan

- El trabajo no debe pasar del **70 %** del límite de 5 horas ni del límite semanal del plan.
- El control es automático. Los archivos de control del backend (`.claude/statusline.ps1`, `.claude/hooks/usage-guard.ps1`) no se desactivan, no se editan ni se rodean.
- Trabajar en pasos cortos y hacer commit al terminar cada parte que compile, para que un corte por límite no deje trabajo a medias.
- Si la sesión se detiene por el límite, en la siguiente sesión empezar resumiendo qué quedó hecho y qué falta, antes de escribir código.

## Entorno de desarrollo

- Se desarrolla en **Windows**. Los dos repositorios están uno al lado del otro:
  - Backend: `C:\Users\hector.giron\repositorios\pointOfSales`
  - Frontend: `C:\Users\hector.giron\repositorios\pointOfSales-frontend`
- En el equipo: Git (con Git Bash), Node 22, VirtualBox, Vagrant y Claude Code.
- La máquina virtual de Vagrant (Ubuntu) se crea desde el repositorio del backend. Levanta cada nodo con su web, compilada desde la carpeta compartida: central en `http://192.168.56.10`, tienda 1 en `http://192.168.56.11` y tienda 2 en `http://192.168.56.12`. Las APIs quedan en el puerto 8080 de cada IP.
- Los scripts deben funcionar en Windows. Los archivos que se ejecutan dentro de Linux (Dockerfile, `nginx/`, scripts `.sh`) usan finales de línea LF, definidos en `.gitattributes`.

## Comandos útiles

- `npm install`: instala dependencias (la primera vez genera `package-lock.json`).
- `npm start`: servidor de desarrollo en `http://localhost:4200`; usa `public/config.json` para saber a qué backend llamar. Para otro nodo, edita ese archivo.
- `npm run build`: compila la aplicación en `dist/pos-frontend/browser`.
- `npm run api:update`: descarga el OpenAPI de la central y regenera `src/app/api` (requiere el backend levantado).
- `docker build -t pos-frontend:ci .`: construye la imagen que sirve nginx.

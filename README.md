# Punto de venta: frontend

Frontend web del sistema punto de venta, hecho con Angular 22, TypeScript, Bootstrap 5.3 y ng-bootstrap 21. Consume la API REST del backend ([pointOfSales](https://github.com/hectormedina9111/pointOfSales)).

El plan completo está en `docs/plan.md` del backend, sección "MVP del frontend (Angular)".

## Qué incluye este paso (base)

- Proyecto Angular 22 standalone, zoneless y en modo estricto.
- Selector de servidor: central, tienda 1 o tienda 2. Cambia a qué nodo van las llamadas a la API.
- Cambio de idioma entre español (por defecto) e inglés.
- Pantalla de inicio que muestra la aplicación, la versión, el rol y el número del nodo seleccionado.
- Contenedor Docker con nginx que sirve la web y reenvía las llamadas a cada backend.

El inicio de sesión llega en el siguiente paso.

## Requisitos

- Para desarrollo local: Node.js 22.12 o superior y npm.
- Para usar el entorno completo: solo Vagrant y VirtualBox. La máquina virtual ya trae todo lo necesario.

## Desarrollo local con `npm start`

1. Levanta el backend en la máquina virtual de Vagrant (IP `192.168.56.10`, configurable en el backend con `POS_VM_IP`) (repositorio `pointOfSales`). Las tres APIs quedan en `192.168.56.10:8080` (central), `8081` (tienda 1) y `8082` (tienda 2).
2. En esta carpeta ejecuta:

   ```bash
   npm install
   npm start
   ```

3. Abre `http://localhost:4200`. El servidor de desarrollo reenvía `/central`, `/store1` y `/store2` a los puertos del backend según `proxy.conf.json`.

## Dentro de la máquina virtual

Con `vagrant up` desde el repositorio del backend, la web también se construye desde esta carpeta compartida y queda disponible en `http://192.168.56.10:4200`, servida por nginx. No hace falta Node.js en Windows para eso.

## Uso

- **Selector de servidor:** en la barra superior elige central, tienda 1 o tienda 2. La pantalla vuelve a consultar el nodo elegido, y la selección se recuerda en el navegador.
- **Idioma:** los botones Español e English cambian los textos y el idioma que se envía al backend.

## Actualizar el cliente de la API

Con el backend levantado en `192.168.56.10:8080`:

```bash
npm run api:update
```

Esto descarga el contrato OpenAPI a `api/openapi.json` y regenera `src/app/api`. Esa carpeta nunca se edita a mano. Más detalles en [api/README.md](api/README.md).

## Otros comandos

- `npm run build`: compila la aplicación para producción en `dist/pos-frontend/browser`.
- `npm run watch`: compila en modo desarrollo y vuelve a compilar al cambiar archivos.
- `docker build -t pos-frontend:ci .`: construye la imagen de nginx como lo hace el CI.

## Reglas del proyecto

Las reglas de trabajo (idioma, arquitectura, pruebas, ramas y PR) están en [CLAUDE.md](CLAUDE.md).

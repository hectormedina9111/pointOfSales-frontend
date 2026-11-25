# Punto de venta: frontend

Interfaz web del sistema punto de venta, hecha con Angular 22, TypeScript, Bootstrap 5.3 y ng-bootstrap 21. Consume la API REST del backend ([pointOfSales](https://github.com/hectormedina9111/pointOfSales)). El plan completo está en [`docs/plan.md`](https://github.com/hectormedina9111/pointOfSales/blob/main/docs/plan.md) del backend, sección "MVP del frontend (Angular)".

## Requisitos

- Para desarrollo con `npm start`: Node.js 22.12 o superior y npm.
- Para el entorno completo: VirtualBox y Vagrant. La máquina virtual ya trae todo lo necesario.
- Para construir la imagen de nginx: Docker (opcional).

## Cómo funciona

Hay una web por nodo. Cada nodo (central, tienda 1 y tienda 2) sirve su propia web y esa web solo llama a la API de su propio backend, con llamadas directas (CORS). No hay proxy ni selector de servidor.

| Nodo | Web | API (backend) |
|------|-----|---------------|
| Central | `http://192.168.56.10` | `http://192.168.56.10:8080` |
| Tienda 1 | `http://192.168.56.11` | `http://192.168.56.11:8080` |
| Tienda 2 | `http://192.168.56.12` | `http://192.168.56.12:8080` |

El `vagrant up` del repositorio del backend crea la máquina virtual y compila esta carpeta (`pointOfSales-frontend`, carpeta hermana del backend) para servir la web de cada nodo. En cada contenedor, la variable `API_BASE_URL` indica la API de ese nodo; el script `nginx/40-write-config.sh` escribe el `config.json` al arrancar.

Para construir la imagen de una tienda a mano:

```bash
docker build -t pos-frontend:store1 .
docker run -p 80:80 -e API_BASE_URL=http://192.168.56.11:8080 pos-frontend:store1
```

## Desarrollo con `npm start`

1. Levante la central en la máquina virtual (`vagrant up` desde el repositorio del backend). Su API queda en `http://192.168.56.10:8080`.
2. En esta carpeta ejecute:

   ```bash
   npm install
   npm start
   ```

3. Abra `http://localhost:4200`. La web lee `public/config.json`, que apunta a la central (`"apiBaseUrl": "http://192.168.56.10:8080"`).

Para apuntar la web a otro nodo, edite `public/config.json`. El backend debe permitir CORS desde `http://localhost:4200`.

## Iniciar sesión

- **Local (máquina virtual):** usuario `admin`, contraseña `Admin.Local.2026`. Es la contraseña de desarrollo de `.env.example` del backend.
- En la **central**, el sistema obliga a cambiar la contraseña en el primer ingreso.
- Los usuarios de las tiendas llegan por sincronización desde la central. Solo pueden iniciar sesión en las tiendas que indique `user_branch`.
- Si la cuenta se bloquea por demasiados intentos fallidos, la pantalla de inicio de sesión lo indica y hay que esperar.
- La sesión se guarda en la pestaña (`sessionStorage`): sobrevive a recargar la página, pero se cierra al cerrar la pestaña.

## Pantallas

El menú lateral sale de los menús que el backend entrega a cada usuario. Cada botón de escritura aparece solo si el usuario tiene su privilegio.

- **Inicio:** en la central, un widget con las tiendas; en una tienda, el resumen de sincronización.
- **Administración:** usuarios (alta, edición, sucursales de inicio de sesión y restablecimiento de contraseña) y roles y privilegios.
- **Organización:** países (uno por servidor central), empresa (un solo formulario), y sucursales.
- **Catálogo:** unidades de medida, impuestos por país, categorías en forma de árbol, y productos con búsqueda y asignación de impuestos por país.
- **Precios:** listas de precios con sus precios por producto, y consulta de precio (precio unitario, base gravable, impuesto y tasa).
- **Tiendas:** nodos (solo en la central: estado, latidos, cambios pendientes, código de activación, asignación de sucursal y revocación) y estado de sincronización (solo en una tienda).
- **Ventas:** las pantallas de punto de venta y de ventas realizadas están en construcción (se muestran como "En construcción" hasta su etapa). Mi caja y sesiones de caja están en la sección Caja. Las rutas que no existen muestran "Página no encontrada".
- **Configuración de ventas:** cajas por sucursal (filtros por sucursal y estado; alta y edición solo en la central) y métodos de pago (solo edición en la central; los códigos los define el sistema).
- **Auditoría:** bitácora paginada con filtros, y comparación de valores antes y después de cada cambio.
- **Cambio de contraseña:** disponible en la central y en las tiendas, desde el menú del usuario.

## Caja (tienda)

Las pantallas de caja se operan en las tiendas. En la central, las rutas de caja muestran un aviso; la única pantalla que consulta la central es "Sesiones de caja".

- **Mi caja (`/cash/session`):** si el cajero no tiene sesión abierta, un asistente abre la caja en tres pasos (caja activa de la tienda, fondo inicial y resumen). Con sesión abierta muestra la caja, el resumen esperado por método de pago y los movimientos. Desde ahí:
  - **Depósito y retiro:** piden monto y motivo. Un retiro pide la autorización de un jefe de tienda (usuario y contraseña), salvo que el cajero tenga el privilegio `ACTION_CASH_WITHDRAWAL`. La contraseña del jefe se envía solo en esa petición y no se guarda.
  - **Cerrar caja:** asistente de tres pasos: conteo por cada método de pago activo (cero permitido), diferencias (vista previa en centavos: rojo si falta, amarillo si sobra, verde si cuadra) y confirmación. Al terminar se muestra el cierre con el botón Imprimir, que imprime solo ese cierre.
- **Sesiones de caja (`/cash/sessions`):** listado paginado con filtros de estado, caja y rango de fechas. Cada fila abre el detalle con el conteo al cierre y los movimientos. Es de solo lectura.

Los botones aparecen solo si el usuario tiene el privilegio de la acción (`POST_CASH_SESSIONS`, `POST_CASH_SESSIONS_ID_MOVEMENTS`, `POST_CASH_SESSIONS_ID_CLOSE`) y el nodo es una tienda. Los montos se muestran con la moneda de la empresa; si la empresa no está configurada, solo con dos decimales.

## Reglas de negocio visibles en la web

- La central ve todas las sucursales. Cada tienda ve solo la sucursal que le asignó la central (`store_identity.branch_id`).
- `user_branch` decide en qué tienda puede iniciar sesión cada usuario.
- La contraseña se puede cambiar en una tienda. El cambio surte efecto allí al momento y se replica a la central y a las demás tiendas.
- Solo la central escribe catálogo, precios, usuarios, roles y privilegios; en una tienda esas pantallas solo muestran datos, y las escrituras responden 403 (`READ_ONLY_NODE`).
- Cada servidor central atiende un solo país. Las pantallas con selector de país lo preseleccionan.
- Los montos viajan como texto y la web no hace cálculos con ellos: el backend resuelve precios e impuestos. La única excepción es la vista previa de diferencias del cierre de caja, que la web calcula en centavos (el backend recalcula al cerrar).

## Ver la réplica

Con el entorno levantado, las tiendas se activan solas. Estos pasos muestran cómo llega a las tiendas un cambio hecho en la central.

1. Abra la web de la central, `http://192.168.56.10`, e inicie sesión.
2. Vaya a **Tiendas > Nodos**. La tienda 1 y la tienda 2 deben aparecer como **Activa**, con cambios pendientes en 0.
3. Abra la web de la tienda 1, `http://192.168.56.11`, en otra ventana, para ver a la vez el panel de la central.
4. En la central, cambie el precio de un producto: **Precios > Listas de precios**, entre con **Precios** en una lista de precio fijo, cambie el precio y guarde.
5. En el panel, la tarjeta de la tienda 1 muestra los cambios pendientes subiendo y bajando a 0 en unos 30 segundos. Al llegar a 0, la tarjeta se resalta durante dos segundos.
6. En la web de la tienda 1, vaya a **Precios > Consulta de precio**, elija el producto y compruebe el precio nuevo. En **Tiendas > Estado de sincronización**, la versión aplicada coincide con la de la central.
7. Opcional: en **Auditoría**, filtre por la entidad de listas de precios para ver los valores antes y después.

### Prueba de corte

Dentro de la máquina virtual (`vagrant ssh`, en `/vagrant`, carpeta del repositorio del backend):

1. Ejecute `scripts/simulate-outage.sh store2 down`. La tienda 2 pierde la conexión con la central, pero sigue funcionando con sus datos.
2. Cambie otro precio en la central, como en el paso 4 de la réplica.
3. En el panel, los pendientes de la tienda 1 bajan a 0. Los de la tienda 2 suben y, tras unos dos minutos sin latido, la tienda aparece como **Desincronizada**, con conexión **Sin conexión**.
4. En la web de la tienda 2, `http://192.168.56.12`, **Consulta de precio** sigue mostrando el precio anterior.
5. Ejecute `scripts/simulate-outage.sh store2 up`. En el siguiente ciclo, la tienda 2 aplica el cambio, sus pendientes bajan a 0 y vuelve a **Activa**.

El panel se actualiza cada 5 segundos mientras la pestaña está visible, y se pone al día al volver a mostrarla.

## Idioma e i18n

- El idioma por defecto es español. Se guarda en `localStorage` (con try/catch) y se envía al backend en `Accept-Language`.
- Ningún texto visible va escrito en plantillas ni en el código. Todo sale de `public/i18n/es.json` y `public/i18n/en.json`, con la misma clave en los dos archivos, y en las plantillas se usa `{{ 'clave' | translate }}`.
- Los errores de la API se muestran con las claves `error.<CODIGO>`.
- `npm run check:i18n` (también en el CI) falla si una clave usada no existe en los dos archivos o si los archivos no tienen las mismas claves.
- nginx sirve `/i18n/` sin caché, para que el navegador nunca use un diccionario viejo.

## Cliente de la API

Hasta que se ejecute `npm run api:update` por primera vez, los servicios se escriben a mano en `src/app/core/api`, con interfaces que coinciden con los records del backend. Cuando se genere `src/app/api` desde el OpenAPI de la central, esos servicios se sustituyen por el cliente generado. Ver [api/README.md](api/README.md).

## Otros comandos

- `npm run build`: compila la aplicación en `dist/pos-frontend/browser`.
- `npm run watch`: compila en modo desarrollo y vuelve a compilar al cambiar archivos.
- `npm run check:i18n`: verifica las traducciones.

## Formularios con pasos

Los formularios largos son asistentes por pasos con `app-stepper` y `app-step` (`src/app/shared/components/stepper`). Cada paso recibe los controles que debe validar; el botón Siguiente no avanza mientras haya errores: marca los campos y lleva el foco al primero con error. El último paso es el resumen y guarda. Los campos obligatorios se marcan con `app-field-label` (`required`), que muestra el asterisco. El alta de producto (`catalog/products/product-form`) es el ejemplo.

## Reglas del proyecto

Las reglas de trabajo (idioma, arquitectura, pruebas, ramas y PR) están en [CLAUDE.md](CLAUDE.md).

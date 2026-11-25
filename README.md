# Punto de venta: frontend

Frontend web del sistema punto de venta, hecho con Angular 22, TypeScript, Bootstrap 5.3 y ng-bootstrap 21. Consume la API REST del backend ([pointOfSales](https://github.com/hectormedina9111/pointOfSales)).

El plan completo está en `docs/plan.md` del backend, sección "MVP del frontend (Angular)".

## Qué incluye este paso (sesión y menú)

- Proyecto Angular 22 standalone, zoneless y en modo estricto.
- Configuración por nodo en `public/config.json` (o en `API_BASE_URL` dentro de Docker): la web llama directamente a la API de su propio backend.
- Cambio de idioma entre español (por defecto) e inglés.
- Pantalla de inicio que muestra la aplicación, la versión, el rol, el número del nodo y la dirección del backend al que está conectada.
- Inicio de sesión con usuario y contraseña, cambio de contraseña y cierre de sesión.
- Menú lateral generado a partir de los menús que el backend entrega al usuario. Las rutas que aún no tienen pantalla muestran un aviso provisional.
- Contenedor Docker con nginx que solo sirve la web.

## Administración (paso 3)

Pantallas de administración. Cada botón solo aparece si el usuario tiene su privilegio, y los de escritura solo en la central.

- **Usuarios** (`Administración > Usuarios`): listado paginado con alta, edición, sucursales en las que puede iniciar sesión (`user_branch`) y restablecimiento de contraseña. La visibilidad de sucursales depende del nodo, no del usuario: las sucursales en las que un usuario puede iniciar sesión solo se eligen aquí. La contraseña inicial es obligatoria al dar de alta; el usuario debe cambiarla en su primer ingreso.
- **Roles y privilegios** (`Administración > Roles y privilegios`): alta y edición de roles, y asignación de privilegios agrupados por tipo (API, menús y acciones) y por módulo. Cambiar los privilegios de un rol afecta a todos sus usuarios, por eso se pide confirmación.
- **Sucursales:** el diálogo de sucursales de un usuario solo muestra las sucursales que ve quien administra. Si no aparece ninguna, cree las sucursales y asígnelas primero a su propio usuario.
- En una tienda, las pantallas de administración solo muestran los datos: las escrituras se ocultan y, si se intentan, el backend responde `READ_ONLY_NODE`.
- En pantallas pequeñas, el menú lateral se abre con el botón de la barra superior.

## Organización y catálogo (paso 4)

Pantallas de datos maestros. La central escribe; en una tienda las pantallas solo muestran los datos y los botones de cambio no aparecen. Cada botón también exige su privilegio (`POST_PRODUCTS`, `PUT_PRODUCTS_ID`, etc.).

- **Países** (`Organización > Países`): listado paginado con alta y edición. Incluye el proveedor de facturación fiscal (`HN_SAR` o `NONE`). Los países solo existen en la central: en una tienda el menú no los muestra y la pantalla solo indica que se administran en la central.
- **Empresa** (`Organización > Empresa`): un solo formulario. Mientras la empresa no esté configurada, el formulario aparece vacío con un aviso; se guarda con `PUT /company`.
- **Sucursales** (`Organización > Sucursales`): en la central, listado de todas las sucursales, con alta y edición. En una tienda, solo aparece la sucursal que le asignó la central. Permite elegir país y lista de precios por defecto (opcional).
- **Unidades de medida** (`Catálogo > Unidades de medida`): listado paginado con alta y edición. Indica si la unidad admite decimales.
- **Impuestos** (`Catálogo > Impuestos`): listado filtrado por país, con alta y edición. El país se elige al crear y no cambia después. La tasa va de 0 a 100 con hasta 2 decimales.
- **Categorías** (`Catálogo > Categorías`): vista de árbol. El padre no puede ser la propia categoría ni una de sus subcategorías. Desactivar pide confirmación.
- **Productos** (`Catálogo > Productos`): búsqueda por nombre, SKU o código de barras (espera 300 ms al escribir), filtros por categoría, tipo y estado, y listado paginado. Desde el formulario, un servicio no controla inventario ni seriales, y controlar seriales obliga a controlar inventario. El botón **Impuestos por país** asigna un impuesto a cada país donde se vende el producto.

Los montos viajan como texto (`"12.50"`) y se muestran con dos decimales. La web no hace cálculos con ellos.

Los errores de negocio (por ejemplo, SKU repetido o categoría en uso) se traducen con las claves `error.<CODIGO>` de `public/i18n/es.json` y `en.json`.

## Precios (paso 5)

Pantallas de precios. Los botones de cambio solo aparecen en la central y con su privilegio (`POST_PRICE_LISTS`, `PUT_PRICE_LISTS_ID`, `POST_PRICE_LISTS_ID_ITEMS`, etc.). La consulta de precio funciona igual en la central y en las tiendas, porque es solo lectura.

- **Listas de precios** (`Precios > Listas de precios`): listado paginado filtrado por país y estado, con alta y edición. El método es precio fijo por producto (`FIXED_PRICE`) o descuento sobre el precio base (`PERCENT_OFF_BASE`); el descuento solo se pide con este último. Las fechas de vigencia están vacías cuando la lista no tiene límite.
- **Precios por producto** (botón **Precios** de una lista de precio fijo, ruta `pricing/price-lists/:id`): tabla de precios con producto (nombre y SKU), cantidad mínima y precio. Se filtra por producto con el selector de búsqueda, y se agregan, editan y eliminan precios. Eliminar pide confirmación; un precio no es un catálogo, así que se borra de verdad.
- **Consulta de precio** (`Precios > Consulta de precio`): elija un producto y, si quiere, una lista de precios, una sucursal, una cantidad y una fecha. La pantalla muestra el precio unitario, su origen (lista o precio base), la base gravable, el monto del impuesto y la tasa. Los montos tienen dos decimales y la moneda del país de la lista o de la sucursal.

Ejemplo de cálculo: un producto cuesta L 115.00 con ISV del 15 %. Como el precio incluye el impuesto, la base gravable se calcula hacia atrás: base = 115.00 / 1.15 = **100.00**, y el ISV = 115.00 - 100.00 = **15.00**.

El selector de productos espera 300 ms al escribir y solo muestra productos activos, porque un producto inactivo no tiene precio. La cantidad y los montos viajan como texto y la web no hace cálculos con ellos: el precio lo resuelve el backend.

## Tiendas, sincronización y auditoría (paso 6)

- **Tiendas > Nodos** (solo en la central): una tarjeta por tienda, con su número, sucursal, estado (Activa, Desincronizada, Revocada o Pendiente), conexión, último latido, versiones, cambios pendientes y rango de ids. Se actualiza sola cada 5 segundos mientras la pestaña está visible; el interruptor **Actualizar automáticamente** la pausa. Desde la tarjeta: **Código de activación** (se muestra una sola vez, con botón para copiarlo) y **Revocar** (pide confirmación). **Registrar tienda** da de alta una tienda, con sucursal opcional.
- **Asignar sucursal** (en la tarjeta, solo en la central y con su privilegio): cambia o quita la sucursal de una tienda; una tienda sin sucursal aparece con la etiqueta **Sin sucursal**, y conviene asignarle una para que solo entren los usuarios de esa sucursal.
- **Cambio de contraseña** también en una tienda: el cambio surte efecto allí al momento y llega a la central y a las demás tiendas en un minuto aproximadamente. La tarjeta de cada tienda en el panel muestra los **envíos pendientes** y, si hay alguno, el más antiguo.
- **Tiendas > Estado de sincronización** (en una tienda): versión aplicada, última sincronización y último error. En la central solo enlaza al panel.
- **Auditoría**: bitácora paginada, de la más reciente a la más antigua, con filtros por entidad, id y fechas (en hora local). Cada fila se abre para comparar los valores antes y después; los campos que cambiaron aparecen resaltados.
- **Inicio**: en la central, un widget con las tiendas; en una tienda, el resumen de sincronización.

### Ver la réplica

Con el entorno levantado (`vagrant up`), las tiendas se activan solas. Estos pasos muestran cómo llega a las tiendas un cambio hecho en la central.

1. Abra la web de la central, `http://192.168.56.10`, e inicie sesión.
2. Vaya a **Tiendas > Nodos**. Compruebe que la tienda 1 y la tienda 2 aparecen como **Activa**, con los cambios pendientes en 0.
3. Abra la web de la tienda 1, `http://192.168.56.11`, en otra ventana del navegador, de modo que pueda ver a la vez el panel de la central.
4. En la central, cambie el precio de un producto: **Precios > Listas de precios**, entre con **Precios** en una lista de precio fijo, cambie el precio del producto y guarde.
5. Vuelva al panel. En la tarjeta de la tienda 1, los **cambios pendientes** suben y bajan a 0 en unos 30 segundos. Cuando llegan a 0, la tarjeta se resalta durante dos segundos.
6. En la ventana de la tienda 1, vaya a **Precios > Consulta de precio**, elija el producto y compruebe que aparece el precio nuevo. En **Tiendas > Estado de sincronización**, la última versión aplicada coincide con la versión de la central.
7. Opcional: en **Auditoría**, filtre por la entidad de precios de lista para ver el cambio con sus valores antes y después.

Prueba de corte (dentro de la máquina virtual, `vagrant ssh`, en la carpeta `/vagrant` del repositorio del backend):

1. Ejecute `scripts/simulate-outage.sh store2 down`. La tienda 2 pierde la conexión con la central, pero sigue funcionando con sus datos.
2. Cambie otro precio en la central, como en el paso 4.
3. En el panel, los cambios pendientes de la tienda 1 bajan a 0. Los de la tienda 2 suben, y tras unos dos minutos sin latido la tienda aparece como **Desincronizada**, con conexión **Sin conexión**.
4. En la web de la tienda 2, `http://192.168.56.12`, **Consulta de precio** sigue mostrando el precio anterior.
5. Ejecute `scripts/simulate-outage.sh store2 up`. En el siguiente ciclo de sincronización la tienda 2 aplica el cambio: sus pendientes bajan a 0, su tarjeta se resalta y vuelve a **Activa**.

Notas: el panel deja de actualizarse mientras la pestaña está oculta y se pone al día al volver a mostrarla. El estado de una tienda sale de su último latido; una tienda sin latido durante dos minutos se muestra como desincronizada.

## Iniciar sesión

- **Local (máquina virtual):** entre con el usuario `admin` y la contraseña `Admin.Local.2026`. Es la contraseña de desarrollo de `.env.example` del backend. El sistema obliga a cambiarla en el primer ingreso, en la **central**.
- **Tiendas:** los usuarios llegan por sincronización desde la central, así que entran con las mismas contraseñas. En una tienda no se puede cambiar la contraseña: si el usuario debe cambiarla, la tienda lo indica y el cambio se hace en la central.
- Si la cuenta se bloquea por demasiados intentos fallidos, la pantalla de inicio de sesión lo indica y hay que esperar.
- La sesión se guarda en la pestaña (`sessionStorage`): sobrevive a recargar la página, pero se cierra al cerrar la pestaña.

## Arquitectura: una web por nodo

Cada nodo (central, tienda 1, tienda 2) es una máquina distinta con su propia web y su propio backend. La web de cada nodo habla solo con el backend de ese nodo, con una llamada directa (entre orígenes distintos, por CORS). No hay proxy ni selector de servidor.

- Las llamadas a la API usan rutas relativas que empiezan por `/api/`. El interceptor `api-base-url` les antepone `apiBaseUrl`, que viene de `config.json`.
- `config.json` se lee antes de mostrar la aplicación. Si no se puede leer, las llamadas van al mismo origen.

## Requisitos

- Para desarrollo local: Node.js 22.12 o superior y npm.
- Para usar el entorno completo: solo Vagrant y VirtualBox. La máquina virtual ya trae todo lo necesario.

## Desarrollo local con `npm start`

1. Levanta el backend de la central en la máquina virtual de Vagrant (IP `192.168.56.10`, repositorio `pointOfSales`). Su API queda en `http://192.168.56.10:8080`.
2. En esta carpeta ejecuta:

   ```bash
   npm install
   npm start
   ```

3. Abre `http://localhost:4200`. La web lee `public/config.json`, que apunta a `http://192.168.56.10:8080` (la central).

Para apuntar la web a otro nodo, edita `public/config.json`, por ejemplo `"apiBaseUrl": "http://192.168.56.11:8080"` para la tienda 1. El backend debe permitir CORS desde el origen de la web (`http://localhost:4200` en desarrollo).

## Dentro de la máquina virtual

Con `vagrant up` desde el repositorio del backend, cada nodo levanta su propia web, compilada desde esta carpeta compartida:

| Nodo | Web | API (backend) |
|------|-----|---------------|
| Central | `http://192.168.56.10` | `http://192.168.56.10:8080` |
| Tienda 1 | `http://192.168.56.11` | `http://192.168.56.11:8080` |
| Tienda 2 | `http://192.168.56.12` | `http://192.168.56.12:8080` |

En cada contenedor de la web, la variable `API_BASE_URL` indica la API de ese nodo. Al arrancar, el script `nginx/40-write-config.sh` escribe `config.json` con ese valor. Si `API_BASE_URL` no está definida, se usa el `config.json` de la compilación.

Para construir la imagen de una tienda a mano:

```bash
docker build -t pos-frontend:store1 .
docker run -p 80:80 -e API_BASE_URL=http://192.168.56.11:8080 pos-frontend:store1
```

## Uso

- **Nodo:** la barra superior muestra el nodo al que está conectada la web (Central, Tienda 1, etc.), tomado de la API de ese nodo.
- **Idioma:** los botones Español e English cambian los textos y el idioma que se envía al backend.

## Actualizar el cliente de la API

Con el backend de la central levantado en `192.168.56.10:8080`:

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

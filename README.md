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

- **Usuarios** (`Administración > Usuarios`): listado paginado con alta, edición, sucursales asignadas y restablecimiento de contraseña. La contraseña inicial es obligatoria al dar de alta; el usuario debe cambiarla en su primer ingreso.
- **Roles y privilegios** (`Administración > Roles y privilegios`): alta y edición de roles, y asignación de privilegios agrupados por tipo (API, menús y acciones) y por módulo. Cambiar los privilegios de un rol afecta a todos sus usuarios, por eso se pide confirmación.
- **Sucursales:** el diálogo de sucursales de un usuario solo muestra las sucursales que ve quien administra. Si no aparece ninguna, cree las sucursales y asígnelas primero a su propio usuario.
- En una tienda, las pantallas de administración solo muestran los datos: las escrituras se ocultan y, si se intentan, el backend responde `READ_ONLY_NODE`.
- En pantallas pequeñas, el menú lateral se abre con el botón de la barra superior.

## Organización y catálogo (paso 4)

Pantallas de datos maestros. La central escribe; en una tienda las pantallas solo muestran los datos y los botones de cambio no aparecen. Cada botón también exige su privilegio (`POST_PRODUCTS`, `PUT_PRODUCTS_ID`, etc.).

- **Países** (`Organización > Países`): listado paginado con alta y edición. Incluye el proveedor de facturación fiscal (`HN_SAR` o `NONE`).
- **Empresa** (`Organización > Empresa`): un solo formulario. Mientras la empresa no esté configurada, el formulario aparece vacío con un aviso; se guarda con `PUT /company`.
- **Sucursales** (`Organización > Sucursales`): listado de las sucursales asignadas al usuario, con alta y edición. Una sucursal nueva no aparece hasta asignarla a su usuario en `Administración > Usuarios`. Permite elegir país y lista de precios por defecto (opcional).
- **Unidades de medida** (`Catálogo > Unidades de medida`): listado paginado con alta y edición. Indica si la unidad admite decimales.
- **Impuestos** (`Catálogo > Impuestos`): listado filtrado por país, con alta y edición. El país se elige al crear y no cambia después. La tasa va de 0 a 100 con hasta 2 decimales.
- **Categorías** (`Catálogo > Categorías`): vista de árbol. El padre no puede ser la propia categoría ni una de sus subcategorías. Desactivar pide confirmación.
- **Productos** (`Catálogo > Productos`): búsqueda por nombre, SKU o código de barras (espera 300 ms al escribir), filtros por categoría, tipo y estado, y listado paginado. Desde el formulario, un servicio no controla inventario ni seriales, y controlar seriales obliga a controlar inventario. El botón **Impuestos por país** asigna un impuesto a cada país donde se vende el producto.

Los montos viajan como texto (`"12.50"`) y se muestran con dos decimales. La web no hace cálculos con ellos.

Los errores de negocio (por ejemplo, SKU repetido o categoría en uso) se traducen con las claves `error.<CODIGO>` de `public/i18n/es.json` y `en.json`.

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

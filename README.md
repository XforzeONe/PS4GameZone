# Game Catalog - Automatización de adición de juegos

Este proyecto es un catálogo web de videojuegos de PS4 que permite explorar juegos desde una interfaz sencilla y, además, añadir nuevos títulos desde un panel de administración. La información principal se guarda en `json/games_es.json`, que sirve como base para mostrar el catálogo en la web.

## ¿Qué hace este proyecto?

El sitio tiene dos partes bien diferenciadas:

1. Catálogo público
   - Muestra juegos en pantalla.
   - Permite buscarlos por nombre.
   - Permite filtrarlos por categoría.
   - Al hacer clic en una tarjeta se abre un modal con detalles del juego.

2. Panel de administración
   - Permite buscar un juego en RAWG.
   - Genera una vista previa con portada, descripción y géneros.
   - Permite editar algunos campos antes de guardarlos.
   - Añade el juego al archivo JSON del catálogo.

## Requisitos

- Node.js 18 o superior
- npm
- Acceso a Internet para consultar RAWG y Cloudinary (si vas a usar el panel de administración)

## Dependencias

Este proyecto no necesita dependencias externas de npm para funcionar en su parte básica. Usa módulos nativos de Node como:

- `http` para levantar el servidor
- `fs` para leer y guardar archivos
- `path` para manejar rutas
- `crypto` para firmar peticiones a Cloudinary

La parte del navegador usa `fetch` y módulos ES6 nativos, por lo que no requiere paquetes extra.

## Instalación paso a paso

1. Abre una terminal en la carpeta del proyecto.
2. Instala los recursos básicos del proyecto:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` en la raíz del proyecto si aún no existe.
4. Añade las variables necesarias para el panel de administración:
   ```env
   RAWG_API_KEY=tu_clave_de_rawg
   CLOUDINARY_CLOUD_NAME=tu_cloud_name
   CLOUDINARY_API_KEY=tu_api_key_cloudinary
   CLOUDINARY_API_SECRET=tu_api_secret_cloudinary
   DEEPL_API_KEY=tu_clave_de_deepl_opcional
   GOOGLE_TRANSLATE_API_KEY=tu_clave_google_opcional
   ```
5. Guarda el archivo y continúa con la ejecución.

## Cómo usar el sitio

### 1. Ver el catálogo público

Ejecuta:

```bash
npm start
```

Luego abre en el navegador:

- `http://localhost:3000/` para ver el catálogo principal
- `http://localhost:3000/admin` para entrar al panel de administración

### 2. Navegar por el catálogo

Una vez abierto el sitio:

- Puedes usar la barra de búsqueda para encontrar juegos por nombre.
- Puedes hacer clic en las categorías para filtrar los resultados.
- Al hacer clic en una tarjeta se abrirá un modal con más información.

### 3. Añadir un juego desde el panel admin

1. Abre `http://localhost:3000/admin`.
2. Escribe el nombre del juego en el campo disponible.
3. Haz clic en `Previsualizar`.
4. Revisa los datos obtenidos desde RAWG.
5. Si deseas, modifica el título, slug, rating, géneros o descripción.
6. Haz clic en `Añadir al catálogo`.

El juego se guardará automáticamente en `json/games_es.json`.

## Cómo funciona la parte de administración

El panel de administración usa una pequeña API interna creada con Node:

- `POST /api/preview`: busca el juego en RAWG y prepara una vista previa.
- `POST /api/add`: añade el juego al catálogo y lo guarda en el JSON.

Para lograr esto, el proyecto conecta con servicios externos:

- RAWG para obtener información del juego.
- Cloudinary para subir la imagen de portada.
- DeepL o Google Translate para traducir textos al español.

## Comandos disponibles

```bash
npm start
```
Inicia el servidor y deja el sitio disponible en el puerto 3000.

```bash
npm run add-game -- "Nombre del juego"
```
Ejecuta el proceso de añadido desde la terminal sin usar la interfaz web.

```bash
npm run admin
```
Inicia el servidor de administración, útil si prefieres usar el comando anterior al `start`.

## Notas importantes

- El catálogo público se alimenta desde `json/games_es.json`.
- El panel de administración actualiza ese archivo cuando añades un juego nuevo.
- Si no configuras las variables de entorno, la parte de administración no podrá conectar con RAWG y Cloudinary.
- Se recomienda usar Node.js 18 o superior para evitar problemas con funciones modernas del lenguaje.

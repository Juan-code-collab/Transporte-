# Transporte CABA

Mapa interactivo de la Ciudad de Buenos Aires con los recorridos de:

| Capa | Fuente principal | Respaldo |
| --- | --- | --- |
| Subte | [Recorridos RMBA](https://datos.transporte.gob.ar/dataset/recorridos-de-lineas-de-transporte-rmba-jn) (Nación) | GCBA, OpenStreetMap |
| Trenes | [Estaciones y red de ferrocarril](https://data.buenosaires.gob.ar/dataset/estaciones-ferrocarril) (GCBA) | Nación, OpenStreetMap |
| Colectivos (Ciudad, Nacional y Provincial) | [Recorridos de colectivos](https://data.buenosaires.gob.ar/dataset/colectivos-recorridos) (GCBA) + [Recorridos RMBA](https://datos.transporte.gob.ar/dataset/recorridos-de-lineas-de-transporte-rmba-jn) (Nación) | OpenStreetMap |
| Autopistas | OpenStreetMap (el GCBA no publica el trazado) | — |
| Ciclovías | [Ciclovías](https://data.buenosaires.gob.ar/dataset/ciclovias) (GCBA) | OpenStreetMap |

Hecho con [Leaflet](https://leafletjs.com) y [Vite](https://vite.dev), sin backend: es un sitio estático.

## Uso

Requiere Node 18 o superior.

```bash
npm install
npm run datos   # descarga los recorridos a public/data/
npm run dev     # abre la app en http://localhost:5173
```

`npm run datos` consulta la API del portal de datos abiertos de la Ciudad
(`data.buenosaires.gob.ar`) y, si un dataset no está disponible o no viene en
GeoJSON/WGS84, usa OpenStreetMap vía Overpass API. Opciones:

```bash
npm run datos -- --solo subte,colectivos   # sólo algunas capas
npm run datos -- --fuente overpass         # forzar OpenStreetMap
npm run datos -- --fuente ckan             # sólo el portal de la Ciudad
```

Si una capa no tiene archivo descargado, la app la pide a OpenStreetMap en vivo
desde el navegador (más lento, sobre todo colectivos).

## Funciones

- Activar/desactivar cada capa.
- Subtes con los colores oficiales de cada línea.
- Colectivos coloreados por jurisdicción, con filtro por número de línea
  (`60, 152`) y por jurisdicción (Ciudad / Nacional / Provincial).
- Clic en cualquier recorrido para ver sus atributos.
- Mapa base: Google Maps / Google Satélite (con clave, ver abajo),
  OpenStreetMap, Esri Calles o Esri Satélite; adaptado a celulares.

## Publicar en GitHub Pages

El workflow `.github/workflows/deploy.yml` descarga los datos, compila y publica
el sitio en cada push a `main` y todos los lunes. Activalo en
**Settings → Pages → Source: GitHub Actions**.

## Google Maps como mapa base

Google sólo permite usar sus mapas con una clave propia (Map Tiles API). Sin
clave, la app usa OpenStreetMap y Esri.

1. En [Google Cloud Console](https://console.cloud.google.com/) creá un
   proyecto y activá la facturación (Map Tiles API tiene un cupo mensual sin
   cargo; revisá los precios vigentes).
2. Habilitá **Map Tiles API** (APIs y servicios → Biblioteca).
3. Creá una clave en APIs y servicios → Credenciales. **Restringila** a:
   - Sitios web: `https://juan-code-collab.github.io/*` (y
     `http://localhost:5173/*` si la usás en tu compu).
   - API: sólo Map Tiles API.

   La clave queda visible en la página publicada; la restricción evita que
   otros sitios la usen.
4. En GitHub: Settings → Secrets and variables → Actions → **New repository
   secret**, nombre `GOOGLE_MAPS_API_KEY`, valor la clave.
5. Volvé a correr el workflow (Actions → Publicar mapa → Run workflow).

En tu compu: creá un archivo `.env.local` con
`VITE_GOOGLE_MAPS_API_KEY=tu-clave` y corré `npm run dev`.

## Notas sobre los datos

- Colectivos: las líneas de jurisdicción de la Ciudad salen del dataset
  [Colectivos: recorridos](https://data.buenosaires.gob.ar/dataset/colectivos-recorridos)
  del GCBA; las nacionales y provinciales, del dataset
  [Recorridos de Líneas de Transporte de RMBA](https://datos.transporte.gob.ar/dataset/recorridos-de-lineas-de-transporte-rmba-jn)
  del Ministerio de Transporte, quedándose sólo con los recorridos que pasan
  por CABA. El dataset nacional todavía lista como nacionales las líneas que
  pasaron a la Ciudad; por eso `LINEAS_JURISDICCION_CIUDAD` (en
  `src/capas.js`) tiene prioridad. Si la Ciudad suma o traspasa líneas, hay que
  actualizar esa lista.
- Los números de línea se muestran sin ceros adelante (`004` → `4`).
- Las URLs de los datasets se resuelven por nombre a través de la API CKAN del
  portal, así que siguen funcionando aunque el GCBA cambie los archivos. Si
  cambia el nombre de un dataset, editá `ckan.dataset` en `src/capas.js`.
- Datos de OpenStreetMap © colaboradores de OpenStreetMap, licencia ODbL.

## Estructura

```
src/capas.js                 configuración de capas y fuentes
src/geo.js                   conversión Overpass→GeoJSON, línea y jurisdicción
src/main.js                  la app (Leaflet)
scripts/descargar-datos.mjs  descarga de datos
test/                        tests (`npm test`)
```

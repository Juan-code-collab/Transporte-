# Transporte CABA

Mapa interactivo de la Ciudad de Buenos Aires con los recorridos de:

| Capa | Fuente principal | Respaldo |
| --- | --- | --- |
| Subte y Premetro | [Subte – estaciones y líneas](https://data.buenosaires.gob.ar/dataset/subte-estaciones) (GCBA) | OpenStreetMap |
| Trenes | [Estaciones y red de ferrocarril](https://data.buenosaires.gob.ar/dataset/estaciones-ferrocarril) (GCBA) | OpenStreetMap |
| Colectivos (Ciudad, Nacional y Provincial) | [Recorridos de colectivos](https://data.buenosaires.gob.ar/dataset/colectivos-recorridos) (GCBA) | OpenStreetMap |
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
- Mapa base claro, oscuro u OpenStreetMap; adaptado a celulares.

## Publicar en GitHub Pages

El workflow `.github/workflows/deploy.yml` descarga los datos, compila y publica
el sitio en cada push a `main` y todos los lunes. Activalo en
**Settings → Pages → Source: GitHub Actions**.

## Notas sobre los datos

- La jurisdicción de cada colectivo se toma del campo del dataset cuando existe.
  Si no, se infiere por número: las líneas de `LINEAS_JURISDICCION_CIUDAD`
  (en `src/capas.js`) son de la Ciudad, el resto de 1–199 Nacionales y 200+
  Provinciales. **Esa lista es aproximada: conviene verificarla** contra la
  fuente oficial.
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

// Configuración de las capas del mapa. La usan tanto la app (navegador) como
// el script de descarga (Node), por eso no depende del DOM ni de Leaflet.
//
// Cada capa se intenta obtener, en orden:
//   1. `ckan`: lista de datasets de portales CKAN del Gobierno (Ciudad o
//      Nación). En cada dataset se usa el recurso GeoJSON cuyo nombre o URL
//      coincida con `recurso`. Sin `combinar`, gana la primera fuente que
//      funcione; con `combinar`, se suman todas (y una línea que ya vino de una
//      fuente anterior no se repite).
//   2. `overpass`: consulta a OpenStreetMap vía Overpass API, como respaldo o
//      cuando el Gobierno no publica la geometría (p. ej. autopistas).
//
// `soloCaba`: descarta recorridos que no pasan por la Ciudad.

export const PORTAL_CIUDAD = 'https://data.buenosaires.gob.ar';
export const PORTAL_NACION = 'https://datos.transporte.gob.ar';
// Dataset nacional "Recorridos de Líneas de Transporte de RMBA".
const RMBA = 'recorridos-de-lineas-de-transporte-rmba-jn';
// Servidores públicos de Overpass: si uno está saturado (504), se prueba el siguiente.
export const OVERPASS_APIS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Rectángulo que contiene a la Ciudad (sur, oeste, norte, este). Es mucho más
// liviano para Overpass que buscar el límite administrativo; lo que queda
// afuera de CABA se recorta después con `soloCaba`.
const BBOX_CABA = '-34.71,-58.54,-34.52,-58.33';

export function consultaOverpass(cuerpo) {
  return `[out:json][timeout:180][bbox:${BBOX_CABA}];\n(\n${cuerpo}\n);\nout geom;`;
}

// Colores oficiales de las líneas de subte (respaldo si el dato no trae color).
export const COLORES_SUBTE = {
  A: '#18cccc',
  B: '#eb0909',
  C: '#233aa8',
  D: '#02db2e',
  E: '#c618cc',
  H: '#ffdd00',
  P: '#ffa500', // Premetro
};

// Líneas de colectivo de jurisdicción de la Ciudad, según el dataset
// "Colectivos: recorridos" del GCBA (octubre 2026). El dataset nacional todavía
// las lista como nacionales, así que esta lista tiene prioridad.
export const LINEAS_JURISDICCION_CIUDAD = [
  '4', '7', '12', '25', '26', '34', '39', '42', '44', '47', '50', '64', '65',
  '68', '76', '84', '99', '102', '106', '107', '108', '109', '118', '132', '151',
  'EBUS',
];

// Límites de las 15 comunas (para el filtro por comuna).
export const COMUNAS = {
  portal: PORTAL_CIUDAD,
  dataset: 'comunas',
  recurso: /comunas/i,
  respaldo: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/innovacion-transformacion-digital/comunas/comunas.geojson',
};

// Colores para distinguir las líneas de tren en el mapa.
export const COLORES_TREN = {
  'Belgrano Norte': '#8e44ad',
  'Belgrano Sur': '#16a085',
  Mitre: '#2471a3',
  Roca: '#c0392b',
  'San Martín': '#d35400',
  Sarmiento: '#1e8449',
  'Tren de la Costa': '#b7950b',
  Urquiza: '#5d6d7e',
};

export const CAPAS = [
  {
    id: 'subte',
    nombre: 'Subte y Premetro',
    color: '#233aa8',
    grosor: 5,
    visible: true,
    ckan: [
      { portal: PORTAL_NACION, dataset: RMBA, recurso: /subterr[aá]neos? - l[ií]neas/i },
      { portal: PORTAL_CIUDAD, dataset: 'subte-estaciones', recurso: /l[ií]nea/i },
    ],
    // Los datasets oficiales traen sólo las líneas A–H: el Premetro se suma
    // desde OpenStreetMap y se marca como línea "P".
    sumar: {
      nombre: 'Premetro',
      linea: 'P',
      filtro: /premetro/i,
      overpass: consultaOverpass('relation["route"~"^(light_rail|tram)$"];'),
    },
    overpass: consultaOverpass(
      [
        'relation["route"="subway"];',
        'relation["route"="light_rail"];',
        'relation["route"="tram"];',
      ].join('\n'),
    ),
  },
  {
    id: 'trenes',
    nombre: 'Trenes',
    color: '#5a3e1b',
    grosor: 4,
    visible: true,
    // Nación primero: el dataset de la Ciudad no trae Urquiza ni Belgrano Norte.
    ckan: [
      { portal: PORTAL_NACION, dataset: RMBA, recurso: /ferrocarril - l[ií]neas/i },
      { portal: PORTAL_CIUDAD, dataset: 'estaciones-ferrocarril', recurso: /red|l[ií]nea|recorrido/i },
    ],
    overpass: consultaOverpass('relation["route"="train"];'),
  },
  {
    id: 'colectivos',
    nombre: 'Colectivos',
    color: '#e67e22',
    grosor: 2,
    visible: false, // es la capa más pesada; se activa a demanda
    // Ciudad: las líneas de jurisdicción porteña. Nación: las de jurisdicción
    // nacional y provincial del AMBA (sólo las que pasan por CABA). El archivo
    // nacional todavía incluye líneas ya traspasadas a la Ciudad: como la
    // Ciudad va primero, esas se toman de la Ciudad.
    ckan: [
      {
        portal: PORTAL_CIUDAD,
        dataset: 'colectivos-recorridos',
        recurso: /recorrido/i,
        // Si la API del portal falla, se baja el archivo directo.
        respaldo:
          'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/transporte-y-obras-publicas/colectivos-recorridos/recorrido-colectivos.geojson',
      },
      { portal: PORTAL_NACION, dataset: RMBA, recurso: /buses - l[ií]neas.*nacional/i },
      { portal: PORTAL_NACION, dataset: RMBA, recurso: /buses - l[ií]neas.*provincial/i },
    ],
    combinar: true,
    soloCaba: true,
    overpass: consultaOverpass('relation["route"="bus"];'),
  },
  {
    id: 'autopistas',
    nombre: 'Autopistas',
    color: '#7f8c8d',
    grosor: 5,
    visible: true,
    // El portal de la Ciudad no publica el trazado de autopistas como GeoJSON,
    // así que se toma de OpenStreetMap.
    soloCaba: true,
    overpass: consultaOverpass(
      [
        'way["highway"="motorway"];',
        'way["highway"="trunk"]["motorroad"="yes"];',
      ].join('\n'),
    ),
  },
  {
    id: 'ciclovias',
    nombre: 'Ciclovías',
    color: '#27ae60',
    grosor: 3,
    visible: true,
    ckan: [{ portal: PORTAL_CIUDAD, dataset: 'ciclovias', recurso: /ciclov/i }],
    overpass: consultaOverpass(
      [
        'way["highway"="cycleway"];',
        'way["cycleway"~"^(lane|track)$"];',
        'way["cycleway:left"~"^(lane|track)$"];',
        'way["cycleway:right"~"^(lane|track)$"];',
        'way["cycleway:both"~"^(lane|track)$"];',
      ].join('\n'),
    ),
  },
  // Recorrido del eBus desde un mapa de Google My Maps (exportado como KML).
  // Si se edita ese mapa, el cambio se toma en la próxima publicación.
  {
    id: 'ebus',
    nombre: 'eBus',
    color: '#0288d1',
    grosor: 4,
    visible: true,
    kml: 'https://www.google.com/maps/d/kml?mid=1EpsQpmW24YGDZPgTmJHPvp-JtDjSEdw&forcekml=1',
  },
  // Trazas cargadas a mano desde shapefiles (npm run proyecto); no se
  // descargan de ningún portal. Punteadas porque son proyectos.
  {
    id: 'linea-f',
    nombre: 'Línea F (subte, proyecto)',
    color: '#8e44ad',
    grosor: 5,
    visible: true,
    discontinua: true,
    archivo: 'proyectos/linea-f.geojson',
  },
  {
    id: 'trambus',
    nombre: 'Trambus',
    color: '#d35400',
    grosor: 4,
    visible: true,
    discontinua: true,
    archivo: 'proyectos/trambus.geojson',
  },
];

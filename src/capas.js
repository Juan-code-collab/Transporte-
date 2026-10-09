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

// Líneas de colectivo bajo jurisdicción de la Ciudad (traspasadas desde Nación
// en 2019). Sólo se usa cuando el dato no trae un campo de jurisdicción.
// Verificar contra la fuente oficial: la lista puede cambiar.
export const LINEAS_JURISDICCION_CIUDAD = [
  '4', '6', '7', '12', '25', '26', '34', '39', '42', '44', '47', '49', '50',
  '64', '65', '68', '76', '84', '90', '99', '102', '106', '107', '108', '109',
  '115', '118', '132', '146', '151', '158',
];

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
    ckan: [{ portal: PORTAL_CIUDAD, dataset: 'estaciones-ferrocarril', recurso: /red|l[ií]nea|recorrido/i }],
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
      { portal: PORTAL_CIUDAD, dataset: 'colectivos-recorridos', recurso: /recorrido/i },
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
];

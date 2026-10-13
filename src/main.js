import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { CAPAS, COLORES_SUBTE, COLORES_TREN, OVERPASS_APIS } from './capas.js';
import { capasGoogle } from './google.js';
import {
  calleDe,
  coincideTexto,
  colorSubte,
  comunasDe,
  jurisdiccionDe,
  lineaDe,
  lineaTren,
  normalizarLinea,
  overpassAGeojson,
  pasaPorCaba,
  prepararComunas,
  soloLineas,
} from './geo.js';

const DATOS = `${import.meta.env.BASE_URL}data/`;

const JURISDICCIONES = {
  ciudad: { nombre: 'Ciudad', color: '#0097a7' },
  nacional: { nombre: 'Nacional (JN)', color: '#e67e22' },
  provincial: { nombre: 'Provincial', color: '#8e44ad' },
  municipal: { nombre: 'Municipal', color: '#95a5a6' },
};

// ---------------------------------------------------------------- mapa base

const mapa = L.map('mapa', { preferCanvas: true }).setView([-34.6118, -58.4173], 12);

const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const bases = {
  // Google Maps y Google Satélite se agregan arriba si hay clave configurada.
  ...(await capasGoogle(mapa)),
  OpenStreetMap: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }),
  'Esri Calles': L.tileLayer(`${esri}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`, {
    attribution: 'Tiles © Esri',
    maxZoom: 19,
  }),
  'Esri Satélite': L.tileLayer(`${esri}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
    attribution: 'Tiles © Esri — Maxar, Earthstar Geographics',
    maxZoom: 19,
  }),
};
Object.values(bases)[0].addTo(mapa);
L.control.layers(bases, null, { position: 'topright' }).addTo(mapa);
L.control.scale({ imperial: false }).addTo(mapa);

// ----------------------------------------------------------------- estilos

function estiloDe(capa, props) {
  let color = capa.color;
  if (capa.id === 'subte') color = colorSubte(props) ?? color;
  if (capa.id === 'trenes') color = COLORES_TREN[lineaTren(props)] ?? color;
  if (capa.id === 'colectivos') color = JURISDICCIONES[jurisdiccionDe(props)]?.color ?? '#7f8c8d';
  if (/^#[0-9a-f]{6}$/i.test(props.color ?? '') && capa.archivo) color = props.color;
  return { color, weight: capa.grosor, opacity: 0.85, dashArray: capa.discontinua ? '10 6' : null };
}

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function tituloDe(capa, props) {
  if (capa.id === 'subte') return `Subte — línea ${lineaDe(props) ?? '?'}`;
  if (capa.id === 'trenes') return `Tren ${lineaTren(props) ?? ''}`.trim();
  if (capa.id === 'ciclovias') return `Ciclovía — ${calleDe(props) ?? 'sin nombre'}`;
  if (capa.id === 'colectivos') return `Colectivo — línea ${lineaDe(props) ?? '?'}`;
  return props.name ?? props.nombre ?? props.NOMBRE ?? capa.nombre;
}

function popupDe(capa, props) {
  const titulo = tituloDe(capa, props);
  const filas = Object.entries(props)
    .filter(([k, v]) => !k.startsWith('_') && v !== null && v !== '' && typeof v !== 'object')
    .slice(0, 14)
    .map(([k, v]) => `<tr><td>${escapar(k)}</td><td>${escapar(v)}</td></tr>`)
    .join('');
  const jur = capa.id === 'colectivos' ? JURISDICCIONES[jurisdiccionDe(props)]?.nombre : null;
  const com = props._comunas?.length ? `<p>Comunas: ${props._comunas.join(', ')}</p>` : '';
  return `<div class="popup"><h3>${escapar(titulo)}</h3>${jur ? `<p>Jurisdicción: ${jur}</p>` : ''}${com}<table>${filas}</table></div>`;
}

// ------------------------------------------------------------ carga de datos

async function cargar(capa, avisar) {
  // 1) Archivo descargado con `npm run datos` (o cargado a mano, `archivo`).
  try {
    const r = await fetch(capa.archivo ? `${import.meta.env.BASE_URL}${capa.archivo}` : `${DATOS}${capa.id}.geojson`);
    if (r.ok) {
      const geojson = soloLineas(await r.json()); // falla si el servidor devolvió index.html
      if (geojson.features.length) return geojson;
    }
  } catch {
    // sin archivo local: seguimos con OpenStreetMap
  }
  // 2) Respaldo en vivo: OpenStreetMap vía Overpass, probando cada servidor.
  if (!capa.overpass) throw new Error('sin datos locales');
  avisar('Consultando OpenStreetMap… (puede tardar)');
  let ultimoError;
  for (const servidor of OVERPASS_APIS) {
    try {
      const r = await fetch(servidor, { method: 'POST', body: new URLSearchParams({ data: capa.overpass }) });
      if (!r.ok) throw new Error(`Overpass respondió ${r.status}`);
      fuentes.osmEnVivo = true;
      const geojson = soloLineas(overpassAGeojson(await r.json()));
      if (capa.soloCaba) geojson.features = geojson.features.filter(pasaPorCaba);
      return geojson;
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError;
}

// ----------------------------------------------------------------- filtros
//
// Cada capa puede tener un filtro propio:
//   - 'lista': casillas con los valores presentes en los datos (líneas).
//   - 'texto': búsqueda libre, con sugerencias (números de línea, calles).
// Sin nada elegido, se ve todo.

const FILTROS = {
  subte: {
    tipo: 'lista',
    valor: (p) => lineaDe(p),
    etiqueta: (v) => `Línea ${v}`,
    color: (v) => COLORES_SUBTE[v],
  },
  trenes: {
    tipo: 'lista',
    valor: (p) => lineaTren(p),
    etiqueta: (v) => v,
    color: (v) => COLORES_TREN[v],
  },
  colectivos: {
    tipo: 'texto',
    titulo: 'Líneas',
    placeholder: 'Ej.: 60, 152',
    valor: (p) => lineaDe(p),
    // Varias líneas separadas por coma; coincidencia exacta ("4" no trae la 41).
    coincide: (valor, texto) => {
      const buscadas = texto.split(/[\s,;]+/).filter(Boolean).map(normalizarLinea);
      return !buscadas.length || buscadas.includes(valor);
    },
    extra: 'jurisdiccion',
  },
  ciclovias: {
    tipo: 'texto',
    titulo: 'Calle',
    placeholder: 'Ej.: Corrientes',
    valor: (p) => calleDe(p),
    coincide: (valor, texto) => !texto.trim() || coincideTexto(valor, texto.trim()),
  },
};

const listaCapas = document.getElementById('capas');
const estado = new Map(); // id → { capa, datos, capaLeaflet, cargando, ... }
const fuentes = { manifiesto: {}, osmEnVivo: false };

// Filtro de la capa (líneas, calle, jurisdicción) según lo elegido en el panel.
function filtroDeCapa(e) {
  const def = FILTROS[e.capa.id];
  if (!def || !e.filtro) return () => true;
  const caja = e.filtro;
  let pasa = () => true;
  if (def.tipo === 'lista') {
    const elegidos = [...caja.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
    if (elegidos.length) pasa = (f) => elegidos.includes(def.valor(f.properties ?? {}));
  } else {
    const texto = caja.querySelector('input[type=search]').value;
    pasa = (f) => def.coincide(def.valor(f.properties ?? {}), texto);
  }
  const jur = caja.querySelector('select')?.value;
  if (jur) {
    const antes = pasa;
    pasa = (f) => antes(f) && jurisdiccionDe(f.properties) === jur;
  }
  return pasa;
}

// ------------------------------------------------------------------ comunas

let comunas = [];
let comunaElegida = null;
let mascara = null;

function comunasDeFeature(f) {
  if (!f.properties) f.properties = {};
  // Los archivos descargados ya traen `_comunas`; si no (OpenStreetMap en
  // vivo, proyectos), se calcula una vez y se guarda.
  if (!Array.isArray(f.properties._comunas) && comunas.length) f.properties._comunas = comunasDe(f, comunas);
  return f.properties._comunas ?? [];
}

function filtroComuna() {
  if (!comunaElegida) return () => true;
  return (f) => comunasDeFeature(f).includes(comunaElegida.numero);
}

function elegirComuna(numero) {
  comunaElegida = comunas.find((c) => c.numero === Number(numero)) ?? null;
  if (mascara) mapa.removeLayer(mascara);
  mascara = null;
  document.getElementById('barrios-comuna').textContent = comunaElegida ? `Barrios: ${comunaElegida.barrios}` : '';
  if (comunaElegida) {
    // Todo lo de afuera de la comuna queda tapado; adentro se ve el mapa.
    const mundo = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    const huecos = comunaElegida.poligonos.map((anillos) => anillos[0].map(([x, y]) => [y, x]));
    // Va en un panel propio, por encima de los recorridos: así los tramos que
    // salen de la comuna también quedan tapados.
    const opciones = { pane: 'mascara', renderer: rendererMascara, interactive: false };
    mascara = L.layerGroup([
      L.polygon([mundo, ...huecos], { ...opciones, stroke: false, fillColor: oscuro ? '#111418' : '#ffffff', fillOpacity: 0.9 }),
      L.geoJSON(comunaElegida.feature, { ...opciones, style: { color: '#233aa8', weight: 2.5, fill: false } }),
    ]).addTo(mapa);
    mapa.fitBounds(L.geoJSON(comunaElegida.feature).getBounds(), { padding: [20, 20] });
  } else {
    mapa.setView([-34.6118, -58.4173], 12);
  }
  for (const id of estado.keys()) dibujar(id);
}

const oscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
mapa.createPane('mascara').style.zIndex = 450; // entre los recorridos (400) y los popups
mapa.getPane('mascara').style.pointerEvents = 'none';
const rendererMascara = L.svg({ pane: 'mascara' });

async function cargarComunas() {
  const selector = document.getElementById('filtro-comuna');
  try {
    const r = await fetch(`${DATOS}comunas.geojson`);
    comunas = prepararComunas(await r.json());
  } catch {
    selector.disabled = true;
    selector.options[0].textContent = 'Comunas no disponibles';
    return;
  }
  for (const c of comunas) selector.add(new Option(`Comuna ${c.numero}`, c.numero));
  selector.addEventListener('change', () => elegirComuna(selector.value));
}

// ---------------------------------------------------------------- dibujado

function dibujar(id) {
  const e = estado.get(id);
  if (e.capaLeaflet) mapa.removeLayer(e.capaLeaflet);
  e.capaLeaflet = null;
  if (!e.activa || !e.datos) return;

  const filtro = filtroDeCapa(e);
  const enComuna = filtroComuna();
  let visibles = 0;
  e.capaLeaflet = L.geoJSON(e.datos, {
    filter: (f) => {
      const ok = f.geometry && /LineString/.test(f.geometry.type) && filtro(f) && enComuna(f);
      if (ok) visibles++;
      return ok;
    },
    style: (f) => estiloDe(e.capa, f.properties ?? {}),
    onEachFeature: (f, capaFeat) => {
      capaFeat.bindPopup(() => popupDe(e.capa, f.properties ?? {}), { maxWidth: 320 });
      capaFeat.on('mouseover', () => capaFeat.setStyle({ weight: e.capa.grosor + 3, opacity: 1 }));
      capaFeat.on('mouseout', () => e.capaLeaflet.resetStyle(capaFeat));
    },
  }).addTo(mapa);

  const total = e.datos.features.length;
  e.mensaje(visibles === total ? `${total} elementos` : `${visibles} de ${total} elementos visibles`);
  ordenarCapas();
}

// Las capas finas (ciclovías, colectivos) quedan por encima de las gruesas.
function ordenarCapas() {
  for (const id of ['autopistas', 'trenes', 'colectivos', 'subte', 'ciclovias', 'proyectos']) {
    estado.get(id)?.capaLeaflet?.bringToFront();
  }
}

// Arma el filtro de la capa con los valores que trae el dato.
function armarFiltro(e) {
  const def = FILTROS[e.capa.id];
  if (!def) return;
  const caja = e.li.querySelector('.filtro');
  const valores = [...new Set(e.datos.features.map((f) => def.valor(f.properties ?? {})).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), 'es', { numeric: true }),
  );
  if (def.tipo === 'lista') {
    caja.innerHTML = `<div class="chips">${valores
      .map(
        (v) => `<label class="chip"><input type="checkbox" value="${escapar(v)}" />
          <span class="muestra" style="background:${escapar(def.color?.(v) ?? e.capa.color)}"></span>${escapar(def.etiqueta(v))}</label>`,
      )
      .join('')}</div>`;
  } else {
    const idLista = `sugerencias-${e.capa.id}`;
    caja.innerHTML = `
      <label>${escapar(def.titulo)}
        <input type="search" list="${idLista}" placeholder="${escapar(def.placeholder)}" autocomplete="off" />
      </label>
      <datalist id="${idLista}">${valores.map((v) => `<option value="${escapar(v)}"></option>`).join('')}</datalist>`;
  }
  if (def.extra === 'jurisdiccion') {
    caja.insertAdjacentHTML(
      'beforeend',
      `<label>Jurisdicción
        <select>
          <option value="">Todas</option>
          <option value="ciudad">Ciudad</option>
          <option value="nacional">Nacional (JN)</option>
          <option value="provincial">Provincial</option>
        </select>
      </label>
      <ul class="leyenda">${Object.values(JURISDICCIONES)
        .slice(0, 3)
        .map((j) => `<li><span class="muestra" style="background:${j.color}"></span>${j.nombre}</li>`)
        .join('')}</ul>`,
    );
  }
  let espera;
  caja.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => dibujar(e.capa.id), 250);
  });
  caja.addEventListener('change', () => dibujar(e.capa.id));
  e.filtro = caja;
}

async function activar(id, activa) {
  const e = estado.get(id);
  e.activa = activa;
  const caja = e.li.querySelector('.filtro');
  if (activa && !e.datos && !e.cargando) {
    e.cargando = true;
    e.mensaje('Cargando…');
    try {
      e.datos = await cargar(e.capa, e.mensaje);
      armarFiltro(e);
      // Capas cargadas a mano (proyectos): leyenda con el nombre de cada traza.
      if (e.capa.archivo) e.leyenda(e.datos.features.map((f) => f.properties ?? {}));
    } catch (err) {
      e.mensaje(`No se pudieron cargar los datos: ${err.message}`, true);
    } finally {
      e.cargando = false;
      mostrarFuentes();
    }
  }
  if (caja) caja.hidden = !activa || !e.filtro;
  dibujar(id);
}

for (const capa of CAPAS) {
  const li = document.createElement('li');
  li.innerHTML = `
    <label>
      <input type="checkbox" ${capa.visible ? 'checked' : ''} />
      <span class="muestra" style="background:${capa.color}"></span>
      ${escapar(capa.nombre)}
    </label>
    <p class="estado"></p>
    <ul class="leyenda leyenda-capa"></ul>
    <div class="filtro" hidden></div>`;
  listaCapas.append(li);

  const p = li.querySelector('.estado');
  estado.set(capa.id, {
    capa,
    li,
    activa: false,
    mensaje: (texto, error = false) => {
      p.textContent = texto;
      p.classList.toggle('error', error);
    },
    leyenda: (items) => {
      li.querySelector('.leyenda-capa').innerHTML = items
        .map((i) => `<li><span class="muestra" style="background:${escapar(i.color ?? capa.color)}"></span>${escapar(i.nombre ?? '')}</li>`)
        .join('');
    },
  });
  li.querySelector('input').addEventListener('change', (ev) => activar(capa.id, ev.target.checked));
}

const panel = document.getElementById('panel');
const botonPlegar = document.getElementById('plegar');
botonPlegar.addEventListener('click', () => {
  const plegado = panel.classList.toggle('plegado');
  botonPlegar.textContent = plegado ? 'Mostrar' : 'Ocultar';
  botonPlegar.setAttribute('aria-expanded', String(!plegado));
  mapa.invalidateSize();
});

// ------------------------------------------------------------------ fuentes

function mostrarFuentes() {
  const items = Object.entries(fuentes.manifiesto).map(([id, m]) => {
    const nombre = CAPAS.find((c) => c.id === id)?.nombre ?? id;
    const fecha = new Date(m.descargado).toLocaleDateString('es-AR');
    return `<p><strong>${escapar(nombre)}:</strong> ${escapar(m.fuente)} (${fecha})</p>`;
  });
  if (fuentes.osmEnVivo) items.push('<p>Capas sin archivo local: © colaboradores de OpenStreetMap, en vivo vía Overpass API.</p>');
  document.getElementById('fuentes').innerHTML = items.join('');
}

try {
  const r = await fetch(`${DATOS}manifest.json`);
  if (r.ok) fuentes.manifiesto = await r.json();
} catch {
  // sin manifiesto: aún no se corrió `npm run datos`
}
mostrarFuentes();
await cargarComunas();

for (const capa of CAPAS) if (capa.visible) activar(capa.id, true);

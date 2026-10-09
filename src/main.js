import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { CAPAS, OVERPASS_API } from './capas.js';
import { colorSubte, jurisdiccionDe, lineaDe, overpassAGeojson } from './geo.js';

const DATOS = `${import.meta.env.BASE_URL}data/`;

const JURISDICCIONES = {
  ciudad: { nombre: 'Ciudad', color: '#0097a7' },
  nacional: { nombre: 'Nacional (JN)', color: '#e67e22' },
  provincial: { nombre: 'Provincial', color: '#8e44ad' },
  municipal: { nombre: 'Municipal', color: '#95a5a6' },
};

// ---------------------------------------------------------------- mapa base

const mapa = L.map('mapa', { preferCanvas: true }).setView([-34.6118, -58.4173], 12);

const atribucionOsm = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const bases = {
  Claro: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: `${atribucionOsm} © <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 19,
  }),
  OpenStreetMap: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: atribucionOsm,
    maxZoom: 19,
  }),
  Oscuro: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: `${atribucionOsm} © <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 19,
  }),
};
const oscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
(oscuro ? bases.Oscuro : bases.Claro).addTo(mapa);
L.control.layers(bases, null, { position: 'topright' }).addTo(mapa);
L.control.scale({ imperial: false }).addTo(mapa);

// ----------------------------------------------------------------- estilos

function estiloDe(capa, props) {
  let color = capa.color;
  if (capa.id === 'subte') color = colorSubte(props) ?? color;
  if (capa.id === 'trenes' && /^#?[0-9a-f]{6}$/i.test(props.colour ?? '')) color = props.colour;
  if (capa.id === 'colectivos') color = JURISDICCIONES[jurisdiccionDe(props)]?.color ?? '#7f8c8d';
  return { color, weight: capa.grosor, opacity: 0.85 };
}

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function popupDe(capa, props) {
  const linea = lineaDe(props);
  const titulo = props.name ?? props.nombre ?? props.NOMBRE ?? (linea ? `${capa.nombre} — línea ${linea}` : capa.nombre);
  const filas = Object.entries(props)
    .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
    .slice(0, 14)
    .map(([k, v]) => `<tr><td>${escapar(k)}</td><td>${escapar(v)}</td></tr>`)
    .join('');
  const jur = capa.id === 'colectivos' ? JURISDICCIONES[jurisdiccionDe(props)]?.nombre : null;
  return `<div class="popup"><h3>${escapar(titulo)}</h3>${jur ? `<p>Jurisdicción: ${jur}</p>` : ''}<table>${filas}</table></div>`;
}

// ------------------------------------------------------------ carga de datos

async function cargar(capa, avisar) {
  // 1) Archivo descargado con `npm run datos`.
  try {
    const r = await fetch(`${DATOS}${capa.id}.geojson`);
    if (r.ok) {
      const geojson = await r.json(); // falla si el servidor devolvió index.html
      if (geojson.features) return geojson;
    }
  } catch {
    // sin archivo local: seguimos con OpenStreetMap
  }
  // 2) Respaldo en vivo: OpenStreetMap vía Overpass.
  if (!capa.overpass) throw new Error('sin datos locales');
  avisar('Consultando OpenStreetMap… (puede tardar)');
  const r = await fetch(OVERPASS_API, {
    method: 'POST',
    body: new URLSearchParams({ data: capa.overpass }),
  });
  if (!r.ok) throw new Error(`Overpass respondió ${r.status}`);
  fuentes.osmEnVivo = true;
  return overpassAGeojson(await r.json());
}

// ------------------------------------------------------------------- capas

const listaCapas = document.getElementById('capas');
const estado = new Map(); // id → { capa, datos, capaLeaflet, cargando }
const fuentes = { manifiesto: {}, osmEnVivo: false };

function filtroColectivos() {
  const lineas = document
    .getElementById('filtro-linea')
    .value.split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const jur = document.getElementById('filtro-jurisdiccion').value;
  return (feat) =>
    (!lineas.length || lineas.includes(lineaDe(feat.properties))) &&
    (!jur || jurisdiccionDe(feat.properties) === jur);
}

function dibujar(id) {
  const e = estado.get(id);
  if (e.capaLeaflet) mapa.removeLayer(e.capaLeaflet);
  e.capaLeaflet = null;
  if (!e.activa || !e.datos) return;

  const filtro = id === 'colectivos' ? filtroColectivos() : () => true;
  let visibles = 0;
  e.capaLeaflet = L.geoJSON(e.datos, {
    filter: (f) => {
      const ok = f.geometry && /LineString/.test(f.geometry.type) && filtro(f);
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

  if (id === 'colectivos') actualizarResumenColectivos(visibles);
  ordenarCapas();
}

// Las capas finas (ciclovías, colectivos) quedan por encima de las gruesas.
function ordenarCapas() {
  for (const id of ['autopistas', 'trenes', 'colectivos', 'subte', 'ciclovias']) {
    estado.get(id)?.capaLeaflet?.bringToFront();
  }
}

function actualizarResumenColectivos(visibles) {
  const e = estado.get('colectivos');
  const lineas = new Set(e.datos.features.map((f) => lineaDe(f.properties)).filter(Boolean));
  document.getElementById('resumen-colectivos').textContent =
    `${visibles} de ${e.datos.features.length} recorridos visibles · ${lineas.size} líneas en total`;
}

async function activar(id, activa) {
  const e = estado.get(id);
  e.activa = activa;
  if (id === 'colectivos') document.getElementById('filtro-colectivos').hidden = !activa;
  if (activa && !e.datos && !e.cargando) {
    e.cargando = true;
    e.mensaje('Cargando…');
    try {
      e.datos = await cargar(e.capa, e.mensaje);
      e.mensaje(`${e.datos.features.length} elementos`);
    } catch (err) {
      e.mensaje(`No se pudieron cargar los datos: ${err.message}`, true);
    } finally {
      e.cargando = false;
      mostrarFuentes();
    }
  }
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
    <p class="estado"></p>`;
  listaCapas.append(li);

  const p = li.querySelector('.estado');
  estado.set(capa.id, {
    capa,
    activa: false,
    mensaje: (texto, error = false) => {
      p.textContent = texto;
      p.classList.toggle('error', error);
    },
  });
  li.querySelector('input').addEventListener('change', (ev) => activar(capa.id, ev.target.checked));
}

// --------------------------------------------------------- filtros y leyenda

document.getElementById('leyenda-colectivos').innerHTML = Object.values(JURISDICCIONES)
  .slice(0, 3)
  .map((j) => `<li><span class="muestra" style="background:${j.color}"></span>${j.nombre}</li>`)
  .join('');

let espera;
document.getElementById('filtro-linea').addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(() => dibujar('colectivos'), 250);
});
document.getElementById('filtro-jurisdiccion').addEventListener('change', () => dibujar('colectivos'));

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

for (const capa of CAPAS) if (capa.visible) activar(capa.id, true);

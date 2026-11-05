// Funciones compartidas por todas las pantallas.
'use strict';

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    ...opciones,
  });
  if (r.status === 401 && !ruta.endsWith('/login')) { location.href = '/login.html'; throw new Error('sesión'); }
  const datos = r.headers.get('Content-Type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw new Error(datos?.error || 'Error inesperado');
  return datos;
}

// Verifica la sesión y el rol antes de mostrar la pantalla.
async function exigirRol(rol) {
  const yo = await api('/api/me');
  if (yo.rol !== rol) { location.href = yo.rol === 'admin' ? '/dashboard.html' : '/reporte.html'; throw new Error('rol'); }
  return yo;
}

function fecha(iso, conAnio = false) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'numeric',
    year: conAnio ? 'numeric' : undefined, hour: '2-digit', minute: '2-digit' });
}

function duracion(desde, hasta) {
  if (!desde || !hasta) return null;
  const min = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function claseEstado(e) { return String(e).toLowerCase().replace(/\s+/g, '-'); }

function el(etiqueta, props = {}, ...hijos) {
  const n = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null) n.append(h);
  return n;
}

function chip(nivel) { return el('span', { class: `chip ${nivel}` }, nivel); }
function estadoTag(e) { return el('span', { class: `estado ${claseEstado(e)}` }, e); }

document.addEventListener('click', async (ev) => {
  if (ev.target.matches('[data-logout]')) {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/login.html';
  }
});

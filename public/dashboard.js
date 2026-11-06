'use strict';
const $ = (id) => document.getElementById(id);
let filtro = ''; let nivel = '';

function minutosTexto(m) {
  if (m == null) return 'Sin datos';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

async function cargar() {
  const [res, filas] = await Promise.all([
    api('/api/resumen'),
    api('/api/incidentes?' + new URLSearchParams({ estado: filtro, criticidad: nivel })),
  ]);
  $('k-abiertos').textContent = res.abiertos;
  for (const n of ['Crítica', 'Alta', 'Media', 'Baja']) $(`k-${n}`).textContent = res.por_criticidad[n];
  $('t-atencion').textContent = minutosTexto(res.minutos_promedio_primera_atencion);
  $('t-resolucion').textContent = minutosTexto(res.minutos_promedio_resolucion);

  const tbody = $('filas'); tbody.replaceChildren();
  if (!filas.length) tbody.append(el('tr', {}, el('td', { colspan: '7', class: 'vacio' }, 'No hay incidentes con estos filtros.')));
  for (const f of filas) {
    const nivel = f.criticidad_confirmada || f.criticidad_inicial;
    tbody.append(el('tr', {},
      el('td', { class: 'id' }, `#${f.id_incidente}`),
      el('td', {}, f.empleado),
      el('td', {}, f.tipo_percibido),
      el('td', {}, chip(nivel), f.criticidad_confirmada ? '' : el('small', { class: 'nota' }, ' inicial')),
      el('td', {}, estadoTag(f.estado)),
      el('td', { class: 'fecha' }, fecha(f.fecha_hora)),
      el('td', {}, el('a', { href: `/detalle.html?id=${f.id_incidente}` }, 'Ver →'))));
  }
  $('actualizado').textContent = `Actualizado: ${fecha(new Date().toISOString())} · se actualiza solo cada 30 segundos`;
}

async function iniciar() {
  const yo = await exigirRol('admin');
  $('usuario').textContent = `Administrador de TI: ${yo.nombre}`;
  $('filtros').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    filtro = b.dataset.estado;
    document.querySelectorAll('#filtros button').forEach((x) => x.classList.toggle('activo', x === b));
    cargar();
  });
  $('filtro-criticidad').addEventListener('change', (ev) => { nivel = ev.target.value; cargar(); });
  await cargar();
  setInterval(cargar, 30000);
}
iniciar();

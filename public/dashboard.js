'use strict';
const $ = (id) => document.getElementById(id);
let filtro = ''; let nivel = '';
let audio = null; // se habilita con un clic (los navegadores bloquean el sonido automático)
const recientes = new Set();

function minutosTexto(m) {
  if (m == null) return 'Sin datos';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function celdaPlazo(p) {
  if (!p) return el('span', { class: 'nota' }, '—');
  if (!p.abierto) return el('span', { class: p.vencido ? 'plazo fuera' : 'plazo ok' }, p.vencido ? 'Cerrado fuera de plazo' : '✓ Cerrado en plazo');
  if (p.vencido) return el('span', { class: 'plazo vencido', title: `Objetivo: ${p.minutos_objetivo} min (${p.playbook})` },
    `⚠ Vencido hace ${minutosTexto(-p.minutos_restantes)}`);
  return el('span', { class: 'plazo corre', title: `Objetivo: ${p.minutos_objetivo} min (${p.playbook})` },
    `⏱ Quedan ${minutosTexto(p.minutos_restantes)}`);
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
  $('t-vencidos').textContent = res.fuera_de_plazo;
  $('kpi-vencidos').classList.toggle('critica', res.fuera_de_plazo > 0);

  const tbody = $('filas'); tbody.replaceChildren();
  if (!filas.length) tbody.append(el('tr', {}, el('td', { colspan: '8', class: 'vacio' }, 'No hay incidentes con estos filtros.')));
  for (const f of filas) {
    const n = f.criticidad_confirmada || f.criticidad_inicial;
    tbody.append(el('tr', { class: recientes.has(f.id_incidente) ? 'nuevo' : '' },
      el('td', { class: 'id' }, `#${f.id_incidente}`),
      el('td', {}, f.empleado),
      el('td', {}, f.tipo_percibido),
      el('td', {}, chip(n), f.criticidad_confirmada ? '' : el('small', { class: 'nota' }, ' inicial')),
      el('td', {}, estadoTag(f.estado)),
      el('td', {}, celdaPlazo(f.plazo)),
      el('td', { class: 'fecha' }, fecha(f.fecha_hora)),
      el('td', {}, el('a', { href: `/detalle.html?id=${f.id_incidente}` }, 'Ver →'))));
  }
  $('actualizado').textContent = `Actualizado: ${fecha(new Date().toISOString())} · los casos nuevos llegan al instante`;
}

// Sonido corto generado en el navegador (dos tonos), sin archivos externos.
function sonar() {
  if (!audio) return;
  const t = audio.currentTime;
  [880, 660].forEach((f, i) => {
    const o = audio.createOscillator(); const g = audio.createGain();
    o.frequency.value = f; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.0001, t + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
    o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.21);
  });
}

function avisar(inc) {
  recientes.add(inc.id_incidente);
  const ref = `INC-${String(inc.id_incidente).padStart(4, '0')}`;
  const caja = el('div', { class: `aviso ${inc.urgente ? 'urgente' : ''}`, role: 'alert' },
    el('strong', {}, `${inc.urgente ? '🚨 Incidente urgente' : '🔔 Nuevo incidente'} · ${ref}`),
    el('div', {}, chip(inc.criticidad), ` ${inc.tipo_percibido}`),
    el('div', { class: 'nota' }, `Reportado por ${inc.empleado} (${inc.area})` +
      (inc.minutos_objetivo ? ` · contener en ${inc.minutos_objetivo} min` : '')),
    el('div', { class: 'aviso-acciones' },
      el('a', { href: `/detalle.html?id=${inc.id_incidente}`, class: 'btn btn-primario' }, 'Atender ahora →'),
      el('button', { type: 'button', class: 'reiniciar', onclick: (ev) => ev.target.closest('.aviso').remove() }, 'Cerrar')));
  $('avisos').prepend(caja);
  if (!inc.urgente) setTimeout(() => caja.remove(), 15000);
  if (inc.urgente) sonar();
  if (inc.urgente && 'Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(`🚨 ${ref}: criticidad ${inc.criticidad}`, {
      body: `${inc.tipo_percibido} — ${inc.empleado} (${inc.area})`, tag: ref });
    n.onclick = () => { window.focus(); location.href = `/detalle.html?id=${inc.id_incidente}`; };
  }
  cargar();
}

function conectarEnVivo() {
  const fuente = new EventSource('/api/eventos');
  fuente.addEventListener('open', () => { $('en-vivo').textContent = '● En vivo'; $('en-vivo').classList.add('ok'); });
  fuente.addEventListener('error', () => { $('en-vivo').textContent = '● Reconectando...'; $('en-vivo').classList.remove('ok'); });
  fuente.addEventListener('nuevo-incidente', (ev) => avisar(JSON.parse(ev.data)));
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
  $('activar-alertas').addEventListener('click', async (ev) => {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    ev.target.textContent = '🔔 Alertas activadas'; ev.target.disabled = true; sonar();
  });
  await cargar();
  conectarEnVivo();
  setInterval(cargar, 30000); // recalcula los plazos aunque no lleguen casos nuevos
}
iniciar();

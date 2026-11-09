'use strict';
const $ = (id) => document.getElementById(id);
const id = Number(new URLSearchParams(location.search).get('id'));

function aviso(tipo, msg) {
  $('error').classList.add('oculto'); $('ok').classList.add('oculto');
  if (msg) { $(tipo).textContent = msg; $(tipo).classList.remove('oculto'); }
}

let ultimaSugerencia = '';
let criticidadTocada = false;
const ORDEN = ['Baja', 'Media', 'Alta', 'Crítica'];
let datosPlaybook = {};

function accionesDe(tipo) {
  const p = datosPlaybook[tipo];
  return p ? `Contención: ${p.contencion}\nErradicación: ${p.erradicacion}\nRecuperación: ${p.recuperacion}` : '';
}

function minTexto(m) {
  m = Math.abs(m);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function pintarPlaybook(plazo, tipo) {
  const p = datosPlaybook[tipo];
  if (!p || !plazo) {
    $('playbook').replaceChildren(el('p', { class: 'nota' }, 'Elegí el tipo confirmado para ver el procedimiento y el tiempo objetivo.'));
    return;
  }
  const clase = !plazo.abierto ? (plazo.vencido ? 'vencido' : 'ok') : (plazo.vencido ? 'vencido' : 'corre');
  const texto = !plazo.abierto ? (plazo.vencido ? 'Cerrado fuera del tiempo objetivo' : 'Cerrado dentro del tiempo objetivo')
    : (plazo.vencido ? `Vencido hace ${minTexto(plazo.minutos_restantes)}` : `Quedan ${minTexto(plazo.minutos_restantes)}`);
  $('playbook').replaceChildren(el('dl', { class: 'datos' },
    el('dt', {}, 'Fila'), el('dd', {}, `${p.fila} (criticidad de referencia: ${p.criticidad})`),
    el('dt', {}, 'Objetivo'), el('dd', {}, `Contener en ${p.minutos} min desde la notificación`),
    el('dt', {}, 'Límite'), el('dd', {}, fecha(plazo.limite)),
    el('dt', {}, 'Situación'), el('dd', { class: `limite ${clase}` }, texto)));
}

function pintar({ incidente: i, tratamiento: t, adjunto, log, opciones, sugerencia, plazo, playbook }) {
  datosPlaybook = playbook;
  $('titulo').textContent = `MetdoSystems — Tratamiento de Incidente #${i.id_incidente}`;
  $('crit-inicial').replaceChildren(el('span', { class: `chip ${i.criticidad_inicial}` }, `${i.criticidad_inicial} (inicial)`));
  $('d-empleado').textContent = `${i.empleado} — ${i.area}`;
  $('d-tipo').textContent = i.tipo_percibido;
  $('d-fecha').textContent = fecha(i.fecha_hora, true);
  $('d-desc').textContent = `"${i.descripcion}"`;
  if (adjunto) {
    const base = `/api/incidentes/${i.id_incidente}/adjunto`;
    $('d-evidencia').replaceChildren(
      el('a', { href: `${base}?ver=1`, target: '_blank', rel: 'noopener', class: 'link-boton' }, '👁 Ver evidencia'), ' · ',
      el('a', { href: base, class: 'link-boton' }, '⬇ Descargar'),
      el('div', { class: 'nota' }, `Cifrada con AES-256-GCM en el servidor; se descifra solo al abrirla (cargada el ${fecha(adjunto.fecha_carga)}).`));
  } else {
    $('d-evidencia').textContent = '— (no adjuntada)';
  }

  for (const [sel, valores] of [['tipo_confirmado', opciones.tipos], ['criticidad_confirmada', opciones.niveles]]) {
    const s = $(sel);
    if (s.options.length === 1) for (const v of valores) s.append(el('option', { value: v }, v));
    s.value = t[sel] || '';
  }
  $('acciones_contencion').value = t.acciones_contencion || '';

  // Si TI todavía no completó la ficha, se precarga con la sugerencia del Playbook.
  const sinCompletar = !t.fecha_cierre && !t.tipo_confirmado && !t.acciones_contencion;
  if (sinCompletar && sugerencia.tipo_confirmado) {
    $('tipo_confirmado').value = sugerencia.tipo_confirmado;
    $('criticidad_confirmada').value = i.criticidad_inicial;
    $('acciones_contencion').value = sugerencia.acciones;
    ultimaSugerencia = sugerencia.acciones;
    $('sugerencia').textContent = `✨ Ficha precargada automáticamente con el Playbook (Anexo C) para «${sugerencia.tipo_confirmado}», a partir de lo que reportó el empleado. Revisala y ajustala antes de cerrar el caso.`;
    $('sugerencia').classList.remove('oculto');
  } else if (sinCompletar) {
    // Tipo «Otro»: no hay hipótesis automática; se parte de la criticidad inicial y TI clasifica.
    $('criticidad_confirmada').value = i.criticidad_inicial;
    $('sugerencia').textContent = '✨ El empleado eligió «Otro», así que el sistema no puede sugerir un tipo. Elegí el tipo confirmado y se cargan automáticamente las acciones y el plazo del Playbook (Anexo C).';
    $('sugerencia').classList.remove('oculto');
  } else {
    $('sugerencia').classList.add('oculto');
  }
  pintarPlaybook(plazo, $('tipo_confirmado').value);

  $('estado').textContent = i.estado;
  $('punto').className = `punto ${claseEstado(i.estado)}`;
  const cerrado = Boolean(t.fecha_cierre);
  $('acciones').classList.toggle('oculto', cerrado);
  document.querySelectorAll('#rett select, #rett textarea').forEach((c) => { c.disabled = cerrado; });
  if (cerrado) $('estado_final').value = t.estado_final;

  $('t-atencion').textContent = fecha(t.fecha_primera_atencion, true);
  $('t-dur-atencion').textContent = duracion(i.fecha_hora, t.fecha_primera_atencion) || '—';
  $('t-cierre').textContent = cerrado ? fecha(t.fecha_cierre, true) : 'Pendiente';
  $('t-dur-cierre').textContent = cerrado ? duracion(i.fecha_hora, t.fecha_cierre) : 'Pendiente';

  $('log').replaceChildren(...log.map((l) => el('li', {},
    el('span', { class: 'cuando' }, fecha(l.fecha_hora)),
    el('span', {}, l.accion, el('span', { class: 'quien' }, l.usuario)))));
}

async function guardar(cerrar) {
  aviso();
  try {
    const datos = await api(`/api/incidentes/${id}/tratamiento`, { method: 'PUT', body: JSON.stringify({
      tipo_confirmado: $('tipo_confirmado').value || null,
      criticidad_confirmada: $('criticidad_confirmada').value || null,
      acciones_contencion: $('acciones_contencion').value,
      estado_final: $('estado_final').value,
      cerrar,
    }) });
    pintar(datos);
    aviso('ok', cerrar ? 'El incidente quedó cerrado y registrado.' : 'Borrador guardado.');
  } catch (e) { aviso('error', e.message); }
}

async function iniciar() {
  const yo = await exigirRol('admin');
  $('usuario').textContent = `Administrador de TI: ${yo.nombre}`;
  $('cerrar').addEventListener('click', () => guardar(true));
  $('borrador').addEventListener('click', () => guardar(false));
  // Al cambiar el tipo confirmado, se actualizan las acciones sugeridas si TI no las modificó.
  $('tipo_confirmado').addEventListener('change', (ev) => {
    const area = $('acciones_contencion');
    if (!area.value.trim() || area.value === ultimaSugerencia) {
      ultimaSugerencia = accionesDe(ev.target.value);
      area.value = ultimaSugerencia;
    }
    const p = datosPlaybook[ev.target.value];
    const sel = $('criticidad_confirmada');
    // Si TI no tocó la criticidad, toma la de referencia del Playbook sin bajar nunca la inicial.
    if (p && (!sel.value || !criticidadTocada) && ORDEN.indexOf(p.criticidad) > ORDEN.indexOf(sel.value)) sel.value = p.criticidad;
  });
  $('criticidad_confirmada').addEventListener('change', () => { criticidadTocada = true; });
  try { pintar(await api(`/api/incidentes/${id}`)); } catch (e) { aviso('error', e.message); }
}
iniciar();

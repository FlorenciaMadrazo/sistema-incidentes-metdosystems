'use strict';
const $ = (id) => document.getElementById(id);
const id = Number(new URLSearchParams(location.search).get('id'));

function aviso(tipo, msg) {
  $('error').classList.add('oculto'); $('ok').classList.add('oculto');
  if (msg) { $(tipo).textContent = msg; $(tipo).classList.remove('oculto'); }
}

function pintar({ incidente: i, tratamiento: t, adjunto, log, opciones }) {
  $('titulo').textContent = `MetdoSystems — Tratamiento de Incidente #${i.id_incidente}`;
  $('crit-inicial').replaceChildren(el('span', { class: `chip ${i.criticidad_inicial}` }, `${i.criticidad_inicial} (inicial)`));
  $('d-empleado').textContent = `${i.empleado} — ${i.area}`;
  $('d-tipo').textContent = i.tipo_percibido;
  $('d-fecha').textContent = fecha(i.fecha_hora, true);
  $('d-desc').textContent = `"${i.descripcion}"`;
  if (adjunto) {
    $('d-evidencia').replaceChildren(el('a', { href: `/api/incidentes/${i.id_incidente}/adjunto`, class: 'link-boton' },
      '🔓 Descifrar y descargar evidencia'), el('small', { class: 'nota' }, ` (cifrada con AES-256-GCM, cargada el ${fecha(adjunto.fecha_carga)})`));
  } else {
    $('d-evidencia').textContent = '— (no adjuntada)';
  }

  for (const [sel, valores] of [['tipo_confirmado', opciones.tipos], ['criticidad_confirmada', opciones.niveles]]) {
    const s = $(sel);
    if (s.options.length === 1) for (const v of valores) s.append(el('option', { value: v }, v));
    s.value = t[sel] || '';
  }
  $('acciones_contencion').value = t.acciones_contencion || '';

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
  try { pintar(await api(`/api/incidentes/${id}`)); } catch (e) { aviso('error', e.message); }
}
iniciar();

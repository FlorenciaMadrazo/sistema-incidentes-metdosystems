'use strict';
// Reporte guiado (F-NINT) como conversación paso a paso.
const $ = (id) => document.getElementById(id);
const MIN_DESC = 20;
const ICONOS = { 'Correo o mensaje sospechoso': '✉️', 'Acceso no reconocido': '🔒',
  'Comportamiento extraño del sistema': '⚠️', 'Otro': '❓' };

// Pregunta de seguimiento según el tipo percibido. La respuesta se suma a la
// descripción, de modo que las reglas de criticidad del servidor también la evalúan.
const SEGUIMIENTO = {
  'Correo o mensaje sospechoso': {
    pregunta: '¿Llegaste a hacer clic en un enlace, abrir un archivo o escribir algún dato?',
    opciones: ['Sí, escribí mis datos o mi contraseña', 'Abrí un enlace o un archivo adjunto', 'No, no toqué nada', 'No estoy seguro/a'],
  },
  'Acceso no reconocido': {
    pregunta: '¿Cómo te diste cuenta del acceso?',
    opciones: ['Me llegó un aviso por correo o al celular', 'Veo cambios en mi cuenta que no hice', 'Alguien usó mi usuario', 'No estoy seguro/a'],
  },
  'Comportamiento extraño del sistema': {
    pregunta: '¿Qué es lo que notás en el equipo?',
    opciones: ['Está mucho más lento de lo normal', 'Se abren ventanas o programas solos', 'Hay archivos que no abren o cambiaron de nombre', 'Otra cosa'],
  },
  'Otro': {
    pregunta: '¿A quién afecta lo que pasó?',
    opciones: ['Solo a mí', 'A varias personas de mi área', 'No lo sé'],
  },
};
const PISTAS = {
  'Correo o mensaje sospechoso': 'Por ejemplo: me llegó un mensaje que decía ser del banco y me pedía confirmar mis datos...',
  'Acceso no reconocido': 'Por ejemplo: me avisaron de un inicio de sesión desde otra ciudad y no fui yo...',
  'Comportamiento extraño del sistema': 'Por ejemplo: desde esta mañana la computadora se traba y aparecen ventanas...',
  'Otro': 'Contanos qué viste, cuándo pasó y en qué equipo o sistema...',
};

const r = { tipo: null, descripcion: '', seguimiento: null, adjunto: null };
let yo;

function marcarPaso(n) {
  document.querySelectorAll('.paso').forEach((p) => {
    const k = Number(p.dataset.paso);
    p.classList.toggle('hecho', k < n);
    p.classList.toggle('actual', k === n);
  });
}

function bajar() { $('entrada').scrollIntoView({ behavior: 'smooth', block: 'end' }); }

function burbujaUsuario(texto) {
  $('conversacion').append(el('div', { class: 'chat usuario' }, el('div', { class: 'burbuja' }, texto)));
}

// Muestra "TI está escribiendo..." y luego el mensaje del asistente.
function dice(texto) {
  return new Promise((ok) => {
    const puntos = el('div', { class: 'burbuja ti escribiendo', 'aria-label': 'TI está escribiendo' }, el('i'), el('i'), el('i'));
    const fila = el('div', { class: 'chat' }, el('div', { class: 'avatar' }, 'TI'), puntos);
    $('conversacion').append(fila); bajar();
    setTimeout(() => {
      fila.replaceChildren(el('div', { class: 'avatar' }, 'TI'), el('div', { class: 'burbuja ti' }, texto));
      bajar(); ok();
    }, Math.min(1100, 450 + texto.length * 6));
  });
}

function entrada(...nodos) { $('entrada').replaceChildren(el('div', { class: 'bloque' }, ...nodos)); bajar(); }
function mostrarError(msg) { $('error').textContent = msg || ''; $('error').classList.toggle('oculto', !msg); }

// Paso 1: tipo de incidente
async function pasoTipo(tipos) {
  marcarPaso(1);
  await dice(`Hola ${yo.nombre.split(' ')[0]} 👋 Vamos a reportar lo que notaste. No hace falta saber de informática: te voy a ir preguntando de a una cosa. Primero contame, ¿qué tipo de situación viste?`);
  entrada(el('div', { class: 'opciones' }, tipos.map((t) => el('button', { type: 'button', class: 'opcion',
    onclick: () => { r.tipo = t; burbujaUsuario(`${ICONOS[t]} ${t}`); $('entrada').replaceChildren(); pasoDetalle(); } },
  `${ICONOS[t]} ${t}`))));
}

// Paso 2: descripción en lenguaje simple
async function pasoDetalle() {
  marcarPaso(2);
  await dice('Entendido. Ahora contame con tus palabras qué fue lo que pasó. No te preocupes por los términos técnicos: escribilo como se lo contarías a un compañero.');
  const area = el('textarea', { class: 'descripcion', maxlength: '1700', placeholder: PISTAS[r.tipo] });
  const cuenta = el('span', {}, '0');
  const seguir = el('button', { type: 'button', class: 'btn btn-primario', disabled: 'disabled' }, 'Continuar →');
  const ayuda = el('span', { class: 'ayuda' }, `Escribí al menos ${MIN_DESC} caracteres`);
  area.addEventListener('input', () => {
    const n = area.value.trim().length;
    cuenta.textContent = area.value.length;
    seguir.disabled = n < MIN_DESC;
    ayuda.textContent = n < MIN_DESC ? `Faltan ${MIN_DESC - n} caracteres` : 'Listo, podés continuar';
  });
  seguir.addEventListener('click', () => {
    r.descripcion = area.value.trim();
    burbujaUsuario(r.descripcion); $('entrada').replaceChildren(); pasoSeguimiento();
  });
  entrada(area, el('div', { class: 'contador' }, cuenta, '/1700'), el('div', { class: 'botonera' }, ayuda, seguir));
  area.focus();
}

// Paso 2 (continuación): pregunta de seguimiento según el tipo
async function pasoSeguimiento() {
  const s = SEGUIMIENTO[r.tipo];
  await dice(`Gracias. Una pregunta más para entender la situación: ${s.pregunta}`);
  entrada(el('div', { class: 'opciones una-col' }, s.opciones.map((o) => el('button', { type: 'button', class: 'opcion',
    onclick: () => { r.seguimiento = { pregunta: s.pregunta, respuesta: o }; burbujaUsuario(o); $('entrada').replaceChildren(); pasoEvidencia(); } }, o))));
}

// Paso 3: evidencia opcional
async function pasoEvidencia() {
  marcarPaso(3);
  const urgente = /escribí mis datos|alguien usó/i.test(r.seguimiento.respuesta);
  await dice(`${urgente ? 'Hiciste bien en avisar enseguida. ' : 'Perfecto. '}¿Tenés una captura de pantalla o el correo para adjuntar como evidencia? Es opcional, y el archivo se guarda cifrado: solo el equipo de TI puede abrirlo.`);
  const input = el('input', { type: 'file', accept: '.png,.jpg,.jpeg,.pdf,.txt,.eml' });
  const zona = el('label', { class: 'dropzone' }, '📎 Arrastrá un archivo o hacé clic para elegirlo',
    el('small', {}, '(PNG, JPG, PDF, TXT o EML, hasta 5 MB)'), input);
  const elegido = el('div', { class: 'archivo oculto' });
  const adjuntar = el('button', { type: 'button', class: 'btn btn-primario', disabled: 'disabled' }, 'Adjuntar y continuar →');
  const sinArchivo = el('button', { type: 'button', class: 'btn btn-secundario' }, 'Continuar sin adjuntar');
  function elegir(f) {
    mostrarError('');
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { mostrarError('El archivo supera el máximo de 5 MB.'); return; }
    r.adjunto = f;
    elegido.replaceChildren(el('span', {}, `📄 ${f.name} (${Math.ceil(f.size / 1024)} KB)`),
      el('button', { type: 'button', onclick: () => { r.adjunto = null; input.value = ''; elegido.classList.add('oculto'); adjuntar.disabled = true; } }, 'Quitar'));
    elegido.classList.remove('oculto'); adjuntar.disabled = false;
  }
  input.addEventListener('change', () => elegir(input.files[0]));
  zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('sobre'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
  zona.addEventListener('drop', (ev) => { ev.preventDefault(); zona.classList.remove('sobre'); elegir(ev.dataTransfer.files[0]); });
  adjuntar.addEventListener('click', () => { burbujaUsuario(`📎 ${r.adjunto.name}`); $('entrada').replaceChildren(); pasoResumen(); });
  sinArchivo.addEventListener('click', () => { r.adjunto = null; burbujaUsuario('No tengo evidencia para adjuntar'); $('entrada').replaceChildren(); pasoResumen(); });
  entrada(zona, elegido, el('div', { class: 'botonera' }, sinArchivo, adjuntar));
}

function descripcionCompleta() {
  return `${r.descripcion}\n\n${r.seguimiento.pregunta} ${r.seguimiento.respuesta}.`;
}

// Paso 4: resumen y envío
async function pasoResumen() {
  marcarPaso(4);
  await dice('Listo. Revisá el resumen antes de enviarlo. Si algo no está bien, podés empezar de nuevo.');
  const enviar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar reporte →');
  const corregir = el('button', { type: 'button', class: 'reiniciar' }, 'Empezar de nuevo');
  corregir.addEventListener('click', () => location.reload());
  enviar.addEventListener('click', async () => {
    mostrarError(''); enviar.disabled = true; enviar.textContent = r.adjunto ? 'Cifrando y enviando...' : 'Enviando...';
    try {
      const cuerpo = { tipo: r.tipo, descripcion: descripcionCompleta() };
      if (r.adjunto) cuerpo.adjunto = { nombre: r.adjunto.name, base64: await leerArchivo(r.adjunto) };
      const res = await api('/api/incidentes', { method: 'POST', body: JSON.stringify(cuerpo) });
      $('ref').textContent = `INC-${String(res.id_incidente).padStart(4, '0')}`;
      $('crit').replaceChildren(chip(res.criticidad_inicial));
      $('est').replaceChildren(estadoTag('Pendiente de revisión'));
      $('reporte').classList.add('oculto'); $('confirmacion').classList.remove('oculto');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      cargarMisReportes();
    } catch (e) {
      mostrarError(e.message); enviar.disabled = false; enviar.textContent = 'Enviar reporte →';
    }
  });
  entrada(el('div', { class: 'resumen' }, el('dl', { class: 'datos' },
    el('dt', {}, 'Reportado por'), el('dd', {}, `${yo.nombre} — ${yo.area}`),
    el('dt', {}, 'Tipo'), el('dd', {}, r.tipo),
    el('dt', {}, 'Qué pasó'), el('dd', {}, r.descripcion),
    el('dt', {}, 'Detalle'), el('dd', {}, r.seguimiento.respuesta),
    el('dt', {}, 'Evidencia'), el('dd', {}, r.adjunto ? `${r.adjunto.name} (se cifrará al enviar)` : 'Sin adjunto'))),
  el('div', { class: 'botonera' }, el('span', { class: 'ayuda' }, 'Al enviar, el sistema asigna una criticidad inicial automática.'), corregir, enviar));
}

function leerArchivo(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1]);
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

async function cargarMisReportes() {
  const filas = await api('/api/mis-incidentes');
  const tbody = $('filas'); tbody.replaceChildren();
  if (!filas.length) tbody.append(el('tr', {}, el('td', { colspan: '4', class: 'vacio' }, 'Todavía no reportaste incidentes.')));
  for (const f of filas) {
    tbody.append(el('tr', {}, el('td', { class: 'id' }, `INC-${String(f.id_incidente).padStart(4, '0')}`),
      el('td', {}, f.tipo_percibido), el('td', { class: 'fecha' }, fecha(f.fecha_hora)),
      el('td', {}, estadoTag(f.estado === 'Sin atender' ? 'Pendiente de revisión' : f.estado))));
  }
}

async function iniciar() {
  yo = await exigirRol('empleado');
  $('usuario').textContent = `Empleado: ${yo.nombre} (${yo.area})`;
  $('otro').addEventListener('click', () => location.reload());
  cargarMisReportes();
  pasoTipo(await api('/api/tipos'));
}
iniciar();

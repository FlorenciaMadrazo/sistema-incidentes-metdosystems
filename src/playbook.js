// Playbook de Respuesta y Contingencia (P-RRC, Anexo C).
// Matriz fija que define, por tipo de incidente, las acciones de cada fase y el
// tiempo objetivo de contención, medido desde la notificación del incidente.
'use strict';

const PLAYBOOK = {
  'Phishing confirmado': {
    fila: 'Phishing', criticidad: 'Media', minutos: 15,
    contencion: 'Bloquear el remitente y aislar el correo.',
    erradicacion: 'Eliminar el correo de todas las bandejas afectadas.',
    recuperacion: 'Notificar al equipo y reforzar la alerta.',
  },
  'Malware': {
    fila: 'Malware / virus', criticidad: 'Alta', minutos: 30,
    contencion: 'Desconectar el equipo de la red.',
    erradicacion: 'Escaneo completo y limpieza del equipo.',
    recuperacion: 'Restaurar desde el respaldo si corresponde.',
  },
  'Acceso no autorizado': {
    fila: 'Acceso no autorizado', criticidad: 'Alta', minutos: 20,
    contencion: 'Bloquear la cuenta comprometida.',
    erradicacion: 'Revisar los registros de acceso.',
    recuperacion: 'Restablecer las credenciales y notificar al usuario.',
  },
  'Fuga de datos': {
    fila: 'Fuga de datos', criticidad: 'Crítica', minutos: 60,
    contencion: 'Aislar el sistema afectado.',
    erradicacion: 'Identificar el alcance de la exposición.',
    recuperacion: 'Notificar a la AAIP y a los afectados si corresponde.',
  },
};

// Hipótesis inicial a partir de lo que percibió el empleado; TI la confirma o la cambia.
const SUGERENCIA_POR_TIPO = {
  'Correo o mensaje sospechoso': 'Phishing confirmado',
  'Acceso no reconocido': 'Acceso no autorizado',
  'Comportamiento extraño del sistema': 'Malware',
  'Otro': null,
};

function tipoSugerido(tipoPercibido) { return SUGERENCIA_POR_TIPO[tipoPercibido] || null; }

function accionesSugeridas(tipoConfirmado) {
  const p = PLAYBOOK[tipoConfirmado];
  if (!p) return null;
  return `Contención: ${p.contencion}\nErradicación: ${p.erradicacion}\nRecuperación: ${p.recuperacion}`;
}

// Estado del plazo de un caso abierto respecto del tiempo objetivo del Playbook.
function plazo(incidente, tratamiento, ahora = Date.now()) {
  const tipo = (tratamiento && tratamiento.tipo_confirmado) || tipoSugerido(incidente.tipo_percibido);
  const p = PLAYBOOK[tipo];
  if (!p) return null;
  const abierto = ['Sin atender', 'En tratamiento'].includes(incidente.estado);
  const limite = new Date(incidente.fecha_hora).getTime() + p.minutos * 60000;
  const fin = abierto ? ahora : new Date((tratamiento && tratamiento.fecha_cierre) || ahora).getTime();
  return {
    playbook: p.fila, minutos_objetivo: p.minutos, limite: new Date(limite).toISOString(),
    vencido: fin > limite, minutos_restantes: Math.round((limite - ahora) / 60000), abierto,
  };
}

module.exports = { PLAYBOOK, tipoSugerido, accionesSugeridas, plazo };

// Autenticación: resumen de contraseñas, política de contraseñas, bloqueo por
// intentos fallidos y sesiones con token firmado.
'use strict';
const crypto = require('node:crypto');
const { obtenerClave } = require('./cifrado');

// scrypt con los parámetros mínimos que recomienda OWASP (N = 2^17, r = 8, p = 1).
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, sal, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function verificarPassword(password, almacenado) {
  const [alg, N, r, p, salHex, hashHex] = String(almacenado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = crypto.scryptSync(password, Buffer.from(salHex, 'hex'), esperado.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(esperado, calculado);
}

// Política basada en NIST SP 800-63B-4: longitud antes que complejidad.
const COMUNES = ['123456789012345', 'contrasenasegura', 'passwordpassword', 'qwertyuiopasdfg',
  'metdosystems2026', 'empresa2026empresa', 'administrador123', 'bienvenido12345'];

function validarPolitica(password, email) {
  if (typeof password !== 'string' || password.length < 15) return 'La contraseña debe tener al menos 15 caracteres.';
  if (password.length > 64) return 'La contraseña no puede superar los 64 caracteres.';
  const p = password.toLowerCase();
  if (COMUNES.some((c) => p.includes(c))) return 'La contraseña es demasiado común.';
  const usuario = String(email || '').split('@')[0].toLowerCase();
  if (usuario && p.includes(usuario)) return 'La contraseña no puede contener el usuario.';
  return null;
}

// Bloqueo: 5 intentos fallidos seguidos bloquean la cuenta durante 15 minutos.
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

function estadoBloqueo(db, email, ahora = Date.now()) {
  const filas = db.prepare(
    `SELECT accion, fecha_hora FROM log_auditoria
     WHERE usuario = ? AND (accion LIKE 'Inicio de sesión fallido%' OR accion LIKE 'Inicio de sesión exitoso%')
     ORDER BY id_log DESC LIMIT ?`).all(email, MAX_INTENTOS);
  if (filas.length < MAX_INTENTOS) return { bloqueado: false };
  if (filas.some((f) => f.accion.startsWith('Inicio de sesión exitoso'))) return { bloqueado: false };
  const ultimo = new Date(filas[0].fecha_hora).getTime();
  const hasta = ultimo + BLOQUEO_MS;
  return hasta > ahora ? { bloqueado: true, hasta: new Date(hasta) } : { bloqueado: false };
}

// Sesiones: token aleatorio firmado con HMAC-SHA256 y registrado en el servidor,
// lo que permite invalidarlo al cerrar sesión y vencerlo por inactividad.
const INACTIVIDAD_MS = 30 * 60 * 1000;
const sesiones = new Map();

function firmar(valor) {
  return crypto.createHmac('sha256', obtenerClave('sesion.key')).update(valor).digest('base64url');
}

function crearSesion(usuario) {
  const id = crypto.randomBytes(32).toString('base64url');
  sesiones.set(id, { ...usuario, ultimaActividad: Date.now() });
  return `${id}.${firmar(id)}`;
}

function leerSesion(token, ahora = Date.now()) {
  if (!token || !token.includes('.')) return null;
  const [id, firma] = token.split('.');
  const esperada = firmar(id);
  if (firma.length !== esperada.length ||
      !crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
  const s = sesiones.get(id);
  if (!s) return null;
  if (ahora - s.ultimaActividad > INACTIVIDAD_MS) { sesiones.delete(id); return null; }
  s.ultimaActividad = ahora;
  return s;
}

function cerrarSesion(token) {
  if (token) sesiones.delete(String(token).split('.')[0]);
}

module.exports = {
  hashPassword, verificarPassword, validarPolitica, estadoBloqueo,
  crearSesion, leerSesion, cerrarSesion, MAX_INTENTOS, INACTIVIDAD_MS,
};

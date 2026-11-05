// Cifrado de evidencias con AES-256 en modo GCM (cifrado simétrico autenticado).
'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./db');

const ALGORITMO = 'aes-256-gcm';

// La clave se guarda en un archivo separado de la base y de los adjuntos.
// En producción se resguarda en un gestor de contraseñas (apartado Seguridad).
function obtenerClave(nombre) {
  const archivo = path.join(DATA_DIR, 'claves', nombre);
  if (!fs.existsSync(archivo)) {
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(archivo, 'utf8').trim(), 'hex');
}

// Formato: IV (12 bytes) | etiqueta de autenticación (16 bytes) | texto cifrado
function cifrar(datos, clave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cifrado]);
}

function descifrar(blob, clave) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const d = crypto.createDecipheriv(ALGORITMO, clave, iv);
  d.setAuthTag(tag); // si el archivo fue alterado, final() lanza un error
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

// El nombre y el tipo del archivo original viajan dentro del bloque cifrado,
// de modo que en disco no queda ningún dato legible de la evidencia.
function empaquetar(nombre, tipo, contenido) {
  const meta = Buffer.from(JSON.stringify({ nombre, tipo }), 'utf8');
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(meta.length);
  return Buffer.concat([largo, meta, contenido]);
}

function desempaquetar(buf) {
  const largo = buf.readUInt32BE(0);
  const meta = JSON.parse(buf.subarray(4, 4 + largo).toString('utf8'));
  return { ...meta, contenido: buf.subarray(4 + largo) };
}

module.exports = { obtenerClave, cifrar, descifrar, empaquetar, desempaquetar };

// Restaura un respaldo después de verificar su resumen SHA-256.
// Uso: npm run restaurar -- respaldos/respaldo-AAAA-MM-DD-HH-MM.bin
// (detener el servidor antes de restaurar)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DATA_DIR } = require('../src/db');
const { obtenerClave, descifrar } = require('../src/cifrado');

const inicio = Date.now();
const archivo = process.argv[2];
if (!archivo || !fs.existsSync(archivo)) {
  console.error('Indicá el archivo de respaldo: npm run restaurar -- respaldos/respaldo-....bin');
  process.exit(1);
}
const blob = fs.readFileSync(archivo);
const esperado = fs.readFileSync(`${archivo}.sha256`, 'utf8').split(/\s+/)[0];
const calculado = crypto.createHash('sha256').update(blob).digest('hex');
if (esperado !== calculado) {
  console.error('ERROR: el resumen SHA-256 no coincide. El respaldo fue alterado o está dañado. No se restaura.');
  process.exit(2);
}
console.log('SHA-256 verificado correctamente.');

const datos = descifrar(blob, obtenerClave('respaldo.key'));
fs.rmSync(path.join(DATA_DIR, 'adjuntos'), { recursive: true, force: true });
for (const f of ['incidentes.db-wal', 'incidentes.db-shm']) fs.rmSync(path.join(DATA_DIR, f), { force: true });
fs.mkdirSync(path.join(DATA_DIR, 'adjuntos'), { recursive: true });
let pos = 0; let cantidad = 0;
while (pos < datos.length) {
  const largoNombre = datos.readUInt32BE(pos); const largo = datos.readUInt32BE(pos + 4); pos += 8;
  const nombre = datos.subarray(pos, pos + largoNombre).toString('utf8'); pos += largoNombre;
  const destino = path.normalize(path.join(DATA_DIR, nombre));
  if (!destino.startsWith(path.normalize(DATA_DIR))) throw new Error('Ruta inválida en el respaldo');
  fs.writeFileSync(destino, datos.subarray(pos, pos + largo)); pos += largo; cantidad += 1;
}
console.log(`Restauración completa: ${cantidad} archivo(s) recuperado(s) en ${Date.now() - inicio} ms.`);

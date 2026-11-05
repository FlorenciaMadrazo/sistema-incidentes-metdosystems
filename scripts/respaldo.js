// Genera una copia de respaldo cifrada (AES-256-GCM) de la base y de los adjuntos,
// junto con su resumen SHA-256 para verificar después que no fue alterada.
// Uso: npm run respaldo   (en producción se programa con cron todos los días a las 02:00)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { abrir, DATA_DIR } = require('../src/db');
const { obtenerClave, cifrar } = require('../src/cifrado');

const DESTINO = process.env.RESPALDOS_DIR || path.join(__dirname, '..', 'respaldos');
fs.mkdirSync(DESTINO, { recursive: true });

// Copia consistente de la base sin detener el servicio.
const temporal = path.join(DESTINO, `.tmp-${Date.now()}.db`);
const db = abrir();
db.exec(`VACUUM INTO '${temporal.replace(/'/g, "''")}'`);
db.close();

// Empaquetado simple: [largo del nombre][nombre][largo del contenido][contenido]...
const partes = [];
function agregar(nombre, contenido) {
  const n = Buffer.from(nombre, 'utf8');
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(n.length, 0); cab.writeUInt32BE(contenido.length, 4);
  partes.push(cab, n, contenido);
}
agregar('incidentes.db', fs.readFileSync(temporal));
fs.rmSync(temporal);
const dirAdj = path.join(DATA_DIR, 'adjuntos');
const adjuntos = fs.existsSync(dirAdj) ? fs.readdirSync(dirAdj) : [];
for (const a of adjuntos) agregar(`adjuntos/${a}`, fs.readFileSync(path.join(dirAdj, a)));

const sello = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const archivo = path.join(DESTINO, `respaldo-${sello}.bin`);
const blob = cifrar(Buffer.concat(partes), obtenerClave('respaldo.key'));
fs.writeFileSync(archivo, blob);
const sha = crypto.createHash('sha256').update(blob).digest('hex');
fs.writeFileSync(`${archivo}.sha256`, `${sha}  ${path.basename(archivo)}\n`);

console.log(`Respaldo generado: ${archivo}`);
console.log(`Contenido: base de datos + ${adjuntos.length} adjunto(s) cifrado(s)`);
console.log(`SHA-256: ${sha}`);

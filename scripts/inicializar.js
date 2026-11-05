// Crea la base con los usuarios de prueba y algunos casos de ejemplo.
// Uso: npm run inicializar   (borra los datos anteriores)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { abrir, DATA_DIR } = require('../src/db');
const { cargarDatosDemo, PASS_EMPLEADO, PASS_ADMIN } = require('../src/datos-demo');

for (const f of ['incidentes.db', 'incidentes.db-wal', 'incidentes.db-shm']) {
  fs.rmSync(path.join(DATA_DIR, f), { force: true });
}
fs.rmSync(path.join(DATA_DIR, 'adjuntos'), { recursive: true, force: true });

const db = abrir();
console.log('Calculando los resúmenes de contraseñas (scrypt)...');
cargarDatosDemo(db);
console.log('Base inicializada en', path.join(DATA_DIR, 'incidentes.db'));
console.log('\nUsuarios de prueba:');
console.log(`  Empleado:           juana.perez@metdosystems.com / ${PASS_EMPLEADO}`);
console.log(`  Administrador de TI: marcos.diaz@metdosystems.com / ${PASS_ADMIN}`);

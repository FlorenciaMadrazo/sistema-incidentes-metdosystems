// Pruebas automáticas del prototipo. Uso: npm test
'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'metdo-test-'));

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearApp } = require('../src/server');
const { hashPassword } = require('../src/auth');
const criticidad = require('../src/criticidad');
const { validarPolitica } = require('../src/auth');

const EMP = { email: 'juana.perez@metdosystems.com', password: 'Reporte-Seguro-2026' };
const ADM = { email: 'marcos.diaz@metdosystems.com', password: 'Gestion-Incidentes-TI-2026' };
let base; let app;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function login(cred) {
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cred) });
  return { r, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
function pedir(ruta, cookie, opciones = {}) {
  return fetch(`${base}${ruta}`, { ...opciones,
    headers: { Cookie: cookie, ...(opciones.body ? { 'Content-Type': 'application/json' } : {}) } });
}

before(async () => {
  app = crearApp();
  const h1 = hashPassword(EMP.password); const h2 = hashPassword(ADM.password);
  app.db.prepare("INSERT INTO empleado (nombre, email, area, password_hash) VALUES ('Juana Pérez', ?, 'Ventas', ?)").run(EMP.email, h1);
  app.db.prepare("INSERT INTO empleado (nombre, email, area, password_hash) VALUES ('Iván Castro', 'ivan.castro@metdosystems.com', 'Ventas', ?)").run(h1);
  app.db.prepare("INSERT INTO administrador_ti (nombre, email, password_hash) VALUES ('Marcos Díaz', ?, ?)").run(ADM.email, h2);
  await new Promise((ok) => app.servidor.listen(0, ok));
  base = `http://localhost:${app.servidor.address().port}`;
});
after(() => app.servidor.close());

test('Reglas de criticidad inicial', () => {
  assert.equal(criticidad.calcular('Acceso no reconocido', 'x').criticidad, 'Alta');
  assert.equal(criticidad.calcular('Comportamiento extraño del sistema', 'x').criticidad, 'Alta');
  assert.equal(criticidad.calcular('Otro', 'x').criticidad, 'Baja');
  assert.equal(criticidad.calcular('Correo o mensaje sospechoso', 'Un correo raro del banco').criticidad, 'Media');
  assert.equal(criticidad.calcular('Correo o mensaje sospechoso', 'Me pidieron la CONTRASEÑA').criticidad, 'Crítica');
  assert.throws(() => criticidad.calcular('Inventado', 'x'));
});

test('Política de contraseñas (NIST SP 800-63B-4)', () => {
  assert.ok(validarPolitica('corta', 'a@b.com'));
  assert.ok(validarPolitica('juana.perez-es-mi-clave', 'juana.perez@metdosystems.com'));
  assert.equal(validarPolitica('Reporte-Seguro-2026', 'juana.perez@metdosystems.com'), null);
});

test('Sin sesión no se accede a la API', async () => {
  const r = await fetch(`${base}/api/incidentes`);
  assert.equal(r.status, 401);
});

test('Control de acceso por roles en el servidor', async () => {
  const emp = await login(EMP); const adm = await login(ADM);
  assert.equal(emp.r.status, 200);
  assert.match(emp.r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await pedir('/api/incidentes', emp.cookie)).status, 403, 'el empleado no ve el dashboard');
  assert.equal((await pedir('/api/resumen', emp.cookie)).status, 403);
  const r = await pedir('/api/incidentes', adm.cookie, { method: 'POST', body: JSON.stringify({ tipo: 'Otro', descripcion: 'reporte desde TI' }) });
  assert.equal(r.status, 403, 'el administrador no reporta incidentes desde su cuenta');
});

test('Flujo completo: reporte, cifrado, primera atención, cierre y tiempos', async () => {
  const emp = await login(EMP); const adm = await login(ADM);
  const r = await pedir('/api/incidentes', emp.cookie, { method: 'POST', body: JSON.stringify({
    tipo: 'Correo o mensaje sospechoso', descripcion: 'Me pidieron la contraseña por WhatsApp',
    adjunto: { nombre: 'captura.png', base64: PNG.toString('base64') } }) });
  assert.equal(r.status, 201);
  const { id_incidente: id, criticidad_inicial } = await r.json();
  assert.equal(criticidad_inicial, 'Crítica');

  // En disco la evidencia no es legible (no conserva la firma PNG).
  const adj = app.db.prepare('SELECT ruta_archivo_cifrado FROM adjunto WHERE id_incidente = ?').get(id);
  const enDisco = fs.readFileSync(path.join(process.env.DATA_DIR, adj.ruta_archivo_cifrado));
  assert.notDeepEqual(enDisco.subarray(0, 4), PNG.subarray(0, 4));

  // Otro empleado no ve los reportes de Juana.
  const ivan = await login({ email: 'ivan.castro@metdosystems.com', password: EMP.password });
  assert.equal((await (await pedir('/api/mis-incidentes', ivan.cookie)).json()).length, 0);

  // Primera atención al abrir el caso.
  const v = await (await pedir(`/api/incidentes/${id}`, adm.cookie)).json();
  assert.equal(v.incidente.estado, 'En tratamiento');
  assert.ok(v.tratamiento.fecha_primera_atencion);
  assert.equal(v.tratamiento.fecha_cierre, null);

  // La evidencia descifrada es idéntica a la original.
  const d = await pedir(`/api/incidentes/${id}/adjunto`, adm.cookie);
  assert.deepEqual(Buffer.from(await d.arrayBuffer()), PNG);

  // No se puede cerrar sin completar la F-RETT.
  const incompleto = await pedir(`/api/incidentes/${id}/tratamiento`, adm.cookie, { method: 'PUT',
    body: JSON.stringify({ cerrar: true, estado_final: 'Resuelto' }) });
  assert.equal(incompleto.status, 400);

  const c = await pedir(`/api/incidentes/${id}/tratamiento`, adm.cookie, { method: 'PUT', body: JSON.stringify({
    tipo_confirmado: 'Phishing confirmado', criticidad_confirmada: 'Crítica',
    acciones_contencion: 'Se bloqueó el remitente y se cambió la contraseña.', cerrar: true, estado_final: 'Resuelto' }) });
  const cerrado = await c.json();
  assert.equal(cerrado.incidente.estado, 'Resuelto');
  assert.ok(cerrado.tratamiento.fecha_cierre >= cerrado.tratamiento.fecha_primera_atencion);
  const acciones = cerrado.log.map((l) => l.accion);
  for (const esperado of ['Incidente creado (F-NINT)', 'Primera atención', 'Evidencia descifrada', 'caso cerrado: Resuelto']) {
    assert.ok(acciones.some((a) => a.includes(esperado)), `falta en el log: ${esperado}`);
  }
});

test('La evidencia alterada en disco se detecta (GCM)', async () => {
  const emp = await login(EMP); const adm = await login(ADM);
  const r = await pedir('/api/incidentes', emp.cookie, { method: 'POST', body: JSON.stringify({
    tipo: 'Otro', descripcion: 'Prueba de integridad de evidencia', adjunto: { nombre: 'nota.txt', base64: Buffer.from('hola').toString('base64') } }) });
  const { id_incidente: id } = await r.json();
  const adj = app.db.prepare('SELECT ruta_archivo_cifrado FROM adjunto WHERE id_incidente = ?').get(id);
  const archivo = path.join(process.env.DATA_DIR, adj.ruta_archivo_cifrado);
  const blob = fs.readFileSync(archivo); blob[blob.length - 1] ^= 0xff; fs.writeFileSync(archivo, blob);
  assert.equal((await pedir(`/api/incidentes/${id}/adjunto`, adm.cookie)).status, 500);
});

test('Se rechazan archivos cuyo contenido no coincide con la extensión', async () => {
  const emp = await login(EMP);
  const r = await pedir('/api/incidentes', emp.cookie, { method: 'POST', body: JSON.stringify({
    tipo: 'Otro', descripcion: 'Archivo disfrazado de imagen', adjunto: { nombre: 'foto.png', base64: Buffer.from('MZ ejecutable').toString('base64') } }) });
  assert.equal(r.status, 400);
  const exe = await pedir('/api/incidentes', emp.cookie, { method: 'POST', body: JSON.stringify({
    tipo: 'Otro', descripcion: 'Archivo ejecutable adjunto', adjunto: { nombre: 'virus.exe', base64: 'TVo=' } }) });
  assert.equal(exe.status, 400);
});

test('El log de auditoría no puede modificarse ni borrarse', () => {
  assert.throws(() => app.db.prepare("UPDATE log_auditoria SET accion = 'x'").run(), /no puede modificarse/);
  assert.throws(() => app.db.prepare('DELETE FROM log_auditoria').run(), /no puede borrarse/);
});

test('Bloqueo de la cuenta tras 5 intentos fallidos', async () => {
  const cred = { email: 'ivan.castro@metdosystems.com', password: 'clave-incorrecta-123' };
  for (let i = 0; i < 5; i++) assert.equal((await login(cred)).r.status, 401);
  const bloqueado = await login({ email: cred.email, password: EMP.password });
  assert.equal(bloqueado.r.status, 423, 'aun con la contraseña correcta queda bloqueada 15 minutos');
});

test('Cerrar sesión invalida el token', async () => {
  const emp = await login(EMP);
  await pedir('/api/logout', emp.cookie, { method: 'POST' });
  assert.equal((await pedir('/api/me', emp.cookie)).status, 401);
});

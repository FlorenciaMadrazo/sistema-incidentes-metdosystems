// Usuarios de prueba y casos de ejemplo para la demostración.
'use strict';
const { hashPassword } = require('./auth');

const PASS_EMPLEADO = 'Reporte-Seguro-2026';
const PASS_ADMIN = 'Gestion-Incidentes-TI-2026';

function cargarDatosDemo(db) {
  const hEmp = hashPassword(PASS_EMPLEADO);
  const hAdm = hashPassword(PASS_ADMIN);

  const empleados = [
    ['Juana Pérez', 'juana.perez@metdosystems.com', 'Ventas'],
    ['Iván Castro', 'ivan.castro@metdosystems.com', 'Ventas'],
    ['Lucía Farfán', 'lucia.farfan@metdosystems.com', 'Administración'],
    ['Rodrigo Sosa', 'rodrigo.sosa@metdosystems.com', 'Administración'],
  ];
  const insEmp = db.prepare('INSERT INTO empleado (nombre, email, area, password_hash) VALUES (?, ?, ?, ?)');
  for (const [n, e, a] of empleados) insEmp.run(n, e, a, hEmp);
  db.prepare('INSERT INTO administrador_ti (nombre, email, password_hash) VALUES (?, ?, ?)')
    .run('Marcos Díaz', 'marcos.diaz@metdosystems.com', hAdm);

  // Casos de ejemplo con fechas pasadas, para que el dashboard no arranque vacío.
  const hace = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const log = db.prepare('INSERT INTO log_auditoria (id_incidente, accion, usuario, fecha_hora) VALUES (?, ?, ?, ?)');
  const inc = db.prepare(`INSERT INTO incidente (id_empleado, tipo_percibido, descripcion, fecha_hora, criticidad_inicial, estado)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const trat = db.prepare(`INSERT INTO tratamiento (id_incidente, id_admin, tipo_confirmado, criticidad_confirmada,
    acciones_contencion, fecha_primera_atencion, fecha_cierre, estado_final) VALUES (?, 1, ?, ?, ?, ?, ?, ?)`);
  const admin = 'marcos.diaz@metdosystems.com';

  // 1. Resuelto
  inc.run(2, 'Correo o mensaje sospechoso', 'Me llegó un correo que dice ser del banco y pide hacer clic en un link para reactivar la cuenta. No lo abrí.',
    hace(50), 'Media', 'Resuelto');
  log.run(1, 'Incidente creado (F-NINT)', 'ivan.castro@metdosystems.com', hace(50));
  log.run(1, 'Criticidad inicial asignada: Media (regla por tipo de incidente)', 'sistema', hace(50));
  trat.run(1, 'Phishing confirmado', 'Media', 'Se bloqueó el remitente y se eliminó el correo de todas las bandejas. Se avisó al área de Ventas.',
    hace(49.8), hace(49.2), 'Resuelto');
  log.run(1, 'Primera atención: el caso fue abierto por TI', admin, hace(49.8));
  log.run(1, 'Cambio de estado: Sin atender → En tratamiento', admin, hace(49.8));
  log.run(1, 'Criticidad confirmada: Media (inicial: Media)', admin, hace(49.2));
  log.run(1, 'Tratamiento registrado (F-RETT) y caso cerrado: Resuelto', admin, hace(49.2));
  log.run(1, 'Cambio de estado: En tratamiento → Resuelto', admin, hace(49.2));

  // 2. En tratamiento
  inc.run(3, 'Comportamiento extraño del sistema', 'La computadora de la oficina se pone muy lenta y aparecen ventanas que se abren solas.',
    hace(26), 'Alta', 'En tratamiento');
  log.run(2, 'Incidente creado (F-NINT)', 'lucia.farfan@metdosystems.com', hace(26));
  log.run(2, 'Criticidad inicial asignada: Alta (regla por tipo de incidente)', 'sistema', hace(26));
  trat.run(2, null, null, null, hace(25.7), null, 'En seguimiento');
  log.run(2, 'Primera atención: el caso fue abierto por TI', admin, hace(25.7));
  log.run(2, 'Cambio de estado: Sin atender → En tratamiento', admin, hace(25.7));

  // 3. Sin atender
  inc.run(4, 'Acceso no reconocido', 'Me llegó un aviso de inicio de sesión en mi cuenta desde otra ciudad y no fui yo.',
    hace(2), 'Alta', 'Sin atender');
  log.run(3, 'Incidente creado (F-NINT)', 'rodrigo.sosa@metdosystems.com', hace(2));
  log.run(3, 'Criticidad inicial asignada: Alta (regla por tipo de incidente)', 'sistema', hace(2));

}

module.exports = { cargarDatosDemo, PASS_EMPLEADO, PASS_ADMIN };

// Servidor de aplicación (capa intermedia de la arquitectura en tres capas).
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db_ = require('./db');
const auth = require('./auth');
const criticidad = require('./criticidad');
const cifrado = require('./cifrado');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_ADJUNTO = 5 * 1024 * 1024; // 5 MB
const EXTENSIONES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.eml': 'message/rfc822' };
const FIRMAS = { '.png': [0x89, 0x50, 0x4e, 0x47], '.jpg': [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff], '.pdf': [0x25, 0x50, 0x44, 0x46] };
const ESTADOS_FINALES = ['En seguimiento', 'Resuelto', 'Escalado'];
const NIVELES = ['Baja', 'Media', 'Alta', 'Crítica'];
const TIPOS_CONFIRMADOS = ['Phishing confirmado', 'Malware', 'Acceso no autorizado', 'Fuga de datos',
  'Falso positivo', 'Otro'];

class ErrorHttp extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado; }
}

function crearApp({ db = db_.abrir() } = {}) {
  const claveAdjuntos = cifrado.obtenerClave('adjuntos.key');
  const dirAdjuntos = path.join(db_.DATA_DIR, 'adjuntos');
  fs.mkdirSync(dirAdjuntos, { recursive: true });

  const ahora = () => new Date().toISOString();
  const auditar = (idIncidente, accion, usuario) => db.prepare(
    'INSERT INTO log_auditoria (id_incidente, accion, usuario, fecha_hora) VALUES (?, ?, ?, ?)')
    .run(idIncidente ?? null, accion, usuario, ahora());

  // ---------- utilidades HTTP ----------
  function enviar(res, estado, cuerpo, extra = {}) {
    const json = JSON.stringify(cuerpo);
    res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', ...extra });
    res.end(json);
  }

  function leerCuerpo(req, limite = 8 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const partes = []; let total = 0;
      req.on('data', (c) => {
        total += c.length;
        if (total > limite) { reject(new ErrorHttp(413, 'La solicitud es demasiado grande.')); req.destroy(); }
        else partes.push(c);
      });
      req.on('end', () => {
        if (!partes.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
        catch { reject(new ErrorHttp(400, 'Formato de datos inválido.')); }
      });
      req.on('error', reject);
    });
  }

  function cookie(req, nombre) {
    const c = req.headers.cookie || '';
    const m = c.split(';').map((s) => s.trim()).find((s) => s.startsWith(nombre + '='));
    return m ? decodeURIComponent(m.slice(nombre.length + 1)) : null;
  }

  function sesion(req, rolRequerido) {
    const s = auth.leerSesion(cookie(req, 'sid'));
    if (!s) throw new ErrorHttp(401, 'La sesión no es válida o venció. Volvé a iniciar sesión.');
    if (rolRequerido && s.rol !== rolRequerido) {
      auditar(null, `Acceso denegado a función de ${rolRequerido}: ${req.method} ${req.url}`, s.email);
      throw new ErrorHttp(403, 'No tenés permiso para realizar esta acción.');
    }
    return s;
  }

  // ---------- casos de uso ----------
  function login(req, res, cuerpo) {
    const email = String(cuerpo.email || '').trim().toLowerCase();
    const password = String(cuerpo.password || '');
    // Detrás de un proxy (por ejemplo, Render) la IP real llega en X-Forwarded-For.
    const ip = process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
    const bloqueo = auth.estadoBloqueo(db, email);
    if (bloqueo.bloqueado) {
      throw new ErrorHttp(423, 'La cuenta está bloqueada temporalmente por intentos fallidos. Probá de nuevo en 15 minutos.');
    }
    const emp = db.prepare('SELECT id_empleado AS id, nombre, email, area, password_hash FROM empleado WHERE email = ?').get(email);
    const adm = emp ? null : db.prepare('SELECT id_admin AS id, nombre, email, password_hash FROM administrador_ti WHERE email = ?').get(email);
    const u = emp || adm;
    if (!u || !auth.verificarPassword(password, u.password_hash)) {
      auditar(null, `Inicio de sesión fallido desde ${ip}`, email || '(vacío)');
      throw new ErrorHttp(401, 'El email o la contraseña no son correctos.');
    }
    const usuario = { id: u.id, nombre: u.nombre, email: u.email, area: u.area || null,
      rol: emp ? 'empleado' : 'admin' };
    auditar(null, `Inicio de sesión exitoso desde ${ip}`, u.email);
    const token = auth.crearSesion(usuario);
    const segura = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
    enviar(res, 200, { usuario }, {
      'Set-Cookie': `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${auth.INACTIVIDAD_MS / 1000}${segura}`,
    });
  }

  function validarAdjunto(adj) {
    const nombre = path.basename(String(adj.nombre || 'evidencia'));
    const ext = path.extname(nombre).toLowerCase();
    if (!EXTENSIONES[ext]) throw new ErrorHttp(400, 'Tipo de archivo no permitido. Se aceptan PNG, JPG, PDF, TXT y EML.');
    const contenido = Buffer.from(String(adj.base64 || ''), 'base64');
    if (!contenido.length) throw new ErrorHttp(400, 'El archivo adjunto está vacío.');
    if (contenido.length > MAX_ADJUNTO) throw new ErrorHttp(400, 'El archivo supera el máximo de 5 MB.');
    const firma = FIRMAS[ext];
    if (firma && !firma.every((b, i) => contenido[i] === b)) {
      throw new ErrorHttp(400, 'El contenido del archivo no coincide con su extensión.');
    }
    return { nombre, tipo: EXTENSIONES[ext], contenido };
  }

  function crearIncidente(req, res, cuerpo) {
    const s = sesion(req, 'empleado');
    const tipo = String(cuerpo.tipo || '');
    const descripcion = String(cuerpo.descripcion || '').trim();
    if (!criticidad.TIPOS.includes(tipo)) throw new ErrorHttp(400, 'Elegí un tipo de incidente.');
    if (descripcion.length < 10) throw new ErrorHttp(400, 'Contanos un poco más de lo que pasó (al menos 10 caracteres).');
    if (descripcion.length > 2000) throw new ErrorHttp(400, 'La descripción no puede superar los 2000 caracteres.');
    const adj = cuerpo.adjunto ? validarAdjunto(cuerpo.adjunto) : null;
    const crit = criticidad.calcular(tipo, descripcion);
    const fecha = ahora();

    db.exec('BEGIN');
    try {
      const r = db.prepare(`INSERT INTO incidente (id_empleado, tipo_percibido, descripcion, fecha_hora, criticidad_inicial, estado)
        VALUES (?, ?, ?, ?, ?, 'Sin atender')`).run(s.id, tipo, descripcion, fecha, crit.criticidad);
      const id = Number(r.lastInsertRowid);
      auditar(id, 'Incidente creado (F-NINT)', s.email);
      auditar(id, `Criticidad inicial asignada: ${crit.criticidad} (${crit.motivo})`, 'sistema');
      if (adj) {
        const archivo = `${crypto.randomUUID()}.bin`;
        const blob = cifrado.cifrar(cifrado.empaquetar(adj.nombre, adj.tipo, adj.contenido), claveAdjuntos);
        fs.writeFileSync(path.join(dirAdjuntos, archivo), blob);
        db.prepare('INSERT INTO adjunto (id_incidente, ruta_archivo_cifrado, fecha_carga) VALUES (?, ?, ?)')
          .run(id, `adjuntos/${archivo}`, fecha);
        auditar(id, 'Evidencia adjuntada y cifrada (AES-256-GCM)', s.email);
      }
      db.exec('COMMIT');
      enviar(res, 201, { id_incidente: id, criticidad_inicial: crit.criticidad, estado: 'Sin atender' });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function misIncidentes(req, res) {
    const s = sesion(req, 'empleado');
    const filas = db.prepare(`SELECT id_incidente, tipo_percibido, fecha_hora, estado FROM incidente
      WHERE id_empleado = ? ORDER BY id_incidente DESC`).all(s.id);
    enviar(res, 200, filas);
  }

  const CONSULTA_LISTADO = `
    SELECT i.id_incidente, i.tipo_percibido, i.fecha_hora, i.criticidad_inicial, i.estado,
           e.nombre AS empleado, e.area, t.criticidad_confirmada,
           t.fecha_primera_atencion, t.fecha_cierre
    FROM incidente i JOIN empleado e ON e.id_empleado = i.id_empleado
    LEFT JOIN tratamiento t ON t.id_incidente = i.id_incidente`;

  // Orden por urgencia: primero lo abierto, después la criticidad (vigente) y por último lo más reciente.
  const ORDEN_URGENCIA = `ORDER BY
      CASE i.estado WHEN 'Sin atender' THEN 0 WHEN 'En tratamiento' THEN 1 ELSE 2 END,
      CASE COALESCE(t.criticidad_confirmada, i.criticidad_inicial)
        WHEN 'Crítica' THEN 0 WHEN 'Alta' THEN 1 WHEN 'Media' THEN 2 ELSE 3 END,
      i.fecha_hora DESC`;

  function listarIncidentes(req, res, url) {
    sesion(req, 'admin');
    const estado = url.searchParams.get('estado') || null;
    const nivel = url.searchParams.get('criticidad') || null;
    const filas = db.prepare(CONSULTA_LISTADO + `
      WHERE (? IS NULL OR i.estado = ?)
        AND (? IS NULL OR COALESCE(t.criticidad_confirmada, i.criticidad_inicial) = ?) ` + ORDEN_URGENCIA)
      .all(estado, estado, nivel, nivel);
    enviar(res, 200, filas);
  }

  function resumen(req, res) {
    sesion(req, 'admin');
    const abiertos = db.prepare(CONSULTA_LISTADO + " WHERE i.estado IN ('Sin atender', 'En tratamiento')").all();
    const porNivel = Object.fromEntries(NIVELES.map((n) => [n, 0]));
    for (const f of abiertos) porNivel[f.criticidad_confirmada || f.criticidad_inicial] += 1;
    const minutos = (a, b) => (new Date(b) - new Date(a)) / 60000;
    const tratados = db.prepare(CONSULTA_LISTADO + ' WHERE t.id_tratamiento IS NOT NULL').all();
    const prom = (xs) => (xs.length ? Math.round(xs.reduce((x, y) => x + y, 0) / xs.length) : null);
    enviar(res, 200, {
      abiertos: abiertos.length,
      sin_atender: abiertos.filter((f) => f.estado === 'Sin atender').length,
      por_criticidad: porNivel,
      minutos_promedio_primera_atencion: prom(tratados.map((f) => minutos(f.fecha_hora, f.fecha_primera_atencion))),
      minutos_promedio_resolucion: prom(tratados.filter((f) => f.fecha_cierre).map((f) => minutos(f.fecha_hora, f.fecha_cierre))),
    });
  }

  function buscarIncidente(id) {
    const inc = db.prepare(`SELECT i.*, e.nombre AS empleado, e.area, e.email AS email_empleado
      FROM incidente i JOIN empleado e ON e.id_empleado = i.id_empleado WHERE i.id_incidente = ?`).get(id);
    if (!inc) throw new ErrorHttp(404, 'El incidente no existe.');
    return inc;
  }

  function verIncidente(req, res, id, registrarAcceso = true) {
    const s = sesion(req, 'admin');
    let inc = buscarIncidente(id);
    let trat = db.prepare('SELECT * FROM tratamiento WHERE id_incidente = ?').get(id);
    // La primera vez que TI abre el caso queda registrada la primera atención.
    if (!trat) {
      db.exec('BEGIN');
      try {
        db.prepare(`INSERT INTO tratamiento (id_incidente, id_admin, fecha_primera_atencion, estado_final)
          VALUES (?, ?, ?, 'En seguimiento')`).run(id, s.id, ahora());
        db.prepare("UPDATE incidente SET estado = 'En tratamiento' WHERE id_incidente = ?").run(id);
        auditar(id, 'Primera atención: el caso fue abierto por TI', s.email);
        auditar(id, 'Cambio de estado: Sin atender → En tratamiento', s.email);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      inc = buscarIncidente(id);
      trat = db.prepare('SELECT * FROM tratamiento WHERE id_incidente = ?').get(id);
    } else if (registrarAcceso) {
      auditar(id, 'Caso consultado por TI', s.email);
    }
    const adjunto = db.prepare('SELECT id_adjunto, fecha_carga FROM adjunto WHERE id_incidente = ?').get(id) || null;
    const log = db.prepare('SELECT accion, usuario, fecha_hora FROM log_auditoria WHERE id_incidente = ? ORDER BY id_log').all(id);
    enviar(res, 200, { incidente: inc, tratamiento: trat, adjunto, log,
      opciones: { niveles: NIVELES, tipos: TIPOS_CONFIRMADOS } });
  }

  function guardarTratamiento(req, res, id, cuerpo) {
    const s = sesion(req, 'admin');
    const inc = buscarIncidente(id);
    const trat = db.prepare('SELECT * FROM tratamiento WHERE id_incidente = ?').get(id);
    if (!trat) throw new ErrorHttp(409, 'Primero hay que abrir el incidente.');
    if (trat.fecha_cierre) throw new ErrorHttp(409, 'El incidente ya está cerrado.');
    const tipo = cuerpo.tipo_confirmado || null;
    const nivel = cuerpo.criticidad_confirmada || null;
    const acciones = String(cuerpo.acciones_contencion || '').trim() || null;
    if (tipo && !TIPOS_CONFIRMADOS.includes(tipo)) throw new ErrorHttp(400, 'Tipo confirmado no válido.');
    if (nivel && !NIVELES.includes(nivel)) throw new ErrorHttp(400, 'Criticidad no válida.');
    if (acciones && acciones.length > 4000) throw new ErrorHttp(400, 'Las acciones superan los 4000 caracteres.');
    const cerrar = Boolean(cuerpo.cerrar);
    const estadoFinal = cerrar ? cuerpo.estado_final : 'En seguimiento';
    if (cerrar) {
      if (!['Resuelto', 'Escalado'].includes(estadoFinal)) throw new ErrorHttp(400, 'Elegí el estado final: Resuelto o Escalado.');
      if (!tipo || !nivel || !acciones) throw new ErrorHttp(400, 'Para cerrar el caso completá el tipo confirmado, la criticidad y las acciones de contención.');
    }
    db.exec('BEGIN');
    try {
      db.prepare(`UPDATE tratamiento SET tipo_confirmado = ?, criticidad_confirmada = ?, acciones_contencion = ?,
        estado_final = ?, fecha_cierre = ? WHERE id_incidente = ?`)
        .run(tipo, nivel, acciones, estadoFinal, cerrar ? ahora() : null, id);
      if (nivel && nivel !== trat.criticidad_confirmada) {
        auditar(id, `Criticidad confirmada: ${nivel} (inicial: ${inc.criticidad_inicial})`, s.email);
      }
      if (cerrar) {
        db.prepare('UPDATE incidente SET estado = ? WHERE id_incidente = ?').run(estadoFinal, id);
        auditar(id, `Tratamiento registrado (F-RETT) y caso cerrado: ${estadoFinal}`, s.email);
        auditar(id, `Cambio de estado: En tratamiento → ${estadoFinal}`, s.email);
      } else {
        auditar(id, 'Borrador de tratamiento guardado', s.email);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    verIncidente(req, res, id, false);
  }

  function descargarAdjunto(req, res, id, url) {
    const s = sesion(req, 'admin');
    const adj = db.prepare('SELECT * FROM adjunto WHERE id_incidente = ?').get(id);
    if (!adj) throw new ErrorHttp(404, 'El incidente no tiene evidencia adjunta.');
    let datos;
    try {
      const blob = fs.readFileSync(path.join(db_.DATA_DIR, adj.ruta_archivo_cifrado));
      datos = cifrado.desempaquetar(cifrado.descifrar(blob, claveAdjuntos));
    } catch {
      auditar(id, 'Error de integridad al descifrar la evidencia', s.email);
      throw new ErrorHttp(500, 'La evidencia no pudo verificarse: el archivo pudo haber sido alterado.');
    }
    // Las imágenes y los PDF se pueden ver en el navegador; el resto siempre se descarga.
    const ver = url.searchParams.get('ver') === '1' && /^(image\/(png|jpeg)|application\/pdf)$/.test(datos.tipo);
    auditar(id, ver ? 'Evidencia descifrada y visualizada' : 'Evidencia descifrada y descargada', s.email);
    res.writeHead(200, { 'Content-Type': datos.tipo, 'Cache-Control': 'no-store',
      'Content-Disposition': `${ver ? 'inline' : 'attachment'}; filename="${encodeURIComponent(datos.nombre)}"` });
    res.end(datos.contenido);
  }

  // ---------- archivos estáticos ----------
  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
  function estatico(res, ruta) {
    if (ruta === '/') ruta = '/login.html';
    const archivo = path.normalize(path.join(PUBLIC_DIR, ruta));
    if (!archivo.startsWith(PUBLIC_DIR) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      return enviar(res, 404, { error: 'No encontrado' });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  }

  // ---------- enrutador ----------
  async function manejar(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://localhost');
    const ruta = url.pathname;
    try {
      if (!ruta.startsWith('/api/')) return estatico(res, ruta);
      // Las solicitudes que modifican datos solo se aceptan desde el propio sitio.
      if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        throw new ErrorHttp(403, 'Origen no permitido.');
      }
      const m = ruta.match(/^\/api\/incidentes\/(\d+)(\/[a-z]+)?$/);
      const id = m ? Number(m[1]) : null;
      if (req.method === 'POST' && ruta === '/api/login') return login(req, res, await leerCuerpo(req, 64 * 1024));
      if (req.method === 'POST' && ruta === '/api/logout') {
        const s = auth.leerSesion(cookie(req, 'sid'));
        if (s) auditar(null, 'Cierre de sesión', s.email);
        auth.cerrarSesion(cookie(req, 'sid'));
        return enviar(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (req.method === 'GET' && ruta === '/api/me') {
        const s = sesion(req);
        return enviar(res, 200, { id: s.id, nombre: s.nombre, email: s.email, area: s.area, rol: s.rol });
      }
      if (req.method === 'GET' && ruta === '/api/tipos') return enviar(res, 200, criticidad.TIPOS);
      if (req.method === 'POST' && ruta === '/api/incidentes') return crearIncidente(req, res, await leerCuerpo(req));
      if (req.method === 'GET' && ruta === '/api/mis-incidentes') return misIncidentes(req, res);
      if (req.method === 'GET' && ruta === '/api/incidentes') return listarIncidentes(req, res, url);
      if (req.method === 'GET' && ruta === '/api/resumen') return resumen(req, res);
      if (m && req.method === 'GET' && !m[2]) return verIncidente(req, res, id);
      if (m && req.method === 'PUT' && m[2] === '/tratamiento') return guardarTratamiento(req, res, id, await leerCuerpo(req, 64 * 1024));
      if (m && req.method === 'GET' && m[2] === '/adjunto') return descargarAdjunto(req, res, id, url);
      throw new ErrorHttp(404, 'Ruta inexistente.');
    } catch (e) {
      if (e instanceof ErrorHttp) return enviar(res, e.estado, { error: e.message });
      console.error(e);
      return enviar(res, 500, { error: 'Ocurrió un error inesperado en el servidor.' });
    }
  }

  return { servidor: http.createServer(manejar), db };
}

if (require.main === module) {
  const PUERTO = Number(process.env.PORT) || 3000;
  const { servidor, db } = crearApp();
  // Modo demostración: si la base está vacía, se cargan los usuarios y casos de ejemplo.
  if (process.env.DEMO === '1' && !db.prepare('SELECT COUNT(*) AS n FROM empleado').get().n) {
    require('./datos-demo').cargarDatosDemo(db);
    console.log('Base vacía: se cargaron los datos de demostración.');
  }
  servidor.listen(PUERTO, () => {
    console.log(`Sistema de incidentes MetdoSystems en http://localhost:${PUERTO}`);
  });
}

module.exports = { crearApp, ESTADOS_FINALES };

// Capa de datos: base SQLite embebida según el DER del proyecto (Figura 1).
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

const ESQUEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS empleado (
  id_empleado    INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  area           TEXT NOT NULL CHECK (area IN ('Ventas', 'Administración')),
  password_hash  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS administrador_ti (
  id_admin       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidente (
  id_incidente       INTEGER PRIMARY KEY AUTOINCREMENT,
  id_empleado        INTEGER NOT NULL REFERENCES empleado(id_empleado),
  tipo_percibido     TEXT NOT NULL,
  descripcion        TEXT NOT NULL,
  fecha_hora         TEXT NOT NULL,
  criticidad_inicial TEXT NOT NULL CHECK (criticidad_inicial IN ('Baja', 'Media', 'Alta', 'Crítica')),
  estado             TEXT NOT NULL DEFAULT 'Sin atender'
                     CHECK (estado IN ('Sin atender', 'En tratamiento', 'Resuelto', 'Escalado'))
);

CREATE TABLE IF NOT EXISTS adjunto (
  id_adjunto           INTEGER PRIMARY KEY AUTOINCREMENT,
  id_incidente         INTEGER NOT NULL REFERENCES incidente(id_incidente),
  ruta_archivo_cifrado TEXT NOT NULL,
  fecha_carga          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tratamiento (
  id_tratamiento          INTEGER PRIMARY KEY AUTOINCREMENT,
  id_incidente            INTEGER NOT NULL UNIQUE REFERENCES incidente(id_incidente),
  id_admin                INTEGER NOT NULL REFERENCES administrador_ti(id_admin),
  tipo_confirmado         TEXT,
  criticidad_confirmada   TEXT CHECK (criticidad_confirmada IN ('Baja', 'Media', 'Alta', 'Crítica')),
  acciones_contencion     TEXT,
  fecha_primera_atencion  TEXT NOT NULL,
  fecha_cierre            TEXT,
  estado_final            TEXT CHECK (estado_final IN ('En seguimiento', 'Resuelto', 'Escalado'))
);

CREATE TABLE IF NOT EXISTS log_auditoria (
  id_log        INTEGER PRIMARY KEY AUTOINCREMENT,
  id_incidente  INTEGER REFERENCES incidente(id_incidente),
  accion        TEXT NOT NULL,
  usuario       TEXT NOT NULL,
  fecha_hora    TEXT NOT NULL
);

-- El registro de auditoría es de solo agregado: no puede modificarse ni borrarse.
CREATE TRIGGER IF NOT EXISTS log_sin_modificacion BEFORE UPDATE ON log_auditoria
BEGIN SELECT RAISE(ABORT, 'El log de auditoría no puede modificarse'); END;
CREATE TRIGGER IF NOT EXISTS log_sin_borrado BEFORE DELETE ON log_auditoria
BEGIN SELECT RAISE(ABORT, 'El log de auditoría no puede borrarse'); END;

CREATE INDEX IF NOT EXISTS idx_incidente_estado ON incidente(estado);
CREATE INDEX IF NOT EXISTS idx_log_incidente ON log_auditoria(id_incidente);
`;

function abrir(archivo) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(archivo || path.join(DATA_DIR, 'incidentes.db'));
  db.exec(ESQUEMA);
  return db;
}

module.exports = { abrir, DATA_DIR };

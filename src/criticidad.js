// Reglas verificables de criticidad inicial (Relevamiento, Tabla de reglas).
// Se ejecutan en el servidor para que no puedan alterarse desde el navegador.
'use strict';

const TIPOS = {
  'Correo o mensaje sospechoso': 'Media',
  'Acceso no reconocido': 'Alta',
  'Comportamiento extraño del sistema': 'Alta',
  'Otro': 'Baja',
};

// Palabras clave asociadas a fuga de datos o fraude: elevan un correo sospechoso a Crítica.
const PALABRAS_FUGA = [
  'contraseña', 'clave', 'password', 'credencial', 'usuario y',
  'transferencia', 'pago', 'escribí mis datos',
  'tarjeta', 'cbu', 'cuenta bancaria', 'homebanking', 'dni',
  'datos de clientes', 'datos personales', 'base de datos', 'información confidencial',
  'filtr', 'fuga', 'envié mis datos', 'puse mis datos', 'ingresé mis datos',
];

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function calcular(tipo, descripcion) {
  if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo)) {
    throw new Error('Tipo de incidente no válido');
  }
  const base = TIPOS[tipo];
  if (tipo === 'Correo o mensaje sospechoso') {
    const texto = normalizar(descripcion);
    // La palabra clave tiene que empezar una palabra («pago» no coincide con «se apagó»).
    const hallada = PALABRAS_FUGA.find((p) => new RegExp(`(^|[^a-z0-9])${normalizar(p)}`).test(texto));
    if (hallada) {
      return { criticidad: 'Crítica', motivo: `palabra clave de fuga de datos o fraude detectada: «${hallada}»` };
    }
  }
  return { criticidad: base, motivo: 'regla por tipo de incidente' };
}

module.exports = { calcular, TIPOS: Object.keys(TIPOS) };

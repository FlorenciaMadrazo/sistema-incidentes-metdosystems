# Sistema Web de Notificación y Gestión de Incidentes — Prototipo

Trabajo Final de Grado · Prototipado Tecnológico · Licenciatura en Seguridad Informática · Universidad Siglo 21
Autora: Florencia Mariel Madrazo · Organización modelada: MetdoSystems Technologies

Este prototipo implementa el núcleo del sistema: el inicio de sesión con control de acceso por roles,
el reporte guiado de incidentes (F-NINT) con criticidad inicial automática y evidencia cifrada,
el dashboard del Administrador de TI y el registro del tratamiento (F-RETT), con un log de auditoría
de cada acción.

## 1. Requisitos

- **Node.js 22.13 o superior** (se recomienda la versión LTS 24). Se descarga de https://nodejs.org
- Un navegador actualizado (Chrome, Edge o Firefox).
- No hace falta instalar ninguna biblioteca adicional: el sistema usa solo módulos incluidos en Node.js
  (servidor HTTP, base de datos SQLite y criptografía).

## 2. Puesta en marcha (Windows, macOS o Linux)

1. Descomprimir la carpeta `prototipo-metdosystems`.
2. Abrir una terminal dentro de esa carpeta (en Windows: clic derecho en la carpeta → *Abrir en Terminal*).
3. Crear la base con los usuarios de prueba y tres casos de ejemplo:

   ```
   npm run inicializar
   ```

4. Iniciar el servidor:

   ```
   npm start
   ```

5. Abrir **http://localhost:3000** en el navegador.

Para detener el servidor, presionar `Ctrl + C` en la terminal.

## 3. Usuarios de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Empleado (Ventas) | juana.perez@metdosystems.com | Reporte-Seguro-2026 |
| Administrador de TI | marcos.diaz@metdosystems.com | Gestion-Incidentes-TI-2026 |

La pantalla de inicio de sesión tiene dos botones que completan estos datos automáticamente.
Otros empleados de ejemplo (misma contraseña): ivan.castro@, lucia.farfan@ y rodrigo.sosa@metdosystems.com.

## 4. Recorrido sugerido

1. Ingresar como **Juana Pérez**. Elegir *Correo o mensaje sospechoso*, escribir por ejemplo
   «Me pidieron la contraseña de mi cuenta por WhatsApp» y, si se quiere, adjuntar una captura.
   Al enviar, el sistema asigna la criticidad **Crítica**, porque la descripción contiene una
   palabra clave de fuga de datos.
2. Cerrar sesión e ingresar como **Marcos Díaz**. El dashboard muestra el nuevo caso como *Sin atender*.
3. Abrir el caso con *Ver →*. En ese momento queda registrada la **primera atención** y el estado
   pasa a *En tratamiento*. Se puede descifrar y descargar la evidencia.
4. Completar la F-RETT (tipo confirmado, criticidad confirmada y acciones de contención) y
   presionar *Guardar y cerrar incidente*. Se registra la **fecha de cierre** y se calculan el
   tiempo hasta la primera atención y el tiempo hasta la resolución.
5. Revisar el log de auditoría del caso, con cada acción, su fecha y el usuario responsable.

## 5. Pruebas automáticas

```
npm test
```

Ejecuta 10 pruebas que verifican: las reglas de criticidad, la política de contraseñas, el rechazo
sin sesión, el control de acceso por roles en el servidor, el flujo completo con cifrado y tiempos,
la detección de evidencia alterada, el rechazo de archivos disfrazados, la inmutabilidad del log de
auditoría, el bloqueo tras 5 intentos fallidos y la invalidación de la sesión al cerrarla.

## 6. Respaldo y restauración

```
npm run respaldo
npm run restaurar -- respaldos/respaldo-AAAA-MM-DD-HH-MM.bin
```

El respaldo copia la base sin detener el servicio, la empaqueta con los adjuntos, la cifra con
AES-256-GCM y guarda su resumen SHA-256. La restauración verifica ese resumen antes de recuperar los
datos y se niega a continuar si el archivo fue alterado. El servidor debe estar detenido para restaurar.

## 7. Qué está implementado y qué queda pendiente

**Implementado**

- Inicio de sesión con contraseñas resumidas con scrypt (sal individual, parámetros de OWASP).
- Política de contraseñas de 15 a 64 caracteres, con rechazo de contraseñas comunes (NIST SP 800-63B-4).
- Bloqueo de la cuenta durante 15 minutos tras 5 intentos fallidos, con registro de la IP.
- Sesión con token aleatorio firmado (HMAC-SHA256) en una cookie HttpOnly y SameSite=Strict,
  con vencimiento a los 30 minutos sin actividad e invalidación al cerrar sesión.
- Control de acceso por roles verificado en el servidor en cada solicitud.
- Reporte guiado (F-NINT) con criticidad inicial calculada en el servidor según las reglas verificables.
- Evidencia validada por tipo y contenido, de hasta 5 MB, y cifrada con AES-256-GCM antes de guardarse.
- Dashboard con resumen por criticidad, filtros por estado y tiempos promedio.
- Tratamiento (F-RETT) con registro automático de la primera atención y del cierre.
- Log de auditoría de solo agregado, protegido en la base contra modificaciones y borrados.
- Encabezados de seguridad (CSP, X-Frame-Options, nosniff) y control de origen en las solicitudes.
- Respaldo cifrado con verificación SHA-256 y restauración.

**Pendiente para la puesta en producción**

- HTTPS con certificado de Let's Encrypt. En el equipo local el sistema funciona por HTTP; la cookie
  se marca como Secure automáticamente cuando se publica detrás de HTTPS.
- Segundo factor (TOTP) para el Administrador de TI.
- Alta y baja de usuarios desde la aplicación, cambio obligatorio de la contraseña provisoria y
  bloqueo permanente ante intentos repetidos.
- Programación diaria del respaldo (cron), copia semanal fuera de línea y monitoreo externo de disponibilidad.
- Validación con usuarios del perfil corporativo.

## 8. Estructura

```
src/server.js        Servidor de aplicación y API (capa intermedia)
src/db.js            Esquema SQLite según el DER (capa de datos)
src/auth.js          Contraseñas, bloqueo y sesiones
src/cifrado.js       Cifrado AES-256-GCM de evidencias y respaldos
src/criticidad.js    Reglas verificables de criticidad inicial
public/              Pantallas web (capa de cliente)
scripts/             Inicialización, respaldo y restauración
tests/               Pruebas automáticas
data/                Base de datos, adjuntos cifrados y claves (se crea al inicializar)
```

Las claves de cifrado se generan en `data/claves/`. En producción se resguardan en un gestor de
contraseñas y nunca se guardan junto con los respaldos.

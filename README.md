# Sistema Web de Notificación y Gestión de Incidentes en Startups

Prototipo del Trabajo Final de Grado (Prototipado Tecnológico) de la Licenciatura en Seguridad Informática,
Universidad Siglo 21. Autora: **Florencia Mariel Madrazo**. Tutor: Ing. Alejandro Pastrán.

Permite que un empleado sin formación técnica reporte un incidente de seguridad en lenguaje simple y que
el Administrador de TI lo gestione desde un panel centralizado, siguiendo el ciclo de gestión de
ISO/IEC 27035 y NIST SP 800-61. La organización usada como caso es MetdoSystems Technologies (modelada).

## Probar la demostración en línea

**Enlace:** https://sistema-incidentes-metdosystems.onrender.com

| Rol | Email | Contraseña |
|---|---|---|
| Empleado | juana.perez@metdosystems.com | Reporte-Seguro-2026 |
| Administrador de TI | marcos.diaz@metdosystems.com | Gestion-Incidentes-TI-2026 |

La pantalla de inicio tiene botones que completan estos datos. Otros empleados de prueba, con la misma
contraseña: ivan.castro@, lucia.farfan@ y rodrigo.sosa@metdosystems.com.

> El servidor gratuito se suspende tras 15 minutos sin uso: la primera carga puede tardar alrededor de
> un minuto. Cada vez que se reinicia, la demostración vuelve a sus datos de ejemplo.

## Qué incluye

- Contraseñas resumidas con Argon2id e inicio de sesión con control de acceso por roles verificado en el servidor, bloqueo por intentos
  fallidos y sesiones que vencen por inactividad.
- Reporte guiado (F-NINT) con criticidad inicial automática según reglas verificables.
- Evidencia adjunta cifrada con AES-256-GCM.
- Dashboard de TI ordenado por urgencia, con filtros, resumen por criticidad y tiempos promedio hasta la primera atención y hasta la resolución.
- Registro del tratamiento (F-RETT) y log de auditoría que no puede modificarse ni borrarse.
- Respaldo cifrado con verificación SHA-256 y restauración.

## Ejecutar en una computadora

Requiere Node.js 24 LTS. No usa dependencias externas: el servidor, la base SQLite y la criptografía
(Argon2id, AES-256-GCM, HMAC-SHA256) son módulos incorporados en Node.js.

```
npm run inicializar
npm start
```

Luego abrir http://localhost:3000. El detalle completo está en [INSTRUCTIVO.md](INSTRUCTIVO.md),
incluido qué está implementado y qué queda pendiente para la puesta en producción.

Pruebas automáticas: `npm test`

# SmartContable Implementation Plan

## Objetivo

Proveer una hoja de ruta técnica clara para estabilizar y escalar SmartContable en un entorno SaaS multiempresa.

## Fase 1 — Estabilización y documentación

### Prioridades
- Documentar la API y los esquemas existentes.
- Consolidar la arquitectura actual.
- Asegurar controles de acceso multiempresa.
- Generar pruebas automatizadas básicas para los flujos críticos.

### Tareas
- Actualizar `docs/API_REFERENCE.md` con todas las rutas existentes, parámetros de entrada, ejemplos y códigos de error.
- Revisar `docs/README.md` para eliminar conflictos y consolidar la instalación.
- Validar las rutas protegidas con `Authorization: Bearer <token>`.
- Agregar pruebas unitarias para autenticación, empresas y facturas.

## Fase 2 — Seguridad y multiempresa

### Prioridades
- Aislar los datos por usuario y empresa.
- Revisar permisos por rol.
- Añadir manejo de errores consistente.

### Tareas
- Auditar todos los endpoints y garantizar que el usuario solo acceda a sus propias empresas/facturas/pólizas.
- Centralizar validadores de tenencia en `app/core/tenancy_validators.py`.
- Revisar `app/core/permissions.py` y fortalecer roles con pruebas.
- Documentar el comportamiento de errores 403, 404 y 409 en la API.

## Fase 3 — Calidad y experiencia de usuario

### Prioridades
- Mejorar la experiencia del frontend.
- Reducir errores de usuario en la creación y carga de datos.
- Añadir validaciones de cliente y mensajes claros.

### Tareas
- Cambiar alertas de JavaScript por notificaciones de UI estructuradas.
- Mostrar errores del servidor en formularios de creación de empresa y carga de facturas.
- Añadir handling de estados de carga en botones y formularios.
- Asegurar que el frontend respete la paginación y parámetros de consulta del backend.

## Fase 4 — Exportaciones y reportes

### Prioridades
- Estandarizar exportaciones CSV y ZIP.
- Garantizar compatibilidad con Google Sheets y Excel.
- Mejorar reportes financieros.

### Tareas
- Implementar documentación de `tipo` y filtros en exportaciones de empresa.
- Añadir nombres de archivo descriptivos y encodings UTF-8 con BOM.
- Verificar que los datos exportados sean consistentes con las consultas de la API.
- Generar reportes financieros claros para `reportes/financiero`, `kpis` y `global-kpis`.

## Fase 5 — Despliegue y operaciones

### Prioridades
- Preparar el proyecto para despliegue local y en producción.
- Añadir health checks y configuración de CORS.

### Tareas
- Crear `docker-compose` para backend, frontend y base de datos.
- Añadir un script de arranque consistente para `backend` y `frontend`.
- Documentar variables de entorno necesarias.
- Mantener la verificación del estado de la base de datos mediante `/health`.

## Entregables inmediatos
- Documentación de API actualizada en `docs/API_REFERENCE.md`.
- Plan de implementación técnica en `docs/IMPLEMENTATION_PLAN.md`.
- Tareas del roadmap identificadas y ordenadas por prioridad.

## Siguientes pasos inmediatos
1. Completar la documentación de los endpoints restantes y validar con pruebas manuales.
2. Agregar o restaurar los tests de backend para registrar el flujo de empresas y facturas.
3. Verificar que la API no permite acceso cruzado entre usuarios.
4. Revisar el frontend para mostrar correctamente empresas activas y la opción de exportar.

# Logística / TMS

Este módulo organiza la operación de viajes y su expediente bajo `/api/logistica`. Rastreo GPS permanece separado en `modules/rastreo`; Finanzas tiene su propio espacio y aquí solo aparece la preparación operativa de facturación.

## Base de datos

El contrato de datos es el esquema PostgreSQL `tms` del diseño compartido en el chat **Revisar archivos de DB y SQL**. La carpeta `database` conserva el SQL, el diccionario y el documento de diseño. El SQL es una instalación inicial de una sola ejecución; no lo ejecutes como actualización sobre tablas existentes. No se aplicó a ninguna base durante este trabajo.

El esquema usa UUID, folio de viaje generado por secuencia, estados operativos separados de facturación, y vistas para evidencias y preparación de facturación. RLS está habilitado sin políticas y el esquema revoca acceso a `PUBLIC`; la API requiere usuario, rol y permiso definidos en `tms.usuarios`, `usuario_roles` y `rol_permisos`. Las asignaciones rol-permiso siguen pendientes en el diseño, así que las operaciones protegidas responderán sin permiso hasta que exista una matriz aprobada.

## Endpoints básicos

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/logistica/health` | Estado del módulo |
| GET | `/api/logistica/dashboard` | Indicadores y viajes recientes |
| GET | `/api/logistica/trips` | Buscar y filtrar viajes |
| POST | `/api/logistica/trips` | Programar viaje y crear expediente inicial |
| GET | `/api/logistica/trips/:folio` | Consultar expediente |
| PATCH | `/api/logistica/trips/:folio/status` | Registrar avance operativo y evento |
| GET | `/api/logistica/trips/:folio/events` | Consultar bitácora |
| GET, POST | `/api/logistica/trips/:folio/evidence` | Consultar checklist y subir entregas |
| GET | `/api/logistica/customers`, `/units`, `/operators`, `/providers`, `/catalogs` | Consultar catálogos |

Para crear un viaje deben existir cliente, direcciones, servicio y plantilla de evidencias activos. El servicio crea snapshots de origen/destino, registros complementarios y evento inicial dentro de una transacción. El folio lo asigna PostgreSQL; no se recibe del cliente.

Los archivos de evidencia se guardan localmente en `backend/uploads/logistica`. La tabla `tms.archivos` registra su metadato. Para producción se debe definir almacenamiento privado y políticas de acceso a archivos.

## Configuración

Configura las variables PostgreSQL y `JWT_SECRET` en `backend/.env`. La API valida el JWT actual por correo y busca el perfil TMS activo y permisos en la base. El backend debe conectarse con una cuenta PostgreSQL administrada y no exponer credenciales privilegiadas al navegador.

El diseño aún deja pendientes las políticas RLS, la matriz de permisos, el alcance de cuentas externas y el almacenamiento de archivos. Este módulo no implementa GPS, CFDI ni la contabilidad del módulo Finanzas.

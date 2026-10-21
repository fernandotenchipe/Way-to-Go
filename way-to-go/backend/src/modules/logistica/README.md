# Logística / TMS

Este módulo organiza la operación de viajes y su expediente bajo `/api/logistica`. Rastreo GPS permanece separado en `modules/rastreo`; Finanzas tiene su propio espacio y aquí solo aparece la preparación operativa de facturación.

## Base de datos

El contrato de datos es el esquema PostgreSQL `tms` del diseño compartido en el chat **Revisar archivos de DB y SQL**. La carpeta `database` conserva el SQL, el diccionario y el documento de diseño. El SQL es una instalación inicial de una sola ejecución; no lo ejecutes como actualización sobre tablas existentes. No se aplicó a ninguna base durante este trabajo.

El esquema usa UUID, folio de viaje generado por secuencia, estados operativos separados de facturación, y vistas para evidencias y preparación de facturación. RLS está habilitado sin políticas y el esquema revoca acceso a `PUBLIC`; la API requiere usuario, rol y permiso definidos en `tms.usuarios`, `usuario_roles` y `rol_permisos`. Las asignaciones rol-permiso siguen pendientes en el diseño, así que las operaciones protegidas responderán sin permiso hasta que exista una matriz aprobada.

Para un esquema ya instalado, aplica manualmente y una sola vez `database/migrations/20261013_clientes_direccion_principal_rfc_unico.sql`. La migración agrega la dirección principal y unicidad de RFC sin distinguir mayúsculas; si detecta RFC duplicados, se detiene y muestra una consulta de diagnóstico. No vuelvas a ejecutar `schema.sql` como actualización.

Las mejoras del perfil de Clientes requieren aplicar manualmente y una sola vez `database/migrations/20261018_clientes_perfil_contactos_ubicaciones.sql`. Añade domicilio legal, perfil comercial, régimen fiscal receptor, contacto de facturación y clasificación de ubicaciones. No se ejecutó en Supabase durante este trabajo.

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
| POST | `/api/logistica/customers` | Crear cliente |
| PATCH | `/api/logistica/customers/:id` | Editar perfil comercial y datos fiscales del cliente |
| PATCH | `/api/logistica/customers/:id/active` | Desactivar o reactivar cliente |
| GET | `/api/logistica/customers/:id` | Consultar ficha, direcciones, contactos activos e inactivos y convenios |
| POST | `/api/logistica/customers/:id/contacts` | Agregar contacto |
| PATCH | `/api/logistica/contacts/:id` | Editar contacto sin reemplazar a otras personas |
| PATCH | `/api/logistica/contacts/:id/active` | Desactivar o reactivar contacto conservando su historial |
| POST | `/api/logistica/customers/:id/agreements` | Agregar convenio con ruta, tarifa y vigencia |
| PATCH | `/api/logistica/agreements/:id` | Editar convenio |
| PATCH | `/api/logistica/agreements/:id/active` | Desactivar o reactivar convenio |
| POST | `/api/logistica/customers/:id/addresses` | Agregar dirección |
| PATCH | `/api/logistica/addresses/:id` | Editar dirección |
| PATCH | `/api/logistica/addresses/:id/active` | Desactivar o reactivar dirección |

El RFC se valida con formato mexicano y no se puede repetir. Los correos de cada contacto se validan y normalizan a minúsculas. Los contactos y direcciones se desactivan sin borrar su historial. Cada cliente puede tener una dirección principal activa y un contacto principal activo. Los convenios reutilizan `tms.cliente_convenios` para representar rutas frecuentes y tarifas; las ubicaciones no tienen un rol permanente de origen o destino.

Para crear un viaje programado deben existir cliente, direcciones, servicio y plantilla de evidencias activos. El servicio crea snapshots de origen/destino, registros complementarios y evento inicial dentro de una transacción. El folio lo asigna PostgreSQL; no se recibe del cliente.

### Captura de clientes y viajes

El alta de cliente acepta `direcciones` (hasta 30 ubicaciones) y conserva compatibilidad con `direccion`. Todas se guardan en la transacción del cliente. Una sola ubicación activa puede ser principal; esto no le asigna un rol de origen o destino. El domicilio de facturación usa los campos existentes `domicilio_legal_*` y se mantiene separado de las ubicaciones operativas.

Crear viaje permite seleccionar un cliente activo y dos ubicaciones activas diferentes, o enviar `cliente_nuevo: { razon_social, direcciones: [origen, destino] }`. La captura rápida crea el cliente mínimo, las ubicaciones y el viaje en una sola transacción. Un nombre ya registrado se rechaza para que el usuario seleccione al cliente existente; no se fusionan clientes automáticamente. La facturación se completa posteriormente desde Clientes.

La pantalla guarda inicialmente `estado_operativo: BORRADOR`, sin exigir recursos asignados ni confirmar el checklist. Se exige servicio y tipo de carga, recolección, salida prevista y llegada estimada; la descarga programada es opcional. La salida y descarga previstas se guardan en `viaje_tiempos.salida_programada_at` y `descarga_programada_at`; los tiempos reales permanecen separados. Las horas capturadas se interpretan en la zona de cada ubicación. El rango de reserva abarca desde la recolección hasta la descarga prevista, o llegada cuando no hay descarga capturada. El flete omitido se conserva como cero provisional con una nota explícita en `condiciones_snapshot` y debe cotizarse antes de confirmar la operación. La asignación de recursos y confirmación posterior no forman parte de esta pantalla.

Si falla la consulta inicial del servicio, la pantalla identifica el modo demo y usa almacenamiento local separado. Un error durante el guardado conectado no cambia a modo demo ni presenta el viaje como guardado. Los folios `DEMO-*` solo se consultan en el navegador, nunca en la API. Los viajes registrados y las demostraciones se muestran por separado en el listado.

Estos cambios reutilizan el esquema existente y las dos migraciones previas de Clientes; no requieren una migración adicional ni ejecutan SQL en Supabase. Las pruebas `node --test src/modules/logistica/services/creation.test.js` usan dobles en memoria sin conexión PostgreSQL. Desde la raíz de la app, `node --test app/services/trip-dates.test.ts` verifica zonas horarias y cambios de horario con Node 24.

Los archivos de evidencia se guardan localmente en `backend/uploads/logistica`. La tabla `tms.archivos` registra su metadato. Para producción se debe definir almacenamiento privado y políticas de acceso a archivos.

## Configuración

Configura las variables PostgreSQL y `JWT_SECRET` en `backend/.env`. La API valida el JWT actual por correo y busca el perfil TMS activo y permisos en la base. El backend debe conectarse con una cuenta PostgreSQL administrada y no exponer credenciales privilegiadas al navegador.

El diseño aún deja pendientes las políticas RLS, la matriz de permisos, el alcance de cuentas externas y el almacenamiento de archivos. Este módulo no implementa GPS, CFDI ni la contabilidad del módulo Finanzas.

`database/demo_clientes.sql` contiene tres clientes ficticios y cuatro direcciones de prueba, con nombres marcados `DEMO`. El archivo es repetible y solo debe ejecutarse en el esquema TMS de desarrollo o prueba. No se pudo cargar desde esta sesión porque la conexión a PostgreSQL agotó el tiempo de espera.

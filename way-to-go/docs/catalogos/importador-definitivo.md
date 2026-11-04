# Importador local de catálogos oficiales

El contrato de identidad, vigencias y procedencia está en [`sat-catalogos-contexto.md`](../../backend/src/modules/logistica/docs/sat-catalogos-contexto.md). Este importador no pertenece a las rutas HTTP del TMS y no cambia Flota, Viajes, Carta Porte ni Facturación.

## Dependencias y modos

- Python 3.11 o posterior y `xlrd==2.0.2` para leer los tres XLS. Instalarlo en un entorno virtual propio: `python -m pip install -r tools/requirements-catalogos.txt`. No se necesitan `pandas`, `openpyxl` ni un cliente Python de PostgreSQL.
- Node.js y las dependencias existentes de `backend` (`pg` ya está declarado allí). Ejecutar desde la raíz del proyecto.
- `--mode dry-run` invoca solo el preparador Python. Recalcula SHA-256, verifica hojas y conteos del inventario, transforma todas las filas, comprueba identidades compuestas, fechas y campos obligatorios, y escribe un reporte JSON. No lee variables de base de datos ni crea un cliente `pg`.
- `--mode preflight` conecta PostgreSQL y solo ejecuta sentencias `SELECT`. Comprueba rol, identidad/permisos TMS, columnas/tipos/PK/UNIQUE, permisos y RLS, índices requeridos, funciones, compatibilidad JSONB, límites de tiempo y versiones registradas. También verifica lectura/escritura/espacio del directorio de archivo con un archivo temporal que elimina al terminar. Escribe un reporte JSON y devuelve código de salida distinto de cero ante incompatibilidades. No ejecuta DML, DDL, bloqueos de advisory ni migraciones.
- `--mode import` exige `NODE_ENV=development`, una familia por invocación, `--confirm-write`, identidad TMS fija en variables de entorno protegidas, directorio persistente para originales y la configuración PostgreSQL del backend en `backend/.env` (o `TMS_CATALOG_DATABASE_URL` explícita). `--actor-id` ya no existe. Una invocación importa un archivo en una sola transacción PostgreSQL. El lote predeterminado es de 500 filas (configurable entre 100 y 1,000).

```powershell
node backend/tools/importar-catalogos.mjs --mode dry-run --family ALL --report .\reportes\catalogos-dry-run.json
```

### Ejecutar el preflight desde PowerShell

El importador carga `backend/.env` mediante una ruta absoluta, aunque ejecutes el comando desde la raíz del repositorio. Por defecto reutiliza `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` mediante el pool compartido del backend; no requiere copiar la contraseña a otra variable. `TMS_CATALOG_DATABASE_URL` sigue disponible como opción explícita y, si está definida en el entorno, tiene prioridad. No imprimas esas variables ni las copies a reportes o comandos guardados. La identidad TMS sí debe estar configurada en el entorno privado como `TMS_CATALOG_ACTOR_ID`, `TMS_CATALOG_ACTOR_EMAIL` y `TMS_CATALOG_DB_ROLE`. El preflight valida permisos de `INSERT` para anticipar si el usuario de base podrá importar, pero durante esta comprobación no hace ningún INSERT.

Con el directorio de almacenamiento ya creado, ejecuta desde la raíz `way-to-go`:

```powershell
$env:NODE_ENV = 'development'
$required = @('TMS_CATALOG_ACTOR_ID', 'TMS_CATALOG_ACTOR_EMAIL', 'TMS_CATALOG_DB_ROLE')
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing) { throw "Faltan variables de entorno: $($missing -join ', ')" }
node backend/tools/importar-catalogos.mjs --mode preflight --family ALL --archive-dir 'D:\WTG\catalogos' --min-free-bytes 1073741824 --report '.\reportes\catalogos-preflight.json'
```

Sustituye `D:\WTG\catalogos` por la ruta absoluta del almacenamiento privado existente. `--min-free-bytes` establece el espacio libre mínimo; el valor del ejemplo es 1 GiB. El reporte enumera las versiones SAT y SEPOMEX ya registradas para evitar duplicarlas. Un estado `incompatible` o un código de salida distinto de cero significa que no se debe iniciar una importación hasta corregir y volver a revisar el punto reportado. El modo `preflight` se limita a inspeccionar la base, incluso si encuentra incompatibilidades. Solo si quieres usar una conexión diferente, define `TMS_CATALOG_DATABASE_URL` privadamente; no es necesaria cuando `backend/.env` ya contiene `DB_*`.

Para indicar los XLS fuera de las ubicaciones detectadas, agregar `--carta-porte <ruta>`, `--cfdi <ruta>` y `--sepomex <ruta>`. El inventario local en `docs/catalogos/diagnostico_excel_oficiales.json` y los tres SHA-256 fijados en el contrato deben concordar. Un XLS de otra edición necesita un inventario y contrato nuevos antes de importarse; el importador nunca adjudica por nombre una fecha o versión desconocida.

## Comprobaciones antes de cada carga real

1. Preparar y validar **todas** las filas del archivo elegido. Si hay rechazo, duplicado, fecha inválida, conteo diferente o SHA inesperado, no se abre la conexión PostgreSQL. El preparador calcula SHA-256 y tamaño del JSONL; el cargador los verifica antes de conectar y vuelve a calcular el SHA-256 sobre los bytes consumidos, antes de `COMMIT`. El reporte de la preparación se conserva en el reporte de error.
2. Para los dos XLS SAT, descargar aparte una copia desde la URL oficial del contrato y pasarla como `--official-copy <ruta>`. Se exige que sea un archivo distinto del XLS inventariado y que el SHA-256 de ambos coincida. El operador debe verificar la procedencia de esa copia; una ruta local por sí sola no acredita de dónde se descargó. SEPOMEX se trata como el snapshot histórico indicado en la hoja `Nota`; la página oficial puede ofrecer una edición posterior.
3. Preparar un directorio **privado, persistente y respaldado**, accesible desde el entorno que administrará los catálogos. Pasarlo con `--archive-dir <ruta-absoluta>`. El proceso comprueba lectura, escritura y espacio libre. No crea el directorio automáticamente. Los artefactos se archivan por SHA-256 y se registran en `tms.archivos` con bucket `logistica-catalogos`; la ruta física debe preservarse junto con la base de datos. El servicio HTTP actual no expone descargas de este bucket.
4. Configurar fuera del repositorio `TMS_CATALOG_ACTOR_ID`, `TMS_CATALOG_ACTOR_EMAIL` y `TMS_CATALOG_DB_ROLE`. La conexión se toma de `backend/.env` por defecto; `TMS_CATALOG_DATABASE_URL` es opcional para reemplazarla explícitamente. El actor fijo debe existir en `tms.usuarios`, estar activo, coincidir con el correo configurado y tener `carta_porte.catalogos.editar` por sus roles existentes. El rol de la conexión debe coincidir con `TMS_CATALOG_DB_ROLE` tanto en `current_user` como en `session_user`. El preflight comprueba columnas, tipos, claves primarias, unicidad necesaria, privilegios `SELECT` en tablas de identidad, `SELECT`/`INSERT` en destinos y RLS efectiva. Rechaza RLS activa en destinos: la operación requiere un rol de base autorizado cuyo acceso a esas tablas no quede bloqueado por RLS. Revisar manualmente el alcance de ese rol antes de configurarlo.
5. Asegurar que no haya otro proceso de importación con el mismo archivo. El cargador toma un bloqueo transaccional por familia y SHA-256, comprueba versión existente y solo entonces archiva e inserta. No se conceden permisos ni se modifican usuarios automáticamente.

Ejemplo de forma, **no ejecutar hasta aprobar las condiciones anteriores**:

```powershell
$env:NODE_ENV = 'development'
$env:TMS_CATALOG_DATABASE_URL = '<cadena de conexión PostgreSQL autorizada>'
$env:TMS_CATALOG_ACTOR_ID = '<uuid TMS fijo>'
$env:TMS_CATALOG_ACTOR_EMAIL = '<correo del mismo usuario TMS>'
$env:TMS_CATALOG_DB_ROLE = '<rol PostgreSQL de esa conexión>'
node backend/tools/importar-catalogos.mjs --mode import --family CARTA_PORTE --confirm-write --archive-dir '<directorio persistente absoluto>' --official-copy '<copia SAT recién descargada>' --report .\reportes\carta-porte-import.json
node backend/tools/importar-catalogos.mjs --mode import --family CFDI --confirm-write --archive-dir '<directorio persistente absoluto>' --official-copy '<copia SAT recién descargada>' --report .\reportes\cfdi-import.json
node backend/tools/importar-catalogos.mjs --mode import --family SEPOMEX --confirm-write --archive-dir '<directorio persistente absoluto>' --report .\reportes\sepomex-import.json
```

## Atomicidad y reintentos

La preparación crea JSONL temporal fuera de la base. El modo real copia los XLS y, para SEPOMEX, el manifiesto JSONL a almacenamiento privado. Dentro de `BEGIN` inserta referencias `tms.archivos`, una versión y sus filas en lotes. Cuenta las filas de PostgreSQL **antes de `COMMIT`**. Si falla un lote, hace `ROLLBACK` y elimina únicamente artefactos físicos creados por ese intento. Si se pierde la conexión durante `COMMIT`, deja los artefactos intactos: el resultado puede ser incierto y se debe conciliar por SHA-256 antes de reintentar.

Un reintento con SHA-256 ya presente comprueba el SHA-256 y tamaño del JSONL, el conteo total, **cada campo de cada fila** mediante lotes contra la tabla de destino, las referencias `tms.archivos` y los hashes físicos de los artefactos archivados. Si todo coincide, reporta `ya_importada` sin duplicar. Si el registro existe incompleto o con huellas distintas, se detiene para revisión manual. La comparación completa puede tardar varios minutos. No usa `ON CONFLICT DO UPDATE` ni borra versiones anteriores. Las tres familias se cargan en ejecuciones separadas; completar una no implica que las otras hayan sido cargadas.

`tms.archivos.subido_por` y `metadatos.importacion.actor_tms_id` registran la identidad TMS fija; `metadatos.importacion.rol_postgresql` y el reporte registran el rol real de la conexión. **El rol PostgreSQL no identifica a la persona** que inició el proceso. Quien pueda modificar las variables de entorno o usar la cadena PostgreSQL controla esta identidad técnica; proteger ambos y reservar la atribución humana para un mecanismo de autenticación individual futuro.

El manifiesto SEPOMEX es JSONL UTF-8 inmutable: una línea por cada una de las 159,378 filas, en orden de hoja/fila, con clave triple, hoja, fila física y SHA-256 de las 15 celdas originales tipadas. Su hash completo, número de líneas y referencia `tms.archivos` quedan en `sepomex_versiones.metadatos`. El XLS original también se archiva. Las referencias JSONB no son claves foráneas, por lo que se comprueban durante la carga y al reintentar.

El reporte JSON incluye leídos, esperados, transformados, rechazados, conteos por catálogo, SHA-256 y, si la carga terminó, ID de versión, filas importadas y referencias de archivo. Un reporte `fallida` no acredita importación: revisar la base por SHA-256 cuando el error ocurrió durante `COMMIT`.

## Validación local

```powershell
node --test --test-isolation=none tests/logistica/backend/catalogos-importacion.test.mjs
python -m unittest discover -s tests/logistica/backend -p test_catalogos_importacion.py -v
```

El dry run sobre los tres XLS y las pruebas automatizadas no comprueban los privilegios, RLS, rendimiento ni escritura real de la instancia Supabase. Esa comprobación queda para la primera importación controlada.

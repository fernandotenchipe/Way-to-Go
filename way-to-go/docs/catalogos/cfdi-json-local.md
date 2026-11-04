# CFDI 4.0 provisional desde JSONL local

El proveedor provisional lee los archivos JSONL privados ubicados por defecto bajo `backend/private-data/cfdi/4.0/<sha256-del-XLS>/`. Esta ruta no está bajo `public`, no se sirve como archivo estático y está excluida de Git. Cada catálogo tiene su propio archivo; el manifiesto registra versión, SHA-256 del XLS, conteo, bytes y SHA-256 por archivo. Al consultar un catálogo, el backend valida el hash del JSONL antes de responder. Se conservan en el archivo las claves, descripciones, vigencias y `reglas` originales del importador. La API entrega solo los campos necesarios para búsqueda y selección; la consulta puntual devuelve el registro completo.

## Generar los archivos privados

Desde la raíz `way-to-go`, con Python y `xlrd==2.0.2` ya disponibles:

```powershell
python tools/preparar_cfdi_local.py --excel 'C:\Users\ferte\Downloads\catCFDI_V_4_20261029.xls' --output-root '.\backend\private-data\cfdi' --report '.\reportes\cfdi-json-local.json'
```

El comando vuelve a comprobar el SHA-256 fijado en el inventario, lee las hojas y reglas existentes, valida que haya exactamente 362,381 transformados y cero rechazados, compara los conteos de cada catálogo, verifica los hashes/conteos de salida y publica el directorio solo cuando todo pasó. No sobrescribe una salida existente con el mismo hash. No crea una conexión PostgreSQL ni ejecuta SQL. El reporte no incluye filas fiscales ni credenciales.

## Proveedor y API

`CFDI_CATALOG_PROVIDER=local` selecciona el JSON local y es el valor predeterminado. `CFDI_CATALOG_DATA_DIR` puede apuntar al directorio de la versión, es decir, a la carpeta que contiene `manifest.json`; si no se define, se usa la carpeta del SHA validado. Los datos cargan a demanda para el catálogo solicitado, se procesan como flujo de líneas y se descartan al terminar cada solicitud: no se cargan 362,381 filas en memoria ni se envían al navegador.

Todas las rutas requieren una sesión TMS y el permiso `carta_porte.catalogos.ver`.

- `GET /api/logistica/cfdi/catalogs`: nombres y cantidades por catálogo.
- `GET /api/logistica/cfdi/catalogs/:catalog?q=<texto>&page=1&limit=25&vigente=true&fecha=YYYY-MM-DD`: busca clave o descripción, filtra por vigencia y pagina. El límite máximo es 100 y la fecha predeterminada es la fecha actual del backend.
- `GET /api/logistica/cfdi/catalogs/:catalog/keys/:key?contexto=<json>`: consulta una clave concreta. Para claves repetidas se requiere `contexto`; sin contexto responde conflicto en lugar de elegir una variante arbitraria.

La forma de respuesta es `{ success, data }`. El contrato TypeScript que usa el frontend permanece igual si cambia el proveedor.

## Formularios conectados

Alta de cliente y edición de cliente usan estos selectores de claves oficiales: régimen fiscal (`c_RegimenFiscal`), uso CFDI (`c_UsoCFDI`), forma de pago (`c_FormaPago`) y método de pago (`c_MetodoPago`). El formulario guarda la clave, no la etiqueta visible. El formulario de borrador de Carta Porte en Viajes consulta `c_TipoDeComprobante`, y conserva solo las claves `I` (Ingreso) y `T` (Traslado) que permite el flujo actual. Los selectores consultan el mismo endpoint con paginación y búsqueda; no hay tablas distintas para JSON y PostgreSQL.

La pantalla de Facturación operativa actual es una vista de preparación de expedientes. No contiene un formulario de emisión/CFDI que consuma catálogos; no se agregó emisión, timbrado ni un flujo nuevo.

## Cambio futuro a PostgreSQL

Después de almacenar CFDI en `tms.cp_sat_versiones`/`tms.cp_sat_claves`, configurar `CFDI_CATALOG_PROVIDER=postgres`. `createCfdiCatalogProvider` selecciona el proveedor con el mismo contrato HTTP y no requiere cambios en los formularios. El proveedor PostgreSQL toma la versión CFDI 4.0 vigente y usa consultas parametrizadas. La elección debe hacerse solo después de verificar que la importación CFDI exista y esté íntegra en la instancia destino.

No ejecutar una carga Supabase para preparar o servir estos archivos. SEPOMEX y Carta Porte siguen con sus rutas y almacenamiento actuales.

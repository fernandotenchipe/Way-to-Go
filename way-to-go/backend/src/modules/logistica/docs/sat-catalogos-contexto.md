# Contrato de identidad, versiones y procedencia de catálogos SAT y SEPOMEX

Esta nota acompaña la migración `20261103_sat_cfdi_sepomex_catalogos.sql`. Define el contrato del importador aislado en `tools/catalogos_importacion.py` y `backend/tools/importar-catalogos.mjs`; esta nota no importa archivos. Cada fila SAT queda bajo el `version_id` de su archivo (`CARTA_PORTE` o `CFDI`). SEPOMEX conserva su propia versión y tabla. No se mezclan registros de archivos, familias o versiones aunque coincidan las claves visibles.

## Versión del archivo frente a vigencia fiscal

`cp_sat_versiones` representa un **snapshot del XLS completo**, no una revisión uniforme de todas sus hojas ni el inicio de vigencia fiscal de todas sus claves. Su `vigente_desde` es la fecha documentada de disponibilidad/publicación del contenido de ese snapshot. La fecha de entrada en vigor de CFDI 4.0 o Carta Porte 3.1 es otro dato y no se usa para fechar retrospectivamente una actualización posterior del XLS. `vigente_hasta` permanece `NULL` mientras no se determine con evidencia el fin de uso de ese snapshot. No se inventa una fecha de cierre.

| Archivo local verificado | Campos de versión | Fecha del snapshot / fuente | SHA-256 esperado (hexadecimal minúsculo) |
| --- | --- | --- | --- |
| `CatalogosCartaPorte31.xls` | `familia=CARTA_PORTE`, `version_complemento=3.1`, `version_cfdi=4.0` | `vigente_desde=2024-12-13`; última publicación de catálogo dentro del libro, concordante con `Last-Modified` del enlace SAT | `2ea8101bc84df18773f47dd8d5aa1309c81854e51e1e5b55387e0f1aeed18afe` |
| `catCFDI_V_4_20261029.xls` | `familia=CFDI`, `version_complemento=NULL`, `version_cfdi=4.0` | `vigente_desde=2026-10-29`; última publicación de catálogo dentro del libro, concordante con `Last-Modified` del enlace SAT | `ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b` |
| `CPdescarga.xls` | Una fila en `sepomex_versiones` | `fecha_fuente=2026-10-19` según la hoja `Nota`; `publicado_at=NULL` porque el archivo no aporta hora verificable | `5d5e29332b6f699d0ef5a4bf1c06ca12089605cd58012b5950d995b0f0a1fd1a` |

Para SAT, `revision` se define como `archivo-sha256:` seguido del SHA-256 completo del XLS. Es un **identificador técnico del snapshot**, no una revisión oficial del SAT. Cada revisión, versión y fecha que la hoja declara se guarda con su nombre de hoja y valor original en `cp_sat_versiones.metadatos.catalogos`; también se conserva la fecha del snapshot, su criterio y los nombres de archivo. Esta convención evita hacer pasar las distintas revisiones de las hojas por una única revisión oficial y permite distinguir futuras publicaciones que conserven esos mismos números de revisión. `sepomex_versiones.metadatos` guarda la nota original y el nombre del XLS; no toma la fecha visible hoy en la página de descarga para sustituir la fecha del archivo ya descargado.

`cp_sat_claves.vigente_desde` y `vigente_hasta` se obtienen **solo de las columnas de vigencia del registro**. Si una hoja no trae esas fechas por fila, quedan `NULL`; las fechas generales de la hoja siguen en `cp_sat_versiones.metadatos.catalogos`. Una fecha Excel válida se convierte a `YYYY-MM-DD` según el modo de fechas del libro. El valor y tipo Excel originales permanecen en `reglas`. Una celda vacía o el texto `Por definir` produce `NULL` en el campo fecha y conserva el original en `reglas`. La fecha del snapshot nunca se copia a cada clave como si fuera su vigencia fiscal.

### URLs y prueba de procedencia

`fuente_url` almacena la página o descarga oficial correspondiente, no una ruta local:

| Fuente | `fuente_url` | En `metadatos` |
| --- | --- | --- |
| Carta Porte | `http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/CatalogosCartaPorte31.xls` | Página de consulta `http://omawww.sat.gob.mx/tramitesyservicios/Paginas/complemento_carta_porte.htm`, nombre del archivo y metadatos por hoja. |
| CFDI | `http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI_V_4_20261029.xls` | Página de consulta `http://omawww.sat.gob.mx/tramitesyservicios/Paginas/anexo_20.htm`, nombre del archivo y metadatos por hoja. |
| SEPOMEX | `https://www.correosdemexico.gob.mx/SSLServicios/ConsultaCP/CodigoPostal_Exportar.aspx` | `tipo_fuente_url=pagina_de_descarga`; la descarga se genera desde el formulario y no se presupone una URL permanente del XLS. |

Los dos enlaces directos del SAT figuraban en sus páginas oficiales y respondieron HTTP 200 con el tamaño de los XLS locales durante la revisión. **La coincidencia de nombre, tamaño o `Last-Modified` no demuestra igualdad de bytes**. Antes de cualquier carga, calcular SHA-256 de los tres archivos originales sin modificarlos y comparar con la tabla anterior y con el diagnóstico/dry run. En PowerShell, por ejemplo: `(Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\ferte\Downloads\CatalogosCartaPorte31.xls').Hash.ToLowerInvariant()`. Verificar también el SHA-256 de cualquier copia archivada. Para los SAT, descargar una copia temporal desde cada enlace oficial y comparar su SHA-256 con el XLS que se pretende cargar. Si difiere, conservar ambas copias, detener la carga y repetir inventario y dry run para el archivo nuevo.

La página de SEPOMEX es dinámica y puede ofrecer una edición posterior a la fecha de la hoja `Nota`. Una descarga nueva con SHA distinto **no invalida ni convierte en vigente** al XLS histórico del 19/10/2026: conservarlo como snapshot histórico con su hash y procedencia declarada, o analizar la edición nueva por separado. No afirmar igualdad de bytes con una descarga actual si no se comprobó. Un hash `(familia, sha256)` SAT o `sha256` SEPOMEX ya registrado significa versión ya importada: no duplicar ni sobrescribir sus filas. El hash prueba integridad de la copia; la procedencia oficial se comprueba por separado con la URL y el archivo descargado desde ella.

## Regla común

- `catalogo`: identificador exacto de la hoja lógica, con una convención de mayúsculas fija por importador. Las hojas partidas en varias pestañas físicas conservan el mismo `catalogo` lógico.
- `clave`: clave oficial principal como texto. Los ceros a la izquierda se conservan. No usar la descripción como clave.
- `clave_contexto`: objeto JSON (`jsonb`) con **solo los discriminantes de identidad** indicados abajo. Para claves simples, `{}`. Los nombres de propiedades son fijos. Los valores se guardan como texto después de quitar espacios exteriores; los códigos conservan sus ceros a la izquierda. Una celda vacía se representa con JSON `null`, no se omite la propiedad. El valor original se conserva en `reglas`. `jsonb` considera equivalentes objetos con propiedades en distinto orden.
- `descripcion`: texto de presentación. Todos los demás atributos originales, el nombre de pestaña y la fila de origen se conservan en `reglas`. Las fechas de vigencia originales van además a `vigente_desde` y `vigente_hasta`, sin reemplazar el dato fuente en `reglas`.
- Antes de insertar, agrupar por `(version_id, catalogo, clave, clave_contexto)`. Si hay dos filas fuente diferentes con esa identidad, detener la importación y revisar el catálogo. No usar `ON CONFLICT DO UPDATE` para ocultar diferencias ni inventar un sufijo de forma automática.

## Mapeo de los catálogos con identidad compuesta detectada

| Catálogo lógico | `clave` | `clave_contexto` | Motivo |
| --- | --- | --- | --- |
| `c_Colonia` (Carta Porte y CFDI) | `c_Colonia` | `{"c_CodigoPostal":"<c_CodigoPostal>"}` | La colonia se identifica dentro del código postal. Las pestañas físicas se consolidan. |
| `c_Municipio` / `C_Municipio` | `c_Municipio` | `{"c_Estado":"<c_Estado>"}` | La clave municipal es local al estado. |
| `c_Localidad` / `C_Localidad` | `c_Localidad` | `{"c_Estado":"<c_Estado>"}` | La clave de localidad es local al estado. |
| `c_Estado` (CFDI) | `c_Estado` | `{"c_Pais":"<c_Pais>"}` | La clave estatal es local al país. |
| `c_NumPedimentoAduana` (CFDI) | `Aduana` | `{"Patente":"<Patente>","Ejercicio":"<Ejercicio>"}` | El registro se distingue por los tres componentes. |
| `c_TasaOCuota` (CFDI) | `TASA_O_CUOTA` | Las nueve propiedades exactas y su conversión se fijan en la sección siguiente. | Esta hoja no tiene una clave simple única; la combinación y su intervalo identifican la fila. |
| `c_MaterialPeligroso` (Carta Porte) | código `c_MaterialPeligroso` | `{}` si el código aparece una sola vez; `{"fila_origen":"<número de fila física>"}` para **todas** las filas de un código repetido. | En el archivo analizado hay códigos repetidos con atributos distintos. El número de fila permite preservar cada variante del archivo sin adivinar una identidad SAT que la hoja no declara. |

Para los demás catálogos, usar `{}` **solo después** de comprobar que `clave` es única en todo el archivo lógico de esa versión. `c_CodigoPostal` del CFDI se identificó por su código de cinco dígitos, sin contexto adicional. Si una edición oficial futura introduce duplicados en otro catálogo, detener la carga, documentar su clave real y actualizar este contrato antes de importarla. La identidad de SEPOMEX se administra aparte mediante `(version_id, clave_estado, clave_municipio, id_asentamiento_cpcons)`.

### Contexto exacto de `c_TasaOCuota`

El XLS tiene un encabezado de dos niveles: `c_TasaOCuota` agrupa `Valor mínimo` y `Valor máximo`. La `clave` constante es `TASA_O_CUOTA`. `clave_contexto` tiene **exactamente** estas propiedades, con espacios, acentos y mayúsculas tal como aparecen aquí; no se agregan número de fila ni descripción:

| Columna Excel (1 a 9) | Propiedad JSON |
| ---: | --- |
| 1 | `Rango o fijo` |
| 2 | `Valor mínimo` |
| 3 | `Valor máximo` |
| 4 | `Impuesto` |
| 5 | `Factor` |
| 6 | `Traslado` |
| 7 | `Retención` |
| 8 | `Fecha inicio de vigencia` |
| 9 | `Fecha fin de vigencia` |

Cada propiedad está presente incluso si su celda está vacía: en ese caso vale JSON `null`. Las celdas de texto pierden **solo** espacios exteriores; se preservan acentos, espacios interiores y mayúsculas. Una celda numérica se representa como texto mediante la forma decimal del valor numérico leído del XLS, incluida `.0` cuando corresponde: por ejemplo `0.0` → `"0.0"` y una fecha Excel serial `44562.0` → `"44562.0"`. No convertir la fecha del contexto a ISO ni sustituir el serial por una fecha de publicación. Paralelamente, las columnas 8 y 9 se interpretan como fechas para `vigente_desde/hasta` (`44562.0` → `2022-01-01`), y las nueve celdas originales con su tipo se guardan en `reglas`. Comparar la identidad como JSONB, no como texto JSON serializado; si dos filas resultan en la misma identidad, detener la carga.

Ejemplo de la primera fila de datos del XLS analizado:

```json
{
  "Rango o fijo": "Fijo",
  "Valor mínimo": null,
  "Valor máximo": "0.0",
  "Impuesto": "IVA",
  "Factor": "Tasa",
  "Traslado": "Sí",
  "Retención": "No",
  "Fecha inicio de vigencia": "44562.0",
  "Fecha fin de vigencia": null
}
```

### Manifiesto de trazabilidad SEPOMEX

`sepomex_asentamientos` almacena las 15 columnas de datos del XLS, pero no contiene hoja ni fila física. Para evitar una tabla nueva o un JSONB enorme de 159,378 entradas, conservar **dos artefactos inmutables por versión**: el XLS original y un manifiesto UTF-8 JSON Lines (`.jsonl`), sin cabecera, con una línea por asentamiento. Ordenar las líneas por el orden de las 32 hojas de datos del XLS y luego por fila física ascendente. Excluir la hoja `Nota`; guardar su texto en `sepomex_versiones.metadatos`. El manifiesto contiene exactamente 159,378 líneas para esta versión.

Cada línea contiene:

```json
{"clave_estado":"01","clave_municipio":"001","id_asentamiento_cpcons":"0001","hoja_origen":"Aguascalientes","fila_excel":2,"sha256_fila":"<64 caracteres hexadecimales minúsculos>"}
```

Las tres claves son texto con ceros iniciales y constituyen la identidad dentro del archivo; `fila_excel` empieza en 1 e incluye el encabezado de la hoja. `sha256_fila` se calcula sobre las 15 celdas originales, en orden de columna, como arreglo JSON de objetos `{"tipo_excel":<código entero xlrd>,"valor":<valor original o null>}`. Serializar en UTF-8 con claves de objeto ordenadas, sin espacios superfluos, Unicode sin escapes ASCII y sin `NaN`; aplicar SHA-256 a esos bytes. El XLS archivado conserva las celdas originales, y el manifiesto permite llegar a cada hoja/fila sin inflar `sepomex_versiones.metadatos`.

Calcular también el SHA-256 de los **bytes completos** del manifiesto. En `sepomex_versiones.metadatos` registrar `manifiesto_formato="jsonl-v1"`, `manifiesto_sha256`, `manifiesto_filas`, la referencia del XLS y la referencia del manifiesto. Preferir el almacenamiento ya representado por `tms.archivos` para ambas referencias; su `subido_por` exige un usuario TMS válido. Estas referencias dentro de JSONB no son claves foráneas: el proceso de carga y la auditoría deberán comprobar que los dos archivos existen y coinciden con sus hashes. No guardar un `file://` ni una ruta temporal de `Downloads`. Comprobar que las 159,378 llaves triples sean únicas, que cada referencia de hoja/fila exista en el XLS archivado y que ambos hashes coincidan antes y después de archivar. Si el manifiesto falta o su hash cambia, detener la carga o la auditoría; el XLS original permite regenerarlo de forma determinista.

## Compatibilidad estática con el SQL aplicado

- `cp_sat_versiones` admite las dos familias, el `version_complemento` nulo solo para CFDI, `revision` de texto, `fuente_url`, SHA-256, fecha del snapshot y `metadatos` JSONB. La revisión basada en hash satisface los índices de unicidad por familia/revisión y el `UNIQUE(familia,sha256)`; antes de insertar se deben comprobar las versiones existentes.
- `cp_sat_claves` admite `clave_contexto` JSONB objeto, `reglas` JSONB objeto, fechas nulas y la PK `(version_id,catalogo,clave,clave_contexto)`. El dry run local obtuvo cero colisiones de esa identidad.
- `sepomex_versiones` admite `fuente_url`, SHA-256, `fecha_fuente`, `publicado_at` nulo y las referencias del manifiesto en `metadatos` JSONB. `sepomex_asentamientos` conserva las 15 columnas y la PK triple con `version_id`; el dry run obtuvo cero colisiones.
- `tms.archivos` ya tiene `bucket`, `storage_path`, SHA-256 y `subido_por`. Su uso para archivar estos artefactos requiere verificar después permisos, capacidad y disponibilidad del almacenamiento; esta revisión documental no establece que los archivos estén cargados ni que Supabase haya sido consultado.

No se requiere una migración adicional **si** se acepta que la procedencia física por fila SEPOMEX esté en el manifiesto inmutable. Si se exige consultar `hoja_origen` y `fila_excel` directamente en `sepomex_asentamientos` mediante SQL, harán falta columnas nuevas y aprobación previa del cambio de esquema.

## Compatibilidad y límite actual

Flota consulta `c_SubTipoRem` por `clave` y no usa `clave_contexto`; ese catálogo mantiene claves simples. La consulta genérica de Carta Porte sigue devolviendo `catalogo`, `clave`, `descripcion` y `reglas`, por lo que su forma no cambia. Una interfaz que seleccione colonias, municipios, localidades, tasas o pedimentos deberá enviar y filtrar también el contexto de la clave para evitar ambigüedad; esa adaptación pertenece a una etapa futura de backend/frontend, no a esta migración.

Los índices GIN de trigramas usan `pg_trgm`. [Supabase lo incluye entre sus extensiones](https://supabase.com/docs/guides/database/extensions) y normalmente instala extensiones en el esquema `extensions`. La migración detecta el esquema real de `pg_trgm` para sus operator classes y no mueve una instalación ya existente. La revisión previa debe confirmar que la extensión está disponible en **este proyecto**; si aún no está instalada, también debe existir el esquema `extensions`.

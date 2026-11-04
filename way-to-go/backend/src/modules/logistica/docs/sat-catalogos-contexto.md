# Contrato de claves compuestas para catálogos SAT

Esta nota acompaña la migración `20261103_sat_cfdi_sepomex_catalogos.sql`. Define la identidad que deberá usar **un importador futuro**; no importa archivos ni modifica el backend. Cada fila queda bajo el `version_id` del archivo oficial correspondiente (`CARTA_PORTE` o `CFDI`). No se mezclan registros de ambos archivos aunque coincidan las claves visibles.

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
| `c_TasaOCuota` (CFDI) | `TASA_O_CUOTA` | Objeto con `Rango o fijo`, `Valor mínimo`, `Valor máximo`, `Impuesto`, `Factor`, `Traslado`, `Retención`, fecha inicial y fecha final de vigencia, usando los valores originales como texto. | Esta hoja no tiene una clave simple única; la combinación y su intervalo identifican la fila. |
| `c_MaterialPeligroso` (Carta Porte) | código `c_MaterialPeligroso` | `{}` si el código aparece una sola vez; `{"fila_origen":"<número de fila física>"}` para **todas** las filas de un código repetido. | En el archivo analizado hay códigos repetidos con atributos distintos. El número de fila permite preservar cada variante del archivo sin adivinar una identidad SAT que la hoja no declara. |

Para los demás catálogos, usar `{}` **solo después** de comprobar que `clave` es única en todo el archivo lógico de esa versión. `c_CodigoPostal` del CFDI se identificó por su código de cinco dígitos, sin contexto adicional. Si una edición oficial futura introduce duplicados en otro catálogo, detener la carga, documentar su clave real y actualizar este contrato antes de importarla. La identidad de SEPOMEX se administra aparte mediante `(version_id, clave_estado, clave_municipio, id_asentamiento_cpcons)`.

## Compatibilidad y límite actual

Flota consulta `c_SubTipoRem` por `clave` y no usa `clave_contexto`; ese catálogo mantiene claves simples. La consulta genérica de Carta Porte sigue devolviendo `catalogo`, `clave`, `descripcion` y `reglas`, por lo que su forma no cambia. Una interfaz que seleccione colonias, municipios, localidades, tasas o pedimentos deberá enviar y filtrar también el contexto de la clave para evitar ambigüedad; esa adaptación pertenece a una etapa futura de backend/frontend, no a esta migración.

Los índices GIN de trigramas usan `pg_trgm`. [Supabase lo incluye entre sus extensiones](https://supabase.com/docs/guides/database/extensions) y normalmente instala extensiones en el esquema `extensions`. La migración detecta el esquema real de `pg_trgm` para sus operator classes y no mueve una instalación ya existente. La revisión previa debe confirmar que la extensión está disponible en **este proyecto**; si aún no está instalada, también debe existir el esquema `extensions`.

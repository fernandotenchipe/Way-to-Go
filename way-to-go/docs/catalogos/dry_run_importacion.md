# Simulación local de importación de catálogos

Dry run: se leyeron y transformaron valores en memoria. No se ejecutó SQL, no se abrió una conexión y no se escribieron filas transformadas. La identidad SAT se evalúa por archivo/familia, catálogo, clave y contexto; SEPOMEX por archivo y su llave triple.

| Familia | Leídos | Transformados | Rechazados | Esperados | Duplicados finales |
| --- | ---: | ---: | ---: | ---: | ---: |
| CARTA_PORTE | 206,280 | 206,280 | 0 | 206,280 | 0 |
| CFDI | 362,381 | 362,381 | 0 | 362,381 | 0 |
| SEPOMEX | 159,378 | 159,378 | 0 | 159,378 | 0 |
| **Total** | **728,039** | **728,039** | **0** | **728,039** | **0** |

## CARTA_PORTE: conteo por catálogo

| Catálogo lógico | Leídos | Transformados | Rechazados | Esperados | Identidades repetidas |
| --- | ---: | ---: | ---: | ---: | ---: |
| `c_RegimenAduanero` | 10 | 10 | 0 | 10 | 0 |
| `c_CveTransporte` | 4 | 4 | 0 | 4 | 0 |
| `c_TipoEstacion` | 3 | 3 | 0 | 3 | 0 |
| `c_Estaciones` | 5,280 | 5,280 | 0 | 5,280 | 0 |
| `c_ClaveUnidadPeso` | 472 | 472 | 0 | 472 | 0 |
| `c_ClaveProdServCP` | 48,757 | 48,757 | 0 | 48,757 | 0 |
| `c_MaterialPeligroso` | 2,346 | 2,346 | 0 | 2,346 | 0 |
| `c_TipoEmbalaje` | 59 | 59 | 0 | 59 | 0 |
| `c_TipoPermiso` | 26 | 26 | 0 | 26 | 0 |
| `c_Colonia` | 145,366 | 145,366 | 0 | 145,366 | 0 |
| `c_Localidad` | 664 | 664 | 0 | 664 | 0 |
| `c_Municipio` | 2,463 | 2,463 | 0 | 2,463 | 0 |
| `c_SectorCOFEPRIS` | 5 | 5 | 0 | 5 | 0 |
| `c_FormaFarmaceutica` | 20 | 20 | 0 | 20 | 0 |
| `c_CondicionesEspeciales` | 4 | 4 | 0 | 4 | 0 |
| `c_TipoMateria` | 5 | 5 | 0 | 5 | 0 |
| `c_DocumentoAduanero` | 20 | 20 | 0 | 20 | 0 |
| `c_ParteTransporte` | 12 | 12 | 0 | 12 | 0 |
| `c_FiguraTransporte` | 5 | 5 | 0 | 5 | 0 |
| `c_ConfigAutotransporte` | 34 | 34 | 0 | 34 | 0 |
| `c_SubTipoRem` | 31 | 31 | 0 | 31 | 0 |
| `c_RegistroISTMO` | 6 | 6 | 0 | 6 | 0 |
| `c_ConfigMaritima` | 15 | 15 | 0 | 15 | 0 |
| `c_ClaveTipoCarga` | 6 | 6 | 0 | 6 | 0 |
| `c_ContenedorMaritimo` | 12 | 12 | 0 | 12 | 0 |
| `c_NumAutorizacionNaviero` | 339 | 339 | 0 | 339 | 0 |
| `c_CodigoTransporteAereo` | 173 | 173 | 0 | 173 | 0 |
| `c_TipoDeServicio` | 4 | 4 | 0 | 4 | 0 |
| `c_DerechosDePaso` | 119 | 119 | 0 | 119 | 0 |
| `c_TipoCarro` | 11 | 11 | 0 | 11 | 0 |
| `c_Contenedor` | 5 | 5 | 0 | 5 | 0 |
| `c_TipoDeTrafico` | 4 | 4 | 0 | 4 | 0 |

SHA-256 del archivo: `2ea8101bc84df18773f47dd8d5aa1309c81854e51e1e5b55387e0f1aeed18afe`. El JSON adjunto incluye los encabezados interpretados, huellas de los registros transformados y ejemplos de cualquier rechazo.

## CFDI: conteo por catálogo

| Catálogo lógico | Leídos | Transformados | Rechazados | Esperados | Identidades repetidas |
| --- | ---: | ---: | ---: | ---: | ---: |
| `c_FormaPago` | 22 | 22 | 0 | 22 | 0 |
| `c_Moneda` | 183 | 183 | 0 | 183 | 0 |
| `c_TipoDeComprobante` | 5 | 5 | 0 | 5 | 0 |
| `c_Exportacion` | 4 | 4 | 0 | 4 | 0 |
| `c_MetodoPago` | 2 | 2 | 0 | 2 | 0 |
| `c_CodigoPostal` | 95,748 | 95,748 | 0 | 95,748 | 0 |
| `c_Periodicidad` | 5 | 5 | 0 | 5 | 0 |
| `c_Meses` | 18 | 18 | 0 | 18 | 0 |
| `c_TipoRelacion` | 7 | 7 | 0 | 7 | 0 |
| `c_RegimenFiscal` | 19 | 19 | 0 | 19 | 0 |
| `c_Pais` | 250 | 250 | 0 | 250 | 0 |
| `c_UsoCFDI` | 24 | 24 | 0 | 24 | 0 |
| `c_ClaveProdServ` | 52,513 | 52,513 | 0 | 52,513 | 0 |
| `c_ClaveUnidad` | 2,418 | 2,418 | 0 | 2,418 | 0 |
| `c_ObjetoImp` | 8 | 8 | 0 | 8 | 0 |
| `c_Impuesto` | 3 | 3 | 0 | 3 | 0 |
| `c_TipoFactor` | 3 | 3 | 0 | 3 | 0 |
| `c_TasaOCuota` | 19 | 19 | 0 | 19 | 0 |
| `c_Aduana` | 50 | 50 | 0 | 50 | 0 |
| `c_NumPedimentoAduana` | 59,057 | 59,057 | 0 | 59,057 | 0 |
| `c_PatenteAduanal` | 3,420 | 3,420 | 0 | 3,420 | 0 |
| `c_Colonia` | 145,366 | 145,366 | 0 | 145,366 | 0 |
| `c_Estado` | 95 | 95 | 0 | 95 | 0 |
| `c_Localidad` | 664 | 664 | 0 | 664 | 0 |
| `c_Municipio` | 2,478 | 2,478 | 0 | 2,478 | 0 |

SHA-256 del archivo: `ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b`. El JSON adjunto incluye los encabezados interpretados, huellas de los registros transformados y ejemplos de cualquier rechazo.

## SEPOMEX: conteo por catálogo

| Catálogo lógico | Leídos | Transformados | Rechazados | Esperados | Identidades repetidas |
| --- | ---: | ---: | ---: | ---: | ---: |
| `Aguascalientes` | 1,509 | 1,509 | 0 | 1,509 | 0 |
| `Baja_California` | 2,682 | 2,682 | 0 | 2,682 | 0 |
| `Baja_California_Sur` | 1,080 | 1,080 | 0 | 1,080 | 0 |
| `Campeche` | 1,308 | 1,308 | 0 | 1,308 | 0 |
| `Coahuila_de_Zaragoza` | 4,487 | 4,487 | 0 | 4,487 | 0 |
| `Colima` | 923 | 923 | 0 | 923 | 0 |
| `Chiapas` | 9,747 | 9,747 | 0 | 9,747 | 0 |
| `Chihuahua` | 10,132 | 10,132 | 0 | 10,132 | 0 |
| `Distrito_Federal` | 1,531 | 1,531 | 0 | 1,531 | 0 |
| `Durango` | 7,147 | 7,147 | 0 | 7,147 | 0 |
| `Guanajuato` | 10,339 | 10,339 | 0 | 10,339 | 0 |
| `Guerrero` | 5,419 | 5,419 | 0 | 5,419 | 0 |
| `Hidalgo` | 6,241 | 6,241 | 0 | 6,241 | 0 |
| `Jalisco` | 6,546 | 6,546 | 0 | 6,546 | 0 |
| `México` | 8,362 | 8,362 | 0 | 8,362 | 0 |
| `Michoacán_de_Ocampo` | 10,405 | 10,405 | 0 | 10,405 | 0 |
| `Morelos` | 1,887 | 1,887 | 0 | 1,887 | 0 |
| `Nayarit` | 2,067 | 2,067 | 0 | 2,067 | 0 |
| `Nuevo_León` | 5,478 | 5,478 | 0 | 5,478 | 0 |
| `Oaxaca` | 7,356 | 7,356 | 0 | 7,356 | 0 |
| `Puebla` | 6,401 | 6,401 | 0 | 6,401 | 0 |
| `Querétaro` | 3,279 | 3,279 | 0 | 3,279 | 0 |
| `Quintana_Roo` | 1,222 | 1,222 | 0 | 1,222 | 0 |
| `San_Luis_Potosí` | 6,374 | 6,374 | 0 | 6,374 | 0 |
| `Sinaloa` | 4,565 | 4,565 | 0 | 4,565 | 0 |
| `Sonora` | 8,826 | 8,826 | 0 | 8,826 | 0 |
| `Tabasco` | 2,898 | 2,898 | 0 | 2,898 | 0 |
| `Tamaulipas` | 3,636 | 3,636 | 0 | 3,636 | 0 |
| `Tlaxcala` | 1,432 | 1,432 | 0 | 1,432 | 0 |
| `Veracruz_de_Ignacio_de_la_Llave` | 11,567 | 11,567 | 0 | 11,567 | 0 |
| `Yucatán` | 1,737 | 1,737 | 0 | 1,737 | 0 |
| `Zacatecas` | 2,795 | 2,795 | 0 | 2,795 | 0 |

SHA-256 del archivo: `5d5e29332b6f699d0ef5a4bf1c06ca12089605cd58012b5950d995b0f0a1fd1a`. El JSON adjunto incluye los encabezados interpretados, huellas de los registros transformados y ejemplos de cualquier rechazo.

## Conservación y compatibilidad

Material peligroso: 8 claves repetidas, 17 filas de variantes y 9 filas adicionales. Las variantes usan `fila_origen` y se someten a la misma prueba de unicidad.
En SAT, `reglas` contiene los valores de todas las celdas con su tipo Excel, encabezados, hoja y fila; la fila de continuación del comprobante `N` se conserva en el mismo objeto. Se verificó el recorrido JSON de esos valores. Las fechas de registro se convirtieron a ISO y los valores originales siguen en `reglas`. En SEPOMEX se compararon las 15 celdas de cada fila con sus 15 columnas destino.

CARTA_PORTE: 0 fallos de conservación JSON; 0 filas SEPOMEX con valores no representados; 43,054 filas con alguna clave inicial `0`; 0 claves numéricas completadas con ceros; 61,224 fechas ISO obtenidas; 339 descripciones de presentación derivadas; 29 filas con fecha marcada `Por definir`/equivalente.
CFDI: 0 fallos de conservación JSON; 0 filas SEPOMEX con valores no representados; 55,190 filas con alguna clave inicial `0`; 23 claves numéricas completadas con ceros; 216,765 fechas ISO obtenidas; 158,244 descripciones de presentación derivadas; 0 filas con fecha marcada `Por definir`/equivalente.
SEPOMEX: 0 fallos de conservación JSON; 0 filas SEPOMEX con valores no representados; 146,339 filas con alguna clave inicial `0`; 0 claves numéricas completadas con ceros; 0 fechas ISO obtenidas; 0 descripciones de presentación derivadas; 0 filas con fecha marcada `Por definir`/equivalente.

Comprobación estática del SQL: sat_reglas_jsonb=sí, sat_descripcion_requerida=sí, sat_contexto_jsonb=sí, sat_pk_compuesta=sí, sep_pk_compuesta=sí, sep_sin_reglas_por_fila=sí; columnas SEPOMEX encontradas: 15/15.

### Pendientes antes de una carga real

- `tms.cp_sat_claves` admite el objeto `clave_contexto` y `reglas`; `tms.sepomex_asentamientos` tiene 15 columnas que corresponden a las 15 de SEPOMEX. Esta comprobación es estática contra los SQL del proyecto, no contra la instancia de Supabase.
- `tms.cp_sat_versiones` exige `version_cfdi`, `revision`, `vigente_desde`, `fuente_url` y, para Carta Porte, `version_complemento`. Los libros incluyen versiones y revisiones **por catálogo**, algunas diferentes dentro de un mismo archivo. Falta definir una revisión e inicio de vigencia **por archivo** sin inventar una revisión oficial, y confirmar `fuente_url` de cada fuente. Los metadatos por hoja caben en `metadatos`.
- `tms.sepomex_versiones` exige `fuente_url`; su `fecha_fuente` sale de la hoja `Nota`. La tabla de asentamientos no guarda hoja/fila ni tipos Excel por fila: sus 15 valores se conservan en columnas, pero la trazabilidad exacta depende de retener el XLS y su SHA-256.
- `c_TasaOCuota` no tiene nombres de propiedades de contexto fijados textualmente en el contrato. El dry run usa los nueve nombres que aparecen en el script; hay que incorporarlos al contrato antes de la importación definitiva.
- Los catálogos sin descripción fuente (`c_CodigoPostal`, `c_NumPedimentoAduana`, `c_PatenteAduanal`, `c_NumAutorizacionNaviero`, `c_TasaOCuota`) requieren una descripción de presentación derivada para satisfacer `descripcion NOT NULL`. Su contenido original permanece íntegro en `reglas`.
- Algunos códigos CFDI están almacenados como número Excel. El dry run aplica anchos conocidos; se debe aprobar esa normalización y verificarla contra el catálogo oficial antes de insertar, en especial claves de pago, impuesto, aduana y productos.
- La fila auxiliar de `c_TipoDeComprobante` y la nota de continuación postal se manejaron explícitamente. El código SEPOMEX `91312` sin equivalente CFDI y las diferencias de descripciones entre archivos permanecen separados; no se descartaron.

## Conclusión

El resultado anterior prueba la transformación local, las identidades y la compatibilidad de los campos de registro con el SQL del proyecto. Una afirmación de importación real sin pérdida exige resolver los campos obligatorios de versión/procedencia y la política de trazabilidad SEPOMEX; el dry run no comprueba datos ni permisos de Supabase.

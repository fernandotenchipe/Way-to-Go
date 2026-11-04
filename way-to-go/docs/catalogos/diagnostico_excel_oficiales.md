# Diagnóstico local de los tres Excel oficiales

Inventario reproducible y de solo lectura sobre los archivos indicados. No comprueba el contenido de Supabase ni ejecuta importación. Los conteos excluyen títulos, metadatos, encabezados y avisos de continuación; la hoja `Nota` de SEPOMEX aporta 0 registros.

## Fuentes y totales

| Familia | Archivo | SHA-256 | Hojas | Registros |
| --- | --- | --- | ---: | ---: |
| CARTA_PORTE | `C:\Users\ferte\Downloads\CatalogosCartaPorte31.xls` | `2ea8101bc84df18773f47dd8d5aa1309c81854e51e1e5b55387e0f1aeed18afe` | 34 | 206,280 |
| CFDI | `C:\Users\ferte\Downloads\catCFDI_V_4_20261029.xls` | `ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b` | 28 | 362,381 |
| SEPOMEX | `C:\Users\ferte\Downloads\CPdescargaxls\CPdescarga.xls` | `5d5e29332b6f699d0ef5a4bf1c06ca12089605cd58012b5950d995b0f0a1fd1a` | 33 | 159,378 |

## Conteos esperados por hoja

### CARTA_PORTE

| Hoja física | Catálogo lógico | Fila del encabezado | Registros | Identidades duplicadas (catálogo completo) |
| --- | --- | ---: | ---: | ---: |
| `c_RegimenAduanero` | `c_RegimenAduanero` | 5 | 10 | 0 |
| `c_CveTransporte` | `c_CveTransporte` | 5 | 4 | 0 |
| `c_TipoEstacion` | `c_TipoEstacion` | 5 | 3 | 0 |
| `c_Estaciones ` | `c_Estaciones` | 5 | 5,280 | 0 |
| `c_ClaveUnidadPeso` | `c_ClaveUnidadPeso` | 5 | 472 | 0 |
| `c_ClaveProdServCP` | `c_ClaveProdServCP` | 5 | 48,757 | 0 |
| `c_MaterialPeligroso` | `c_MaterialPeligroso` | 5 | 2,346 | 9 |
| `c_TipoEmbalaje` | `c_TipoEmbalaje` | 5 | 59 | 0 |
| `c_TipoPermiso` | `c_TipoPermiso` | 5 | 26 | 0 |
| `c_Colonia_1` | `c_Colonia` | 5 | 60,100 | 0 |
| `c_Colonia_2` | `c_Colonia` | 5 | 60,100 | 0 |
| `c_Colonia_3` | `c_Colonia` | 5 | 25,166 | 0 |
| `c_Localidad` | `c_Localidad` | 5 | 664 | 0 |
| `c_Municipio` | `c_Municipio` | 5 | 2,463 | 0 |
| `c_SectorCOFEPRIS` | `c_SectorCOFEPRIS` | 5 | 5 | 0 |
| `c_FormaFarmaceutica` | `c_FormaFarmaceutica` | 5 | 20 | 0 |
| `c_CondicionesEspeciales` | `c_CondicionesEspeciales` | 5 | 4 | 0 |
| `c_TipoMateria` | `c_TipoMateria` | 5 | 5 | 0 |
| `c_DocumentoAduanero` | `c_DocumentoAduanero` | 5 | 20 | 0 |
| `c_ParteTransporte` | `c_ParteTransporte` | 5 | 12 | 0 |
| `c_FiguraTransporte` | `c_FiguraTransporte` | 5 | 5 | 0 |
| `c_ConfigAutotransporte` | `c_ConfigAutotransporte` | 5 | 34 | 0 |
| ` c_SubTipoRem` | `c_SubTipoRem` | 5 | 31 | 0 |
| `c_RegistroISTMO` | `c_RegistroISTMO` | 5 | 6 | 0 |
| `c_ConfigMaritima` | `c_ConfigMaritima` | 5 | 15 | 0 |
| `c_ClaveTipoCarga` | `c_ClaveTipoCarga` | 5 | 6 | 0 |
| `c_ContenedorMaritimo` | `c_ContenedorMaritimo` | 5 | 12 | 0 |
| `c_NumAutorizacionNaviero` | `c_NumAutorizacionNaviero` | 5 | 339 | 0 |
| `c_CodigoTransporteAereo` | `c_CodigoTransporteAereo` | 5 | 173 | 0 |
| `c_TipoDeServicio` | `c_TipoDeServicio` | 5 | 4 | 0 |
| `c_DerechosDePaso` | `c_DerechosDePaso` | 5 | 119 | 0 |
| `c_TipoCarro` | `c_TipoCarro` | 5 | 11 | 0 |
| `c_Contenedor` | `c_Contenedor` | 5 | 5 | 0 |
| `c_TipoDeTrafico` | `c_TipoDeTrafico` | 5 | 4 | 0 |

### CFDI

| Hoja física | Catálogo lógico | Fila del encabezado | Registros | Identidades duplicadas (catálogo completo) |
| --- | --- | ---: | ---: | ---: |
| `c_FormaPago` | `c_FormaPago` | 6 | 22 | 0 |
| `c_Moneda` | `c_Moneda` | 5 | 183 | 0 |
| `c_TipoDeComprobante` | `c_TipoDeComprobante` | 5 | 5 | 0 |
| `c_Exportacion` | `c_Exportacion` | 5 | 4 | 0 |
| `c_MetodoPago` | `c_MetodoPago` | 6 | 2 | 0 |
| `c_CodigoPostal_Parte_1` | `c_CodigoPostal` | 6 | 60,081 | 0 |
| `c_CodigoPostal_Parte_2` | `c_CodigoPostal` | 6 | 35,667 | 0 |
| `c_Periodicidad` | `c_Periodicidad` | 5 | 5 | 0 |
| `c_Meses` | `c_Meses` | 5 | 18 | 0 |
| `c_TipoRelacion` | `c_TipoRelacion` | 5 | 7 | 0 |
| `c_RegimenFiscal` | `c_RegimenFiscal` | 6 | 19 | 0 |
| `c_Pais` | `c_Pais` | 5 | 250 | 0 |
| `c_UsoCFDI` | `c_UsoCFDI` | 5 | 24 | 0 |
| `c_ClaveProdServ` | `c_ClaveProdServ` | 5 | 52,513 | 0 |
| `c_ClaveUnidad` | `c_ClaveUnidad` | 6 | 2,418 | 0 |
| `c_ObjetoImp` | `c_ObjetoImp` | 5 | 8 | 0 |
| `c_Impuesto` | `c_Impuesto` | 5 | 3 | 0 |
| `c_TipoFactor` | `c_TipoFactor` | 5 | 3 | 0 |
| `c_TasaOCuota` | `c_TasaOCuota` | 5 | 19 | 0 |
| `c_Aduana` | `c_Aduana` | 5 | 50 | 0 |
| `c_NumPedimentoAduana` | `c_NumPedimentoAduana` | 5 | 59,057 | 0 |
| `c_PatenteAduanal` | `c_PatenteAduanal` | 5 | 3,420 | 0 |
| `C_Colonia_1` | `c_Colonia` | 5 | 60,100 | 0 |
| `C_Colonia_2` | `c_Colonia` | 5 | 60,100 | 0 |
| `C_Colonia_3` | `c_Colonia` | 5 | 25,166 | 0 |
| `c_Estado` | `c_Estado` | 5 | 95 | 0 |
| `C_Localidad` | `c_Localidad` | 5 | 664 | 0 |
| `C_Municipio` | `c_Municipio` | 5 | 2,478 | 0 |

### SEPOMEX

| Hoja física | Catálogo lógico | Fila del encabezado | Registros | Identidades duplicadas (catálogo completo) |
| --- | --- | ---: | ---: | ---: |
| `Nota` | `—` | 1 | 0 | 0 |
| `Aguascalientes` | `Aguascalientes` | 1 | 1,509 | 0 |
| `Baja_California` | `Baja_California` | 1 | 2,682 | 0 |
| `Baja_California_Sur` | `Baja_California_Sur` | 1 | 1,080 | 0 |
| `Campeche` | `Campeche` | 1 | 1,308 | 0 |
| `Coahuila_de_Zaragoza` | `Coahuila_de_Zaragoza` | 1 | 4,487 | 0 |
| `Colima` | `Colima` | 1 | 923 | 0 |
| `Chiapas` | `Chiapas` | 1 | 9,747 | 0 |
| `Chihuahua` | `Chihuahua` | 1 | 10,132 | 0 |
| `Distrito_Federal` | `Distrito_Federal` | 1 | 1,531 | 0 |
| `Durango` | `Durango` | 1 | 7,147 | 0 |
| `Guanajuato` | `Guanajuato` | 1 | 10,339 | 0 |
| `Guerrero` | `Guerrero` | 1 | 5,419 | 0 |
| `Hidalgo` | `Hidalgo` | 1 | 6,241 | 0 |
| `Jalisco` | `Jalisco` | 1 | 6,546 | 0 |
| `México` | `México` | 1 | 8,362 | 0 |
| `Michoacán_de_Ocampo` | `Michoacán_de_Ocampo` | 1 | 10,405 | 0 |
| `Morelos` | `Morelos` | 1 | 1,887 | 0 |
| `Nayarit` | `Nayarit` | 1 | 2,067 | 0 |
| `Nuevo_León` | `Nuevo_León` | 1 | 5,478 | 0 |
| `Oaxaca` | `Oaxaca` | 1 | 7,356 | 0 |
| `Puebla` | `Puebla` | 1 | 6,401 | 0 |
| `Querétaro` | `Querétaro` | 1 | 3,279 | 0 |
| `Quintana_Roo` | `Quintana_Roo` | 1 | 1,222 | 0 |
| `San_Luis_Potosí` | `San_Luis_Potosí` | 1 | 6,374 | 0 |
| `Sinaloa` | `Sinaloa` | 1 | 4,565 | 0 |
| `Sonora` | `Sonora` | 1 | 8,826 | 0 |
| `Tabasco` | `Tabasco` | 1 | 2,898 | 0 |
| `Tamaulipas` | `Tamaulipas` | 1 | 3,636 | 0 |
| `Tlaxcala` | `Tlaxcala` | 1 | 1,432 | 0 |
| `Veracruz_de_Ignacio_de_la_Llave` | `Veracruz_de_Ignacio_de_la_Llave` | 1 | 11,567 | 0 |
| `Yucatán` | `Yucatán` | 1 | 1,737 | 0 |
| `Zacatecas` | `Zacatecas` | 1 | 2,795 | 0 |

## Estructura y tipos de columnas

Los tipos reflejan celdas de datos del Excel: texto, número o fecha Excel. `vacío` indica una columna sin valores de datos; el número de vacíos se calcula entre registros, no entre filas de título.

### CARTA_PORTE

- **c_RegimenAduanero** (10 registros; ancho físico 5): 1. Clave (texto); 2. Descripción (texto); 3. ImpoExpo (texto); 4. Fecha inicio de vigencia (fecha Excel); 5. Fecha fin de vigencia (vacío, 10 vacíos).
- **c_CveTransporte** (4 registros; ancho físico 4): 1. Clave transporte (texto); 2. Descripción del tipo de transporte (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 4 vacíos).
- **c_TipoEstacion** (3 registros; ancho físico 5): 1. Clave de estación (texto); 2. Descripción del tipo de estación (texto); 3. Clave transporte (texto); 4. Fecha inicio de vigencia (fecha Excel); 5. Fecha fin de vigencia (vacío, 3 vacíos).
- **c_Estaciones ** (5,280 registros; ancho físico 8): 1. Clave identificación (texto); 2. Descripción (texto); 3. Clave transporte (texto); 4. Nacionalidad (texto); 5. Designador IATA (texto, 2934 vacíos); 6. Línea férrea (texto, 2470 vacíos); 7. Fecha de inicio de vigencia (fecha Excel); 8. Fecha de fin de vigencia (vacío, 5280 vacíos).
- **c_ClaveUnidadPeso** (472 registros; ancho físico 8): 1. Clave unidad (texto); 2. Nombre (texto); 3. Descripción (texto, 341 vacíos); 4. Nota (texto, 467 vacíos); 5. Fecha de inicio de vigencia (fecha Excel); 6. Fecha de fin de vigencia (vacío, 472 vacíos); 7. Símbolo (texto, 376 vacíos); 8. Bandera (texto).
- **c_ClaveProdServCP** (48,757 registros; ancho físico 6): 1. c_ClaveProdServ (texto/número); 2. Descripción (texto); 3. Palabras similares (texto, 37526 vacíos); 4. Material Peligroso (texto/número); 5. FechaInicioVigencia (fecha Excel); 6. FechaFinVigencia (vacío, 48757 vacíos).
- **c_MaterialPeligroso** (2,346 registros; ancho físico 7): 1. Clave material peligroso (texto); 2. Descripción (texto); 3. Clase o div. (texto/número, 1 vacíos); 4. Peligro 
secundario (texto/número, 1845 vacíos); 5. Nombre técnico (texto, 1890 vacíos); 6. Fecha de inicio de vigencia (fecha Excel); 7. Fecha de fin de vigencia (vacío, 2346 vacíos).
- **c_TipoEmbalaje** (59 registros; ancho físico 4): 1. Clave de designación (texto); 2. Descripción (texto); 3. Fecha de inicio de vigencia (fecha Excel); 4. Fecha de fin de vigencia (vacío, 59 vacíos).
- **c_TipoPermiso** (26 registros; ancho físico 5): 1. Clave (texto); 2. Descripción (texto); 3. Clave transporte (texto); 4. Fecha de inicio de vigencia (fecha Excel); 5. Fecha de fin de vigencia (vacío, 26 vacíos).
- **c_Colonia_1** (60,100 registros; ancho físico 4): 1. c_Colonia (texto); 2. c_CodigoPostal (texto/número); 3. Nombre del asentamiento (texto); 4. (sin encabezado, columna 4) (vacío, 60100 vacíos).
- **c_Colonia_2** (60,100 registros; ancho físico 4): 1. c_Colonia (texto); 2. c_CodigoPostal (texto); 3. Nombre del asentamiento (texto); 4. (sin encabezado, columna 4) (vacío, 60100 vacíos).
- **c_Colonia_3** (25,166 registros; ancho físico 4): 1. c_Colonia (texto); 2. c_CodigoPostal (texto); 3. Nombre del asentamiento (texto); 4. (sin encabezado, columna 4) (vacío, 25166 vacíos).
- **c_Localidad** (664 registros; ancho físico 5): 1. c_Localidad (texto); 2. c_Estado (texto); 3. Descripción (texto); 4. Fecha inicio vigencia (fecha Excel); 5. Fecha fin vigencia (vacío, 664 vacíos).
- **c_Municipio** (2,463 registros; ancho físico 5): 1. c_Municipio (texto); 2. c_Estado (texto); 3. Descripción (texto); 4. Fecha inicio vigencia (fecha Excel); 5. Fecha fin vigencia (vacío, 2463 vacíos).
- **c_SectorCOFEPRIS** (5 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (texto); 4. Fecha fin de vigencia (vacío, 5 vacíos).
- **c_FormaFarmaceutica** (20 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (texto); 4. Fecha fin de vigencia (vacío, 20 vacíos).
- **c_CondicionesEspeciales** (4 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (texto); 4. Fecha fin de vigencia (vacío, 4 vacíos).
- **c_TipoMateria** (5 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 5 vacíos).
- **c_DocumentoAduanero** (20 registros; ancho físico 4): 1. Clave (texto); 2. Descripcion (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 20 vacíos).
- **c_ParteTransporte** (12 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha de inicio de vigencia (fecha Excel); 4. Fecha de fin de vigencia (vacío, 12 vacíos).
- **c_FiguraTransporte** (5 registros; ancho físico 4): 1. Clave figura transporte (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 5 vacíos).
- **c_ConfigAutotransporte** (34 registros; ancho físico 7): 1. Clave nomenclatura (texto); 2. Descripción (texto); 3. Número de ejes (número, 10 vacíos); 4. Número de llantas (número/texto, 10 vacíos); 5. Remolque (texto); 6. Fecha de inicio de vigencia (fecha Excel); 7. Fecha de fin de vigencia (vacío, 34 vacíos).
- ** c_SubTipoRem** (31 registros; ancho físico 4): 1. Clave tipo remolque (texto); 2. Remolque o semirremolque (texto); 3. Fecha de inicio de vigencia (fecha Excel); 4. Fecha de fin de vigencia (vacío, 31 vacíos).
- **c_RegistroISTMO** (6 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 6 vacíos).
- **c_ConfigMaritima** (15 registros; ancho físico 4): 1. Clave configuración marítima (texto); 2. Descripción (texto); 3. Fecha de inicio de vigencia (fecha Excel); 4. Fecha de fin de vigencia (vacío, 15 vacíos).
- **c_ClaveTipoCarga** (6 registros; ancho físico 4): 1. Clave tipo carga (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 6 vacíos).
- **c_ContenedorMaritimo** (12 registros; ancho físico 4): 1. Clave del contenedor marítimo (texto); 2. Descripción (texto); 3. Fecha de inicio de vigencia (fecha Excel); 4. Fecha de fin de vigencia (vacío, 12 vacíos).
- **c_NumAutorizacionNaviero** (339 registros; ancho físico 3): 1. Número de autorización (texto); 2. Inicio de vigencia (fecha Excel); 3. Fin de vigencia (fecha Excel).
- **c_CodigoTransporteAereo** (173 registros; ancho físico 6): 1. Clave identificación (texto); 2. Nacionalidad (texto); 3. Nombre de la aerolínea (texto); 4. Designador OACI (texto); 5. Fecha de inicio de vigencia (fecha Excel); 6. Fecha de fin de vigencia (vacío, 173 vacíos).
- **c_TipoDeServicio** (4 registros; ancho físico 5): 1. Clave (texto); 2. Descripción (texto); 3. Contenedor (número); 4. Fecha de inicio de vigencia (fecha Excel); 5. Fecha de fin de vigencia (vacío, 4 vacíos).
- **c_DerechosDePaso** (119 registros; ancho físico 8): 1. Clave del derecho de paso (texto); 2. Derecho de paso (texto); 3. Entre (texto); 4. Hasta (texto); 5. Otorga/Recibe (texto); 6. Concesionario (texto); 7. Fecha de inicio de vigencia (fecha Excel); 8. Fecha de fin de vigencia (vacío, 119 vacíos).
- **c_TipoCarro** (11 registros; ancho físico 5): 1. Clave (texto); 2. Tipo de carro (texto); 3. Contenedor (texto/número); 4. Fecha de inicio de vigencia (fecha Excel); 5. Fecha de fin de vigencia (vacío, 11 vacíos).
- **c_Contenedor** (5 registros; ancho físico 5): 1. Clave (texto); 2. Tipo de contenedor (texto); 3. Descripción (texto); 4. Fecha de inicio de vigencia (fecha Excel); 5. Fecha de fin de vigencia (vacío, 5 vacíos).
- **c_TipoDeTrafico** (4 registros; ancho físico 4): 1. Clave (texto); 2. Descripción (texto); 3. Fecha de inicio de vigencia (fecha Excel); 4. Fecha de fin de vigencia (vacío, 4 vacíos).

### CFDI

- **c_FormaPago** (22 registros; ancho físico 14): 1. c_FormaPago (número); 2. Descripción (texto); 3. Bancarizado (texto); 4. Número de operación (texto); 5. RFC del Emisor de la cuenta ordenante (texto); 6. Cuenta Ordenante (texto); 7. Patrón para cuenta ordenante (texto); 8. RFC del Emisor Cuenta de Beneficiario (texto); 9. Cuenta de Benenficiario (texto); 10. Patrón para cuenta Beneficiaria (texto); 11. Tipo Cadena Pago (texto); 12. Nombre del Banco emisor de la cuenta ordenante en caso de extranjero (texto); 13. Fecha inicio de vigencia (fecha Excel); 14. Fecha fin de vigencia (vacío, 22 vacíos).
- **c_Moneda** (183 registros; ancho físico 6): 1. c_Moneda (texto); 2. Descripción (texto); 3. Decimales (texto); 4. Porcentaje variación (número, 2 vacíos); 5. Fecha inicio de vigencia (fecha Excel); 6. Fecha fin de vigencia (vacío, 183 vacíos).
- **c_TipoDeComprobante** (5 registros; ancho físico 6): 1. c_TipoDeComprobante (texto); 2. Descripción (texto); 3. Valor máximo / NS (texto/número); 4. Valor máximo / NdS (texto, 4 vacíos); 5. Fecha inicio de vigencia (fecha Excel); 6. Fecha fin de vigencia (vacío, 5 vacíos).
- **c_Exportacion** (4 registros; ancho físico 5): 1. c_Exportacion (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 4 vacíos); 5. (sin encabezado, columna 5) (vacío, 4 vacíos).
- **c_MetodoPago** (2 registros; ancho físico 6): 1. c_MetodoPago (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 2 vacíos); 5. (sin encabezado, columna 5) (vacío, 2 vacíos); 6. (sin encabezado, columna 6) (vacío, 2 vacíos).
- **c_CodigoPostal_Parte_1** (60,081 registros; ancho físico 16): 1. c_CodigoPostal (texto/número); 2. c_Estado (texto); 3. c_Municipio (texto/número, 41164 vacíos); 4. c_Localidad (texto, 52347 vacíos); 5. Estímulo Franja Fronteriza (número); 6. Fecha inicio de vigencia (fecha Excel); 7. Fecha fin de vigencia (vacío, 60081 vacíos); 8. Referencias del Huso Horario / Descripción del Huso Horario (texto); 9. Mes_Inicio_Horario_Verano (texto, 56561 vacíos); 10. Día_Inicio_Horario_Verano (texto, 56561 vacíos); 11. Día_Inicio_Horario_Verano (texto, 56561 vacíos); 12. Diferencia_Horaria_Verano (número); 13. Mes_Inicio_Horario_Invierno (texto, 56561 vacíos); 14. Día_Inicio_Horario_Invierno (texto, 56561 vacíos); 15. Día_Inicio_Horario_Invierno (texto, 56561 vacíos); 16. Diferencia_Horaria_Invierno (número).
- **c_CodigoPostal_Parte_2** (35,667 registros; ancho físico 16): 1. c_CodigoPostal (texto/número); 2. c_Estado (texto); 3. c_Municipio (texto, 21776 vacíos); 4. c_Localidad (texto, 31160 vacíos); 5. Estímulo Franja Fronteriza (número); 6. Fecha inicio de vigencia (fecha Excel); 7. Fecha fin de vigencia (vacío, 35667 vacíos); 8. Referencias del Huso Horario / Descripción del Huso Horario (texto); 9. Mes_Inicio_Horario_Verano (texto, 34317 vacíos); 10. Día_Inicio_Horario_Verano (texto, 34317 vacíos); 11. Día_Inicio_Horario_Verano (texto, 34317 vacíos); 12. Diferencia_Horaria_Verano (número); 13. Mes_Inicio_Horario_Invierno (texto, 34317 vacíos); 14. Día_Inicio_Horario_Invierno (texto, 34317 vacíos); 15. Día_Inicio_Horario_Invierno (texto, 34317 vacíos); 16. Diferencia_Horaria_Invierno (número).
- **c_Periodicidad** (5 registros; ancho físico 6): 1. c_Periodicidad (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 5 vacíos); 5. (sin encabezado, columna 5) (vacío, 5 vacíos); 6. (sin encabezado, columna 6) (vacío, 5 vacíos).
- **c_Meses** (18 registros; ancho físico 6): 1. c_Meses (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 18 vacíos); 5. (sin encabezado, columna 5) (vacío, 18 vacíos); 6. (sin encabezado, columna 6) (vacío, 18 vacíos).
- **c_TipoRelacion** (7 registros; ancho físico 6): 1. c_TipoRelacion (número); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 7 vacíos); 5. (sin encabezado, columna 5) (vacío, 7 vacíos); 6. (sin encabezado, columna 6) (vacío, 7 vacíos).
- **c_RegimenFiscal** (19 registros; ancho físico 6): 1. c_RegimenFiscal (número); 2. Descripción (texto); 3. Física (texto); 4. Moral (texto); 5. Fecha de inicio de vigencia (fecha Excel); 6. Fecha de fin de vigencia (vacío, 19 vacíos).
- **c_Pais** (250 registros; ancho físico 6): 1. c_Pais (texto); 2. Descripción (texto); 3. Formato de código postal (texto, 247 vacíos); 4. Formato de Registro de Identidad Tributaria (texto, 247 vacíos); 5. Validación del Registro de Identidad Tributaria (texto, 249 vacíos); 6. Agrupaciones (texto, 219 vacíos).
- **c_UsoCFDI** (24 registros; ancho físico 7): 1. c_UsoCFDI (texto); 2. Descripción (texto); 3. Aplica para tipo persona / Física (texto); 4. Aplica para tipo persona / Moral (texto); 5. Fecha inicio de vigencia (fecha Excel); 6. Fecha fin de vigencia (vacío, 24 vacíos); 7. Régimen Fiscal Receptor (texto/número).
- **c_ClaveProdServ** (52,513 registros; ancho físico 9): 1. c_ClaveProdServ (texto/número); 2. Descripción (texto); 3. Incluir IVA trasladado (texto); 4. Incluir IEPS trasladado (texto); 5. Complemento que debe incluir (vacío, 52513 vacíos); 6. FechaInicioVigencia (fecha Excel); 7. FechaFinVigencia (vacío, 52513 vacíos); 8. Estímulo Franja Fronteriza (número); 9. Palabras similares (texto, 40310 vacíos).
- **c_ClaveUnidad** (2,418 registros; ancho físico 7): 1. c_ClaveUnidad (número/texto); 2. Nombre (texto); 3. Descripción (texto, 1507 vacíos); 4. Nota (texto, 2100 vacíos); 5. Fecha de inicio de vigencia (fecha Excel); 6. Fecha de fin de vigencia (vacío, 2418 vacíos); 7. Símbolo (texto, 861 vacíos).
- **c_ObjetoImp** (8 registros; ancho físico 6): 1. c_ObjetoImp (texto); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 8 vacíos); 5. (sin encabezado, columna 5) (vacío, 8 vacíos); 6. (sin encabezado, columna 6) (vacío, 8 vacíos).
- **c_Impuesto** (3 registros; ancho físico 7): 1. c_Impuesto (número); 2. Descripción (texto); 3. Retención (texto); 4. Traslado (texto); 5. Local o federal (texto); 6. Fecha inicio de vigencia (fecha Excel); 7. Fecha fin de vigencia (vacío, 3 vacíos).
- **c_TipoFactor** (3 registros; ancho físico 6): 1. c_TipoFactor (texto); 2. Fecha inicio de vigencia (fecha Excel); 3. Fecha fin de vigencia (vacío, 3 vacíos); 4. (sin encabezado, columna 4) (vacío, 3 vacíos); 5. (sin encabezado, columna 5) (vacío, 3 vacíos); 6. (sin encabezado, columna 6) (vacío, 3 vacíos).
- **c_TasaOCuota** (19 registros; ancho físico 9): 1. Rango o Fijo (texto); 2. c_TasaOCuota / Valor mínimo (número, 16 vacíos); 3. c_TasaOCuota / Valor máximo (número); 4. Impuesto (texto); 5. Factor (texto); 6. Traslado (texto); 7. Retención (texto); 8. Fecha inicio de vigencia (fecha Excel); 9. Fecha fin de vigencia (vacío, 19 vacíos).
- **c_Aduana** (50 registros; ancho físico 6): 1. c_Aduana (número); 2. Descripción (texto); 3. Fecha inicio de vigencia (fecha Excel); 4. Fecha fin de vigencia (vacío, 50 vacíos); 5. (sin encabezado, columna 5) (vacío, 50 vacíos); 6. (sin encabezado, columna 6) (vacío, 50 vacíos).
- **c_NumPedimentoAduana** (59,057 registros; ancho físico 6): 1. c_Aduana (texto); 2. Patente (texto); 3. Ejercicio (número/texto); 4. Cantidad (texto/número); 5. Fecha inicio de vigencia (fecha Excel); 6. Fecha fin de vigencia (vacío, 59057 vacíos).
- **c_PatenteAduanal** (3,420 registros; ancho físico 5): 1. C_PatenteAduanal (texto); 2. Inicio de vigencia de la patente (fecha Excel); 3. Fin de vigencia de la patente (vacío, 3420 vacíos); 4. (sin encabezado, columna 4) (vacío, 3420 vacíos); 5. (sin encabezado, columna 5) (vacío, 3420 vacíos).
- **C_Colonia_1** (60,100 registros; ancho físico 6): 1. c_Colonia (texto); 2. c_CodigoPostal (texto); 3. Nombre del asentamiento (texto); 4. (sin encabezado, columna 4) (vacío, 60100 vacíos); 5. (sin encabezado, columna 5) (vacío, 60100 vacíos); 6. (sin encabezado, columna 6) (vacío, 60100 vacíos).
- **C_Colonia_2** (60,100 registros; ancho físico 6): 1. c_Colonia (texto); 2. c_CodigoPostal (texto); 3. Nombre del asentamiento (texto); 4. (sin encabezado, columna 4) (vacío, 60100 vacíos); 5. (sin encabezado, columna 5) (vacío, 60100 vacíos); 6. (sin encabezado, columna 6) (vacío, 60100 vacíos).
- **C_Colonia_3** (25,166 registros; ancho físico 6): 1. c_Colonia (texto); 2. c_CodigoPostal (texto); 3. Nombre del asentamiento (texto); 4. (sin encabezado, columna 4) (vacío, 25166 vacíos); 5. (sin encabezado, columna 5) (vacío, 25166 vacíos); 6. (sin encabezado, columna 6) (vacío, 25166 vacíos).
- **c_Estado** (95 registros; ancho físico 6): 1. c_Estado (texto); 2. c_Pais (texto); 3. Nombre del estado (texto); 4. Fecha inicio de vigencia (fecha Excel); 5. Fecha fin de vigencia (vacío, 95 vacíos); 6. (sin encabezado, columna 6) (vacío, 95 vacíos).
- **C_Localidad** (664 registros; ancho físico 6): 1. c_Localidad (texto); 2. c_Estado (texto); 3. Descripción (texto); 4. Fecha de inicio de vigencia (fecha Excel); 5. Fecha de fin de vigencia (vacío, 664 vacíos); 6. (sin encabezado, columna 6) (vacío, 664 vacíos).
- **C_Municipio** (2,478 registros; ancho físico 6): 1. c_Municipio (texto); 2. c_Estado (texto); 3. Descripción (texto); 4. Fecha de inicio de vigencia (fecha Excel); 5. Fecha de fin de vigencia (vacío, 2478 vacíos); 6. (sin encabezado, columna 6) (vacío, 2478 vacíos).

### SEPOMEX

- **Nota** (0 registros; ancho físico 3): 1. A1 (texto); 2. NOTA (texto); 3. A3 (texto).
- **Aguascalientes** (1,509 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 747 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1509 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 747 vacíos).
- **Baja_California** (2,682 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 566 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 2682 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 566 vacíos).
- **Baja_California_Sur** (1,080 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 375 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1080 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 375 vacíos).
- **Campeche** (1,308 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 748 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1308 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 748 vacíos).
- **Coahuila_de_Zaragoza** (4,487 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 2164 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 4487 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 2164 vacíos).
- **Colima** (923 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 318 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 923 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 318 vacíos).
- **Chiapas** (9,747 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 7747 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 9747 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 7747 vacíos).
- **Chihuahua** (10,132 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 7369 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 10132 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 7369 vacíos).
- **Distrito_Federal** (1,531 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1531 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto).
- **Durango** (7,147 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 5889 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 7147 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 5889 vacíos).
- **Guanajuato** (10,339 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 6799 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 10339 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 6799 vacíos).
- **Guerrero** (5,419 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 3610 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 5419 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 3610 vacíos).
- **Hidalgo** (6,241 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 5315 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 6241 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 5315 vacíos).
- **Jalisco** (6,546 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 3113 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 6546 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 3113 vacíos).
- **México** (8,362 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 4795 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 8362 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 4795 vacíos).
- **Michoacán_de_Ocampo** (10,405 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 7629 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 10405 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 7629 vacíos).
- **Morelos** (1,887 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1145 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1887 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1145 vacíos).
- **Nayarit** (2,067 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1394 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 2067 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1394 vacíos).
- **Nuevo_León** (5,478 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1828 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 5478 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1828 vacíos).
- **Oaxaca** (7,356 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 5672 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 7356 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 5672 vacíos).
- **Puebla** (6,401 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 4052 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 6401 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 4052 vacíos).
- **Querétaro** (3,279 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 2131 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 3279 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 2131 vacíos).
- **Quintana_Roo** (1,222 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 562 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1222 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 562 vacíos).
- **San_Luis_Potosí** (6,374 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 4508 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 6374 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 4508 vacíos).
- **Sinaloa** (4,565 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 2798 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 4565 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 2798 vacíos).
- **Sonora** (8,826 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 7051 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 8826 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 7051 vacíos).
- **Tabasco** (2,898 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 2325 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 2898 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 2325 vacíos).
- **Tamaulipas** (3,636 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1113 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 3636 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1113 vacíos).
- **Tlaxcala** (1,432 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1213 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1432 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1213 vacíos).
- **Veracruz_de_Ignacio_de_la_Llave** (11,567 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 8489 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 11567 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 8489 vacíos).
- **Yucatán** (1,737 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1030 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 1737 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1030 vacíos).
- **Zacatecas** (2,795 registros; ancho físico 15): 1. d_codigo (texto); 2. d_asenta (texto); 3. d_tipo_asenta (texto); 4. D_mnpio (texto); 5. d_estado (texto); 6. d_ciudad (texto, 1723 vacíos); 7. d_CP (texto); 8. c_estado (texto); 9. c_oficina (texto); 10. c_CP (vacío, 2795 vacíos); 11. c_tipo_asenta (texto); 12. c_mnpio (texto); 13. id_asenta_cpcons (texto); 14. d_zona (texto); 15. c_cve_ciudad (texto, 1723 vacíos).

## Cruces entre archivos

Las coincidencias se comparan por clave compuesta. Son referencias de distintas versiones/familias y se conservan por separado.

| Catálogo | Carta Porte | CFDI | Claves comunes | Solo Carta Porte | Solo CFDI | Descripciones diferentes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `c_Colonia` | 145,366 | 145,366 | 145,366 | 0 | 0 | 438 |
| `c_Municipio` | 2,463 | 2,478 | 2,463 | 0 | 15 | 0 |
| `c_Localidad` | 664 | 664 | 664 | 0 | 0 | 4 |

c_Colonia: 417 descripciones siguen siendo diferentes tras normalizar espacios, Unicode y mayúsculas. Ejemplos: `[{"key": ["4111", "66059"], "carta_porte": "Hacienda los Cantu 2do Sector", "cfdi": "Hacienda los Cantú 2do Sector"}, {"key": ["2295", "67876"], "carta_porte": "San Jose de Gonzalez", "cfdi": "San José de González"}, {"key": ["1153", "82266"], "carta_porte": "Barron", "cfdi": "Barrón"}, {"key": ["2425", "85518"], "carta_porte": "Los Medanos", "cfdi": "Los Medános"}, {"key": ["6248", "83324"], "carta_porte": "Campo Grande Némero Dos", "cfdi": "Campo Grande Número Dos"}, {"key": ["2813", "89602"], "carta_porte": "Cesar Lopez de Lara", "cfdi": "Cesar López de Lara"}]`.
c_Localidad: 4 descripciones siguen siendo diferentes tras normalizar espacios, Unicode y mayúsculas. Ejemplos: `[{"key": ["03", "CAM"], "carta_porte": "Calkini", "cfdi": "Calkiní"}, {"key": ["37", "GRO"], "carta_porte": "Huamuxtitlan", "cfdi": "Huamuxtitlán"}, {"key": ["11", "SLP"], "carta_porte": "Tamuin", "cfdi": "Tamuín"}, {"key": ["06", "ROO"], "carta_porte": "Kantunilkín", "cfdi": "Kantunilkin"}]`.

Códigos postales distintos: CFDI 95,748; SEPOMEX 31,867; colonias Carta Porte 32,333. SEPOMEX sin correspondencia en CFDI: 1 (91312); colonias Carta Porte sin CP CFDI: 0; CP CFDI sin asentamiento SEPOMEX: 63,882.

## Alertas detectadas

### CARTA_PORTE

- **c_ClaveProdServCP**: claves primarias numéricas: 48,747 (revisar ceros iniciales).
- **c_SectorCOFEPRIS**: fechas con marcador textual: {"Fecha inicio de vigencia": 5}.
- **c_FormaFarmaceutica**: fechas con marcador textual: {"Fecha inicio de vigencia": 20}.
- **c_CondicionesEspeciales**: fechas con marcador textual: {"Fecha inicio de vigencia": 4}.
- **c_MaterialPeligroso (consolidado)**: 9 identidades compuestas duplicadas; 9 filas con clave principal repetida; 8 claves principales con variantes. Ejemplos: [{"identity": ["1790"], "first": "c_MaterialPeligroso:1008", "again": "c_MaterialPeligroso:1009"}, {"identity": ["1796"], "first": "c_MaterialPeligroso:1014", "again": "c_MaterialPeligroso:1015"}, {"identity": ["1826"], "first": "c_MaterialPeligroso:1041", "again": "c_MaterialPeligroso:1042"}, {"identity": ["2031"], "first": "c_MaterialPeligroso:1195", "again": "c_MaterialPeligroso:1196"}, {"identity": ["2031"], "first": "c_MaterialPeligroso:1195", "again": "c_MaterialPeligroso:1197"}].
- **c_Colonia (consolidado)**: 0 identidades compuestas duplicadas; 135,367 filas con clave principal repetida; 9,680 claves principales con variantes. Ejemplos: [].
- **c_Localidad (consolidado)**: 0 identidades compuestas duplicadas; 598 filas con clave principal repetida; 59 claves principales con variantes. Ejemplos: [].
- **c_Municipio (consolidado)**: 0 identidades compuestas duplicadas; 1,893 filas con clave principal repetida; 217 claves principales con variantes. Ejemplos: [].

### CFDI

- **c_FormaPago**: claves primarias numéricas: 22 (revisar ceros iniciales); fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_Moneda**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_TipoDeComprobante**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}; filas no registrales excluidas: [{"row": 10, "sample": " |  | 999999999999999999.999999"}].
- **c_MetodoPago**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_CodigoPostal_Parte_1**: claves primarias numéricas: 3 (revisar ceros iniciales); filas no registrales excluidas: [{"row": 60089, "sample": "Continúa en c_CodigoPostal_2 |  | "}].
- **c_CodigoPostal_Parte_2**: claves primarias numéricas: 1 (revisar ceros iniciales).
- **c_Periodicidad**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_Meses**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_TipoRelacion**: claves primarias numéricas: 7 (revisar ceros iniciales); fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_RegimenFiscal**: claves primarias numéricas: 19 (revisar ceros iniciales); fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_Pais**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_ClaveProdServ**: claves primarias numéricas: 52,509 (revisar ceros iniciales).
- **c_ClaveUnidad**: claves primarias numéricas: 34 (revisar ceros iniciales); fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_Impuesto**: claves primarias numéricas: 3 (revisar ceros iniciales); fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_TipoFactor**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_Aduana**: claves primarias numéricas: 50 (revisar ceros iniciales).
- **C_Colonia_1**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **C_Colonia_2**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **C_Colonia_3**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_Estado**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **C_Localidad**: fechas de metadatos: {"Fecha publicación de catálogo": "placeholder", "Fecha  inicio de vigencia del catálogo": "valid", "Fecha fin de vigencia del catálogo": "empty"}.
- **c_TasaOCuota (consolidado)**: 0 identidades compuestas duplicadas; 17 filas con clave principal repetida; 2 claves principales con variantes. Ejemplos: [].
- **c_NumPedimentoAduana (consolidado)**: 0 identidades compuestas duplicadas; 59,007 filas con clave principal repetida; 50 claves principales con variantes. Ejemplos: [].
- **c_Colonia (consolidado)**: 0 identidades compuestas duplicadas; 135,367 filas con clave principal repetida; 9,680 claves principales con variantes. Ejemplos: [].
- **c_Localidad (consolidado)**: 0 identidades compuestas duplicadas; 598 filas con clave principal repetida; 59 claves principales con variantes. Ejemplos: [].
- **c_Municipio (consolidado)**: 0 identidades compuestas duplicadas; 1,908 filas con clave principal repetida; 217 claves principales con variantes. Ejemplos: [].

### SEPOMEX


## Revisión del contrato `sat-catalogos-contexto.md`

Se inventariaron 32 catálogos lógicos de Carta Porte y 25 de CFDI. Las identidades compuestas del contrato cubren `c_Colonia`, `c_Municipio`, `c_Localidad`, `c_Estado`, `c_NumPedimentoAduana` y `c_TasaOCuota`. Las otras hojas tienen identidad principal única, salvo las nueve repeticiones de `c_MaterialPeligroso`, que el contrato conserva con `fila_origen` en todas las variantes de cada clave repetida. La llave SEPOMEX `(clave_estado, clave_municipio, id_asentamiento_cpcons)` es única en las 32 hojas de datos.

El contrato requiere un anexo operativo antes de cargar: especificar ancho y normalización de claves que Excel guardó como números (`c_FormaPago` a 2 dígitos, `c_TipoRelacion` a 2, `c_Impuesto` a 3, `c_Aduana` a 2, `c_RegimenFiscal` a 3 y productos a 8), mantener como texto los códigos ya textuales y los ceros de SEPOMEX. Para `c_TasaOCuota`, fijar los nombres exactos y el orden de los nueve discriminantes y usar JSON `null` para mínimo o fin de vigencia vacíos. El número de fila de `c_MaterialPeligroso` debe ser el de la hoja original, empezando en 1, y conservar también la pestaña en `reglas`.

## Reglas especiales y resolución sin pérdida

1. **Pestañas partidas:** consolidar `c_Colonia_1/2/3` y `C_Colonia_1/2/3` por familia; consolidar `c_CodigoPostal_Parte_1/2`. Excluir solo el aviso de continuación y las filas de título; guardar hoja y fila de origen en `reglas`. Nunca fusionar registros de familias o versiones diferentes.
2. **Claves compuestas:** construir el contexto del contrato y comprobar unicidad antes de insertar. `c_MaterialPeligroso` conserva las nueve variantes repetidas mediante `fila_origen`; `c_TasaOCuota` y `c_NumPedimentoAduana` no presentan colisiones con su contexto.
3. **Encabezados y registros multilínea:** `c_CodigoPostal` y `c_TasaOCuota` tienen dos niveles de encabezado; `c_UsoCFDI` separa Física/Moral en otra fila. `c_TipoDeComprobante` tiene una fila sin clave entre `N` y `P` con valores máximos adicionales: asociarla al registro `N` como atributos originales, no crear una clave vacía ni descartarla.
4. **Fechas:** interpretar fechas Excel con el modo de fecha del libro y fechas textuales `dd/mm/aaaa`; guardar el valor original en `reglas`. Los `Por definir` de tres catálogos Carta Porte representan vigencia no especificada, no una fecha; conservar el texto y usar fecha nula. Los campos opcionales vacíos de vigencia también son nulos.
5. **Códigos y descripciones entre fuentes:** conservar las 438 descripciones de colonia y cuatro de localidad que difieren entre Carta Porte y CFDI en sus versiones respectivas. Los 15 municipios adicionales de CFDI permanecen allí. No hacer `upsert` cruzado ni sustituir SEPOMEX por el catálogo SAT de CP.
6. **Cobertura postal:** conservar el código SEPOMEX sin correspondencia CFDI como asentamiento de SEPOMEX, marcado para revisión; la validación fiscal debe consultar la versión CFDI vigente. La ausencia de asentamientos SEPOMEX para muchos códigos CFDI no implica invalidar esos códigos fiscales.
7. **Catálogos sin fechas por fila:** usar las fechas de metadatos de la hoja cuando correspondan y dejar en `reglas` su procedencia; no inventar vigencias por registro. La fecha de SEPOMEX sale de su hoja `Nota`.

## Decisión previa a la importación

Los tres archivos son legibles y el barrido no encontró vacíos en las columnas obligatorias definidas para cada tipo de hoja, fechas inválidas ni colisiones de las llaves compuestas finales de SEPOMEX, colonias, municipios, localidades, estados, tasas o pedimentos. **Todavía no conviene una carga automática desatendida:** primero hay que documentar y probar las reglas de claves numéricas, filas auxiliares, variantes de material peligroso y diferencias entre fuentes. El análisis no asegura que todas las relaciones comerciales/fiscales puedan resolverse solo con estos tres archivos; no se consultó Supabase.

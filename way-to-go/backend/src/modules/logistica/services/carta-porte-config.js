const spec = (text = '', ids = '', decimals = '', integers = '', booleans = '') => Object.fromEntries([
  ...text.split(' ').filter(Boolean).map(k => [k,'text']), ...ids.split(' ').filter(Boolean).map(k => [k,'uuid']),
  ...decimals.split(' ').filter(Boolean).map(k => [k,'decimal']), ...integers.split(' ').filter(Boolean).map(k => [k,'integer']),
  ...booleans.split(' ').filter(Boolean).map(k => [k,'boolean']),
]);
export const catalogs = {
  merchandise: { table:'mercancias', required:['descripcion'], search:'descripcion', fields:spec('codigo_interno descripcion bienes_transp_sat clave_unidad_sat unidad clave_material_peligroso_sat embalaje_sat descripcion_embalaje unidad_dimensiones fraccion_arancelaria tipo_materia_sat descripcion_materia','cliente_id','largo ancho alto peso_referencia_kg','','material_peligroso') },
  participants: { table:'cp_participantes', required:['nombre'], search:'nombre', fields:spec('nombre rfc residencia_fiscal_sat numero_registro_tributario','cliente_id proveedor_id') },
  addresses: { table:'cp_direcciones', required:['nombre','participante_id'], search:'nombre', fields:spec('nombre calle numero_exterior numero_interior colonia localidad municipio estado pais codigo_postal pais_sat estado_sat municipio_sat localidad_sat colonia_sat referencia zona_horaria','participante_id cliente_direccion_id') },
  issuers: { table:'empresas_emisoras', required:['nombre'], search:'nombre', fields:{...spec('nombre rfc razon_social regimen_fiscal_sat lugar_expedicion_cp'),domicilio:'address'} },
  insurance: { table:'unidad_seguros', required:['unidad_id','tipo','aseguradora','poliza'], search:'poliza', fields:{...spec('tipo aseguradora poliza','unidad_id archivo_id'),vigente_desde:'date',vigente_hasta:'date'} },
  customers: {table:'clientes',required:['razon_social'],search:'razon_social',permission:'viajes.editar',fields:spec('razon_social nombre_comercial rfc uso_cfdi forma_pago metodo_pago condiciones_pago regimen_fiscal domicilio_legal_calle domicilio_legal_ciudad domicilio_legal_estado domicilio_legal_pais domicilio_legal_codigo_postal residencia_fiscal_sat numero_registro_tributario')},
  'customer-addresses': {table:'cliente_direcciones',required:['cliente_id','nombre','calle','ciudad','estado'],search:'nombre',permission:'viajes.editar',fields:spec('nombre calle ciudad estado pais codigo_postal zona_horaria horario instrucciones tipo_ubicacion tipo_zona numero_exterior numero_interior colonia localidad municipio referencia pais_sat estado_sat municipio_sat localidad_sat colonia_sat','cliente_id','','','requiere_cita')},
  units: {table:'unidades',required:['numero_economico','tipo_unidad'],search:'numero_economico',permission:'flota.editar',statusField:'estatus',fields:spec('numero_economico placas tipo_unidad marca modelo configuracion_vehicular_sat permiso_sict_sat numero_permiso_sict vin','proveedor_id','capacidad_kg peso_vacio_kg peso_bruto_permitido_t largo_m ancho_m alto_m','anio capacidad_pallets','hazmat refrigerada')},
  trailers: {table:'cajas',required:['numero_caja','tipo_caja'],search:'numero_caja',permission:'flota.editar',statusField:'estatus',fields:spec('numero_caja placas tipo_caja subtipo_remolque_sat','proveedor_id','largo_m capacidad_kg peso_vacio_kg ancho_m alto_m','','hazmat refrigerada')},
  operators: {table:'operadores',required:['nombre','tipo'],search:'nombre',permission:'viajes.editar',fields:{...spec('nombre telefono email tipo rfc numero_licencia residencia_fiscal_sat numero_registro_tributario','proveedor_id usuario_id'),licencia_vence_el:'date',domicilio_fiscal:'address'}},
};
const child = (table, fields, keys = ['id'], scope = 'carta_porte_id') => ({table, fields, keys, scope});
export const children = {
  locations: child('cp_ubicaciones',{...spec('tipo identificador_sat zona_horaria','participante_id direccion_id','distancia_recorrida_km','posicion'),fecha_hora:'timestamp'}),
  merchandise: child('cp_mercancias',spec('descripcion bienes_transp_sat clave_unidad_sat unidad dimensiones clave_material_peligroso_sat embalaje_sat descripcion_embalaje moneda_sat fraccion_arancelaria tipo_materia_sat descripcion_materia','mercancia_id uuid_comercio_exterior','cantidad peso_kg valor_mercancia','posicion','material_peligroso')),
  sanitary: child('cp_mercancias_sanitarias',{...spec('sector_cofepris_sat ingrediente_activo nombre_quimico denominacion_generica denominacion_distintiva fabricante lote forma_farmaceutica_sat condiciones_transporte_sat registro_sanitario_autorizacion permiso_importacion folio_importacion_vucem numero_cas razon_social_importador registro_plaguicida datos_fabricante datos_formulador datos_maquilador uso_autorizado','mercancia_id'),fecha_caducidad:'date'},['mercancia_id']),
  transport: child('cp_autotransporte',spec('permiso_sict_sat numero_permiso_sict configuracion_vehicular_sat placas aseguradora_rc poliza_rc aseguradora_ambiental poliza_ambiental aseguradora_carga poliza_carga','unidad_id seguro_rc_id seguro_ambiental_id seguro_carga_id','peso_bruto_vehicular_t prima_seguro','anio_modelo'),[]),
  trailers: child('cp_remolques',spec('subtipo_remolque_sat placas','caja_id','','posicion')),
  figures: child('cp_figuras',spec('tipo_figura_sat nombre rfc numero_licencia residencia_fiscal_sat numero_registro_tributario','operador_id participante_id')),
  parts: child('cp_figura_partes',spec('parte_transporte_sat','figura_id'),['figura_id','parte_transporte_sat']),
  regimes: child('cp_regimenes_aduaneros',spec('regimen_aduanero_sat'),['regimen_aduanero_sat']),
  documents: child('cp_documentos_aduaneros',{...spec('tipo_documento_sat numero_pedimento identificador_documento rfc_importador aduana_referencia','archivo_id'),fecha_referencia:'date'}),
  links: child('cp_mercancia_documentos',spec('','mercancia_id documento_id'),['mercancia_id','documento_id']),
  allocations: child('cp_cantidades_transportadas',spec('claves_transporte_sat','mercancia_id origen_id destino_id','cantidad')),
  guides: child('cp_guias',spec('numero descripcion','mercancia_id','peso_kg')),
  concepts: child('cfdi_conceptos',spec('descripcion identificador clave_producto_servicio_sat clave_unidad_sat unidad objeto_impuesto_sat','tipo_servicio_id','cantidad valor_unitario descuento','posicion'),['id'],'cfdi_id'),
  taxes: child('cfdi_impuestos',spec('movimiento impuesto_sat tipo_factor_sat','concepto_id','base tasa_cuota'),['id'],'cfdi_id'),
  relations: child('cfdi_relaciones',spec('tipo_relacion_sat','uuid_relacionado cfdi_relacionado_id'),['id'],'cfdi_id'),
};
export const groups = {
  locations:['locations'], merchandise:['merchandise','sanitary'], transport:['transport','trailers','figures','parts'],
  customs:['regimes','documents','links'], allocations:['allocations','guides'], 'invoice-items':['concepts','taxes','relations'],
};
export const headerFields = {
  ...spec('entrada_salida pais_origen_destino_sat via_entrada_salida_sat unidad_peso_sat polo_origen_sat polo_destino_sat referencia_cliente orden_compra descripcion_carga','sat_version_id','distancia_total_km','', 'transporte_internacional logistica_inversa registro_istmo'),
};
export const invoiceFields = {
  ...spec('uso_cfdi_sat forma_pago_sat metodo_pago_sat exportacion_sat moneda lugar_expedicion_cp','cliente_id','tipo_cambio'),fecha_expedicion:'timestamp',
};

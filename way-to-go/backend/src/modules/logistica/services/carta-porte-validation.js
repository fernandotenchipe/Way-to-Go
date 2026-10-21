import { decimal } from './carta-porte-input.js';

// Revisión estructural previa. El adaptador fiscal debe completar XSD y reglas SAT.
export function validateCartaPorte(data) {
  const errors=[];
  const required=(obj,key,path)=>{if(obj?.[key]===null||obj?.[key]===undefined||obj?.[key]==='')errors.push({path:`${path}.${key}`,code:'REQUIRED',message:`Falta ${key}`});};
  const positive=(value,path)=>{try{if(decimal(String(value))<=0n)throw new Error();}catch{errors.push({path,code:'POSITIVE_DECIMAL',message:'Indica un valor positivo'});}};
  const f=data.cfdi||{};
  for(const key of ['fecha_expedicion','lugar_expedicion_cp','moneda','exportacion_sat','uso_cfdi_sat'])required(f,key,'invoice');
  for(const side of ['emisor_snapshot','receptor_snapshot'])for(const key of ['rfc','nombre','regimen_fiscal_sat'])required(f[side],key,`invoice.${side}`);
  required(f.receptor_snapshot,'domicilio_fiscal_cp','invoice.receptor_snapshot');
  required(data,'sat_version_id','header');
  if(typeof data.transporte_internacional!=='boolean')errors.push({path:'header.transporte_internacional',code:'REQUIRED',message:'Define transporte nacional o internacional'});
  if(data.transporte_internacional) {
    for(const key of ['entrada_salida','pais_origen_destino_sat','via_entrada_salida_sat'])required(data,key,'header');
    if(!data.regimes?.length)errors.push({path:'regimes',code:'REQUIRED',message:'Selecciona el régimen aduanero aplicable'});
  }
  const locations=data.locations||[];
  if(!locations.some(l=>l.tipo==='Origen')||!locations.some(l=>l.tipo==='Destino'))errors.push({path:'locations',code:'ORIGIN_DESTINATION_REQUIRED',message:'Se requieren origen y destino'});
  for(const [i,l]of locations.entries()){
    required(l,'fecha_hora',`locations[${i}]`);
    required(l.participante_snapshot,'rfc',`locations[${i}].participant`);
    for(const key of ['pais_sat','estado_sat','codigo_postal'])required(l.domicilio_snapshot,key,`locations[${i}].address`);
  }
  const ordered=[...locations].sort((a,b)=>a.posicion-b.posicion);
  for(let i=1;i<ordered.length;i++)if(Date.parse(ordered[i].fecha_hora)<Date.parse(ordered[i-1].fecha_hora))errors.push({path:'locations',code:'TIME_ORDER',message:'Revisa el orden temporal del recorrido'});
  if(!data.merchandise?.length)errors.push({path:'merchandise',code:'REQUIRED',message:'Agrega las mercancías transportadas'});
  for(const [i,m]of (data.merchandise||[]).entries()){
    for(const key of ['descripcion','bienes_transp_sat','clave_unidad_sat'])required(m,key,`merchandise[${i}]`);
    positive(m.cantidad,`merchandise[${i}].cantidad`);positive(m.peso_kg,`merchandise[${i}].peso_kg`);
    if(m.material_peligroso)for(const key of ['clave_material_peligroso_sat','embalaje_sat'])required(m,key,`merchandise[${i}]`);
  }
  const t=data.transport?.[0];
  if(!t)errors.push({path:'transport',code:'REQUIRED',message:'Selecciona autotransporte'});
  else {
    for(const key of ['placas','anio_modelo','configuracion_vehicular_sat','permiso_sict_sat','numero_permiso_sict','aseguradora_rc','poliza_rc'])required(t,key,'transport');
    positive(t.peso_bruto_vehicular_t,'transport.peso_bruto_vehicular_t');
    if(data.merchandise?.some(m=>m.material_peligroso))for(const key of ['aseguradora_ambiental','poliza_ambiental'])required(t,key,'transport');
  }
  if(!data.figures?.some(fig=>fig.tipo_figura_sat==='01'))errors.push({path:'figures',code:'OPERATOR_REQUIRED',message:'Selecciona al operador'});
  for(const [i,fig]of (data.figures||[]).entries()){
    required(fig,'nombre',`figures[${i}]`);
    if(fig.tipo_figura_sat==='01')required(fig,'numero_licencia',`figures[${i}]`);
    if(!fig.rfc&&!fig.numero_registro_tributario)errors.push({path:`figures[${i}]`,code:'TAX_ID_REQUIRED',message:'Falta la identificación fiscal'});
  }
  for(const allocation of data.allocations||[]){
    if(!locations.some(l=>l.id===allocation.origen_id&&l.tipo==='Origen')||!locations.some(l=>l.id===allocation.destino_id&&l.tipo==='Destino'))errors.push({path:'allocations',code:'LOCATION_TYPE',message:'La distribución debe conectar origen con destino del documento'});
  }
  if(!data.concepts?.length)errors.push({path:'concepts',code:'REQUIRED',message:'Agrega los conceptos del comprobante'});
  for(const [i,c]of (data.concepts||[]).entries())for(const key of ['descripcion','clave_producto_servicio_sat','clave_unidad_sat','objeto_impuesto_sat','cantidad','valor_unitario'])required(c,key,`concepts[${i}]`);
  return errors;
}

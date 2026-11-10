// NexusPlay: pegar en Extensiones > Apps Script de la hoja indicada.
// Propiedades del script: REGISTRO_TOKEN = clave privada aleatoria (mínimo 32 caracteres).
const HOJA_ID = '10JvrtW9e_xrDLzKBFEGilIcti8UUPeKjf-iDQjhnRp0';
const COLUMNAS = ['EventoId','FechaRecepcion','Aplicacion','TextoOriginal','Estado','PedidoId','RegistradoEn'];
function prepararHoja() {
  const libro=SpreadsheetApp.openById(HOJA_ID);
  const hoja=libro.getSheetByName('PagosYape')||libro.insertSheet('PagosYape');
  if(hoja.getLastRow()===0){hoja.appendRow(COLUMNAS);hoja.getRange(1,1,1,COLUMNAS.length).setBackground('#182233').setFontColor('#ffffff').setFontWeight('bold');hoja.setFrozenRows(1);hoja.autoResizeColumns(1,COLUMNAS.length);}
  const titulos=hoja.getRange(1,1,1,COLUMNAS.length).getValues()[0];
  if(titulos.join('|')!==COLUMNAS.join('|'))throw new Error('Los encabezados de PagosYape no coinciden. Conserva la hoja existente y revisa su estructura.');
  return hoja;
}
function doPost(e){
 const salida=x=>ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);
 let bloqueo;
 try{
  const datos=JSON.parse(e.postData.contents);
  const secreto=PropertiesService.getScriptProperties().getProperty('REGISTRO_TOKEN');
  if(!secreto||secreto.length<32||datos.token!==secreto)return salida({ok:false,error:'No autorizado'});
  if(!Array.isArray(datos.eventos)||datos.eventos.length>50)return salida({ok:false,error:'Lote inválido'});
  bloqueo=LockService.getScriptLock();bloqueo.waitLock(20000);
  const hoja=prepararHoja();const count=hoja.getLastRow();
  const ids=count>1?hoja.getRange(2,1,count-1,1).getValues().flat():[];
  const texto=v=>{const s=String(v==null?'':v);return /^[=+@\-]/.test(s)?"'"+s:s;};
  const aceptados=[];
  for(const a of datos.eventos){
   if(!/^[-a-zA-Z0-9_:]{16,128}$/.test(a.evento_id||''))throw new Error('Identificador inválido');
   const pos=ids.indexOf(a.evento_id);
   const fila=[a.evento_id,a.fecha_recepcion,a.aplicacion,a.texto_original,a.estado,a.pedido_id,a.registrado_en].map(texto);
   if(pos>=0)hoja.getRange(pos+2,1,1,COLUMNAS.length).setValues([fila]);
   else{hoja.appendRow(fila);ids.push(a.evento_id);}
   aceptados.push(a.evento_id);
  }
  return salida({ok:true,aceptados});
 }catch(error){return salida({ok:false,error:'No se pudo registrar el lote. Revisa permisos y estructura de la hoja.'});}
 finally{if(bloqueo)bloqueo.releaseLock();}
}

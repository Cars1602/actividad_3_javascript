export async function sincronizarRegistros(pool, url, token) {
    if(!url||!token)return {configurado:false,avisos:0,ventas:0};
    const destino=new URL(url);
    if(destino.protocol!=='https:'||destino.hostname!=='script.google.com'||!destino.pathname.endsWith('/exec'))throw new Error('Configura la URL de implementación de Apps Script.');
    const avisos=(await pool.query(`SELECT evento_id,fecha_recepcion,aplicacion,texto_original,estado,pedido_id,registrado_en
        FROM tienda.notificaciones_yape WHERE sheets_sincronizado_en IS NULL ORDER BY registrado_en LIMIT 25`)).rows;
    const ventas=(await pool.query(`SELECT id,metodo,total,estado,detalle,monto_efectivo,monto_qr,qr_verificado,creado_en
        FROM tienda.ventas WHERE sheets_sincronizado_en IS NULL ORDER BY id LIMIT 25`)).rows;
    const dinero=n=>'Bs '+Number(n).toFixed(2);
    const eventos=[...avisos,...ventas.map(v=>({
        evento_id:'venta_nexusplay_'+String(v.id).padStart(12,'0'),fecha_recepcion:v.creado_en,
        aplicacion:'NexusPlay · venta',estado:v.estado,pedido_id:v.id,registrado_en:v.creado_en,
        texto_original:'Venta #'+v.id+' · '+v.metodo+' · Total '+dinero(v.total)+' · Efectivo '+dinero(v.monto_efectivo)+' · QR '+dinero(v.monto_qr)+'\n'+
            v.detalle.map(i=>i.nombre+' × '+i.cantidad).join(', ')+'\n'+
            (v.qr_verificado?'QR asociado a un aviso del teléfono.':v.estado==='pagado'&&v.metodo!=='efectivo'?'Pago marcado como pagado en la web; sin aviso QR asociado.':'Estado registrado en la web.')
    }))];
    if(!eventos.length)return {configurado:true,avisos:0,ventas:0};
    const respuesta=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,eventos}),signal:AbortSignal.timeout(45000)});
    const resultado=await respuesta.json();
    if(!respuesta.ok||resultado.ok!==true||!Array.isArray(resultado.aceptados))throw new Error('Google no confirmó el registro.');
    const aceptados=new Set(resultado.aceptados);let a=0,v=0;
    // Solo marca la versión enviada: un cambio durante la llamada se reintentará.
    for(const aviso of avisos)if(aceptados.has(aviso.evento_id))a+=(await pool.query(`UPDATE tienda.notificaciones_yape SET sheets_sincronizado_en=now()
        WHERE evento_id=$1 AND estado=$2 AND pedido_id IS NOT DISTINCT FROM $3::integer`,[aviso.evento_id,aviso.estado,aviso.pedido_id])).rowCount;
    for(const venta of ventas)if(aceptados.has('venta_nexusplay_'+String(venta.id).padStart(12,'0')))v+=(await pool.query(`UPDATE tienda.ventas SET sheets_sincronizado_en=now()
        WHERE id=$1 AND estado=$2 AND qr_verificado=$3`,[venta.id,venta.estado,venta.qr_verificado])).rowCount;
    return {configurado:true,avisos:a,ventas:v};
}

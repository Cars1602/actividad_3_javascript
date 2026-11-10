import { createHash } from 'node:crypto';

export function normalizarNombre(valor) {
    if(typeof valor!=='string')return '';
    return valor.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
        .replace(/[^A-Z\s]/g,' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');
}

export function leerAviso(texto,aplicacion) {
    if(aplicacion!=='com.bcp.bo.wallet'||typeof texto!=='string')return null;
    // Solo el formato de ingreso observado, con nombre e importe completos.
    const m=texto.trim().match(/^Recibiste un yapeo\s*\n(?:QR DE\s+)?([^\n]+?)\s+te envi[oó]\s+Bs\.?\s*(\d+[.,]\d{2})\.?$/i);
    if(!m)return null;
    const nombre=normalizarNombre(m[1]),centavos=Number(m[2].replace(/[.,]/,''));
    if(nombre.split(' ').length<2||!Number.isSafeInteger(centavos)||centavos<=0)return null;
    // Base del identificador: se combina con la fecha original del aviso al asociarlo.
    const huella=createHash('sha256').update(aplicacion+'|'+texto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim()).digest('hex');
    return {nombre,centavos,huella};
}

// Se ejecuta dentro de la misma transacción que registra el aviso autenticado.
export async function reconciliarAviso(c,id) {
    await c.query('SELECT pg_advisory_xact_lock(853002)');
    const aviso=(await c.query('SELECT * FROM tienda.notificaciones_yape WHERE evento_id=$1 FOR UPDATE',[id])).rows[0];
    if(!aviso||aviso.pedido_id||aviso.estado!=='por_revisar')return null;
    const pago=leerAviso(aviso.texto_original,aviso.aplicacion);
    if(!pago)return null;
    const fecha=new Date(aviso.fecha_recepcion).getTime();
    if(fecha>Date.now()+60000||fecha<Date.now()-24*60*60*1000)return null;
    // Dos transferencias del mismo nombre y monto pueden tener el mismo texto.
    // Un aviso con igual contenido y fecha original no se puede reutilizar.
    const huella=createHash('sha256').update(pago.huella+'|'+new Date(fecha).toISOString()).digest('hex');
    if((await c.query('SELECT 1 FROM tienda.notificaciones_yape WHERE huella_pago=$1 AND pedido_id IS NOT NULL',[huella])).rowCount)return null;
    const candidatos=(await c.query(`SELECT id,metodo FROM tienda.ventas
        WHERE estado='pendiente' AND metodo IN ('qr','mixto') AND NOT qr_verificado
        AND nombre_pagador_clave=$1 AND monto_qr=$2::numeric/100
        AND creado_en<=$3::timestamptz AND creado_en>=$3::timestamptz-interval '30 minutes'
        ORDER BY id FOR UPDATE`,[pago.nombre,pago.centavos,aviso.fecha_recepcion])).rows;
    if(candidatos.length!==1)return null;
    const venta=candidatos[0];
    await c.query(`UPDATE tienda.notificaciones_yape SET pedido_id=$1,huella_pago=$2,
        estado='qr_detectado',sheets_sincronizado_en=NULL WHERE evento_id=$3`,[venta.id,huella,id]);
    await c.query(`UPDATE tienda.ventas SET qr_verificado=true,sheets_sincronizado_en=NULL,estado=CASE WHEN metodo='qr' THEN 'pagado' ELSE estado END WHERE id=$1`,[venta.id]);
    return {pedido_id:venta.id,estado:venta.metodo==='qr'?'pagado':'pendiente'};
}

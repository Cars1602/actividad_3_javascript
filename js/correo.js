
// Solo descarga portadas de proveedores conocidos; nunca URLs arbitrarias desde el servidor.
async function portadaPDF(origen) {
    if (typeof origen !== 'string') return null;
    if (/^data:image\/(png|jpeg);base64,/i.test(origen)) {
        const datos = Buffer.from(origen.split(',')[1], 'base64');
        return datos.length <= 2000000 ? datos : null;
    }
    try {
        const url = new URL(origen);
        if (url.protocol !== 'https:' || !['shared.fastly.steamstatic.com','cdn.akamai.steamstatic.com','cdn.cloudflare.steamstatic.com'].includes(url.hostname)) return null;
        const respuesta = await fetch(url, {signal:AbortSignal.timeout(8000), redirect:'error'});
        if (!respuesta.ok || !/^image\/(png|jpeg)/i.test(respuesta.headers.get('content-type') || '')) return null;
        const partes = []; let longitud = 0;
        for await (const parte of respuesta.body) {
            longitud += parte.length;
            if (longitud > 2000000) { await respuesta.body.cancel().catch(()=>{}); return null; }
            partes.push(Buffer.from(parte));
        }
        return Buffer.concat(partes);
    } catch { return null; }
}

export async function crearPDF(venta) {
    const { default: PDFDocument } = await import('pdfkit');
    const detalle = typeof venta.detalle === 'string' ? JSON.parse(venta.detalle) : venta.detalle;
    const portadas = [];
    for (const item of detalle) portadas.push(await portadaPDF(item.imagen));
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({size:[420,700], margin:28, info:{Title:'Pago confirmado',Author:'NexusPlay'}});
        const partes = [];
        doc.on('data', parte => partes.push(parte));
        doc.on('end', () => resolve(Buffer.concat(partes)));
        doc.on('error', reject);
        const dinero = valor => 'Bs ' + Number(valor).toFixed(2);
        const cabecera = () => {
            doc.rect(0,0,420,135).fill('#101722');
            doc.fillColor('#b5ff47').font('Helvetica-Bold').fontSize(17).text('NEXUSPLAY',28,25);
            doc.fillColor('#ffffff').fontSize(30).text('Pago confirmado',28,59);
            doc.font('Helvetica').fontSize(11).fillColor('#c5d0df').text('Pedido #' + venta.id,28,105);
        };
        cabecera();
        doc.fillColor('#526078').fontSize(10).text('COMPRADOR',28,157);
        doc.fillColor('#172133').font('Helvetica-Bold').fontSize(14).text(venta.cliente_nombre,28,174,{width:364});
        doc.font('Helvetica').fontSize(10).fillColor('#526078').text(new Date(venta.creado_en).toLocaleString('es-BO',{timeZone:'America/La_Paz'})+' (Bolivia)',28,213);
        doc.text('Pago: '+({efectivo:'Efectivo',qr:'QR',mixto:'Efectivo + QR'}[venta.metodo]||venta.metodo),28,230);
        let y=266;
        detalle.forEach((item,indice) => {
            if (y+160>590) {doc.addPage();cabecera();y=157;}
            doc.roundedRect(28,y,364,142,10).fill('#edf1f6');
            if (portadas[indice]) {
                try {doc.image(portadas[indice],40,y+12,{fit:[154,91],align:'center',valign:'center'});} catch {doc.fillColor('#526078').fontSize(12).text('NEXUSPLAY',40,y+45);}
            } else {doc.fillColor('#526078').fontSize(12).text('NEXUSPLAY',40,y+45);}
            doc.fillColor('#172133').font('Helvetica-Bold').fontSize(15).text(item.nombre,207,y+14,{width:170,height:52,ellipsis:true});
            doc.font('Helvetica').fontSize(11).text(item.cantidad+' x '+dinero(item.precio),207,y+77,{width:170});
            doc.font('Helvetica-Bold').fontSize(15).text(dinero(Math.round(Number(item.precio)*100)*item.cantidad/100),40,y+113);
            y+=156;
        });
        if(y+104>660){doc.addPage();cabecera();y=157;}
        doc.roundedRect(28,y,364,62,8).fill('#dcf4c6');
        doc.fillColor('#172133').font('Helvetica').fontSize(12).text('TOTAL PAGADO',42,y+12);
        doc.font('Helvetica-Bold').fontSize(25).text(dinero(venta.total),42,y+29);
        doc.font('Helvetica').fontSize(10).fillColor('#526078').text('Gracias por tu compra. Disfruta tu próxima aventura.',28,y+77,{width:364});
        doc.fontSize(8).text('Comprobante de compra sin validez fiscal.',28,y+94);
        doc.end();
    });
}

let trabajando = false;
export async function enviarConfirmaciones(pool) {
    if (trabajando || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN || !process.env.GMAIL_FROM) return;
    trabajando = true;
    let conexion;
    try {
        conexion = await pool.connect();
        const bloqueo = await conexion.query('SELECT pg_try_advisory_lock(853003) AS adquirido');
        if (!bloqueo.rows[0].adquirido) return;
        try {
            const { default: nodemailer } = await import('nodemailer');
            // Nodemailer compone MIME; la entrega se hace por HTTPS a Gmail API.
            const transporte = nodemailer.createTransport({streamTransport:true, buffer:true});
            const respuesta = await fetch('https://oauth2.googleapis.com/token', {
                method:'POST', signal:AbortSignal.timeout(20000),
                body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, refresh_token:process.env.GOOGLE_REFRESH_TOKEN, grant_type:'refresh_token'})
            });
            if (!respuesta.ok) { await conexion.query("UPDATE tienda.ventas SET correo_error='Autorización de Google rechazada; revisar credenciales' WHERE estado='pagado' AND cliente_email<>'' AND correo_enviado_en IS NULL"); throw new Error('No se pudo autorizar Gmail API.'); }
            const autorizacion = await respuesta.json();
            const {rows} = await conexion.query("SELECT * FROM tienda.ventas WHERE estado='pagado' AND cliente_email<>'' AND correo_enviado_en IS NULL ORDER BY id LIMIT 10");
            for (const venta of rows) {
                try {
                    const mensaje = await transporte.sendMail({
                        from: process.env.GMAIL_FROM, to: venta.cliente_email,
                        subject: 'Pago confirmado',
                        messageId: '<nexusplay-pedido-' + venta.consulta_token + '@nexusplay.local>',
                        text: 'Hola ' + venta.cliente_nombre + ', tu pago fue confirmado. Adjuntamos el comprobante de los videojuegos comprados. Gracias por tu compra.',
                        attachments: [{filename: 'NexusPlay-pedido-' + venta.id + '.pdf', content: await crearPDF(venta), contentType:'application/pdf'}]
                    });
                    const envio = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                        method:'POST', signal:AbortSignal.timeout(30000),
                        headers:{Authorization:'Bearer ' + autorizacion.access_token, 'Content-Type':'application/json'},
                        body:JSON.stringify({raw:mensaje.message.toString('base64url')})
                    });
                    if (!envio.ok) throw new Error('Gmail no aceptó el mensaje.');
                    await conexion.query("UPDATE tienda.ventas SET correo_enviado_en=now(),correo_error='' WHERE id=$1", [venta.id]);
                } catch { await conexion.query("UPDATE tienda.ventas SET correo_error='No se pudo entregar el PDF a Gmail; revisar Logs de Render' WHERE id=$1",[venta.id]); console.error('No se pudo enviar el comprobante del pedido #' + venta.id); }
            }
        } finally { await conexion.query('SELECT pg_advisory_unlock(853003)'); }
    } finally { conexion?.release(); trabajando = false; }
}

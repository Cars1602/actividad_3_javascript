
export async function crearPDF(venta) {
    const { default: PDFDocument } = await import('pdfkit');
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 48 });
        const partes = [];
        doc.on('data', parte => partes.push(parte));
        doc.on('end', () => resolve(Buffer.concat(partes)));
        doc.on('error', reject);
        const dinero = valor => 'Bs ' + Number(valor).toFixed(2);
        doc.fontSize(24).text('NexusPlay');
        doc.fontSize(17).text('Confirmación de pago');
        doc.moveDown().fontSize(11).text('Pedido #' + venta.id);
        doc.text('Comprador: ' + venta.cliente_nombre);
        doc.text('Fecha del pedido: ' + new Date(venta.creado_en).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }));
        doc.text('Forma de pago: ' + ({efectivo:'Efectivo',qr:'QR',mixto:'Efectivo + QR'}[venta.metodo] || venta.metodo));
        doc.moveDown().text('Productos comprados:');
        const detalle = typeof venta.detalle === 'string' ? JSON.parse(venta.detalle) : venta.detalle;
        for (const item of detalle) {
            doc.moveDown(.5).text(item.nombre);
            doc.text(item.cantidad + ' x ' + dinero(item.precio) + ' = ' + dinero(Math.round(Number(item.precio) * 100) * item.cantidad / 100));
        }
        doc.moveDown().fontSize(16).text('Total pagado: ' + dinero(venta.total));
        doc.moveDown().fontSize(10).text('Pago confirmado. Gracias por tu compra.');
        doc.text('Comprobante de compra sin validez fiscal.');
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
            if (!respuesta.ok) throw new Error('No se pudo autorizar Gmail API.');
            const autorizacion = await respuesta.json();
            const {rows} = await conexion.query("SELECT * FROM tienda.ventas WHERE estado='pagado' AND cliente_email<>'' AND correo_enviado_en IS NULL ORDER BY id LIMIT 10");
            for (const venta of rows) {
                try {
                    const mensaje = await transporte.sendMail({
                        from: process.env.GMAIL_FROM, to: venta.cliente_email,
                        subject: 'NexusPlay: pago confirmado del pedido #' + venta.id,
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
                    await conexion.query('UPDATE tienda.ventas SET correo_enviado_en=now() WHERE id=$1', [venta.id]);
                } catch { console.error('No se pudo enviar el comprobante del pedido #' + venta.id); }
            }
        } finally { await conexion.query('SELECT pg_advisory_unlock(853003)'); }
    } finally { conexion?.release(); trabajando = false; }
}

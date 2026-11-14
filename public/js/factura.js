// La clave permanece en el fragmento de la URL: no se envía como ruta de la página.
$(function () {
    const clave = location.hash.slice(1);
    const dinero = valor => 'Bs ' + Number(valor).toFixed(2);
    let consultando = false;

    async function cargarFactura() {
        if (consultando) return;
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clave)) {
            $('#estado').text('Abre la factura desde el pedido confirmado en la tienda.');
            return;
        }
        consultando = true;
        $('#factura,#imprimir').prop('hidden', true);
        $('#estado').prop('hidden', false);
        $('#reintentar').prop('hidden', true);
        $('#estado').text('Consultando tu pedido…');
        try {
            const pedido = await $.ajax({ url: '/api/pedidos/' + encodeURIComponent(clave), dataType: 'json', timeout: 20000, cache: false });
            if (pedido.estado !== 'pagado') {
                $('#estado').text('Tu pedido está pendiente de pago. La factura estará disponible cuando se confirme.');
                $('#reintentar').prop('hidden', false);
                return;
            }
            // Se usan los precios de la venta guardada, aunque cambie el catálogo.
            const detalle = typeof pedido.detalle === 'string' ? JSON.parse(pedido.detalle) : pedido.detalle;
            if (!Array.isArray(detalle) || !detalle.length) throw new Error('El pedido no contiene el detalle de los productos.');
            const fecha = new Date(pedido.creado_en);
            if (!Number.isFinite(fecha.getTime())) throw new Error('No se pudo consultar la fecha del pedido.');
            const metodos = { efectivo: 'Efectivo', qr: 'QR', mixto: 'Efectivo + QR' };
            $('#numero').text('Pedido #' + pedido.id);
            document.title = 'Factura pedido #' + pedido.id + ' · NexusPlay';
            $('#fecha').text(fecha.toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) + ' (Bolivia)');
            $('#metodo').text(metodos[pedido.metodo] || pedido.metodo);
            $('#titular').prop('hidden', !pedido.nombre_pagador).text('Titular del pago QR: ' + (pedido.nombre_pagador || ''));
            const filas = detalle.map(item => {
                const fila = $('<tr>');
                $('<td>').text(item.nombre).appendTo(fila);
                $('<td>').text(item.cantidad).appendTo(fila);
                $('<td>').text(dinero(item.precio)).appendTo(fila);
                const subtotal = Math.round(Number(item.precio) * 100) * Number(item.cantidad) / 100;
                $('<td>').text(dinero(subtotal)).appendTo(fila);
                return fila;
            });
            $('#productos-factura').empty().append(filas);
            $('#efectivo').text(dinero(pedido.monto_efectivo));
            $('#qr').text(dinero(pedido.monto_qr));
            const tieneEfectivo = ['efectivo', 'mixto'].includes(pedido.metodo) && pedido.recibido != null;
            $('#fila-recibido,#fila-cambio').prop('hidden', !tieneEfectivo);
            $('#recibido').text(dinero(pedido.recibido));
            $('#cambio').text(dinero(Math.max(0, (Math.round(Number(pedido.recibido) * 100) - Math.round(Number(pedido.monto_efectivo) * 100)) / 100)));
            $('#total-factura').text(dinero(pedido.total));
            $('#estado').prop('hidden', true);
            $('#factura,#imprimir').prop('hidden', false);
        } catch (error) {
            $('#estado').text(error.responseJSON?.error || (error instanceof Error ? error.message : 'No se pudo cargar la factura. Vuelve a intentarlo.'));
            $('#reintentar').prop('hidden', false);
        } finally { consultando = false; }
    }
    $('#reintentar').on('click', cargarFactura);
    $('#imprimir').on('click', () => window.print());
    cargarFactura();
});

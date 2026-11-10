// Selectores #id, .clase y atributos, eventos delegados y efectos de jQuery.
$(function () {
    let productos = [], carrito = [], ocupado = false, pedidoToken = '';
    let solicitudDemo=0,temporizadorDemo;
    const dinero = n => 'Bs ' + Number(n).toFixed(2);
    const total = () => carrito.reduce((s, i) => s + Math.round(Number(i.precio) * 100) * i.cantidad, 0) / 100;
    function mensaje(t, error = false) { $('#mensaje').text(t).toggleClass('error', error).stop(true, true).hide().fadeIn(180); }
    async function api(ruta, method = 'GET', data) { return $.ajax({ url: '/api/' + ruta, method, contentType: 'application/json', data: data ? JSON.stringify(data) : undefined }); }
    function fallo(e) { mensaje(e.responseJSON?.error || 'No se pudo conectar con el servidor.', true); }
    async function cargar() {
        try {
            const datos = await api('productos');
            if (!Array.isArray(datos)) throw new Error('Respuesta de catálogo inválida');
            productos = datos; catalogo(); $('#reintentar-catalogo').prop('hidden',true);
        } catch (e) {
            $('#sin-productos').text('No se pudo actualizar el inventario. Puedes reintentar la carga.').show();
            $('#reintentar-catalogo').prop('hidden',false);
            throw e;
        }
    }
    $('#reintentar-catalogo').on('click',function(){cargar().catch(fallo);});
    function catalogo() {
        $('#catalogo').empty(); const texto = $('#buscar').val().toLowerCase();
        const visibles = productos.filter(p => p.nombre.toLowerCase().includes(texto));
        $('#sin-productos').text(productos.length ? 'No hay coincidencias.' : 'Aún no hay videojuegos. Agrégalos desde el panel admin.').toggle(!visibles.length);
        visibles.forEach(p => {
            const fila = $('<article class="producto">');
            const datos = $('<div>');
            datos.append($('<small class="categoria">').text(p.categoria || 'General'),
                $('<h3>').text(p.nombre), $('<strong>').text(dinero(p.precio)),
                $('<p>').text(p.stock + ' disponibles'), $('<p>').text(p.descripcion || ''));
            if (p.imagen) fila.append($('<img class="foto-producto">').attr({ src:p.imagen, alt:p.nombre }));
            else fila.append($('<div class="sin-foto">').text('Sin imagen'));
            fila.append(datos, $('<button class="agregar">').attr('data-id',p.id).text('Agregar +').prop('disabled',p.stock === 0));
            $('#catalogo').append(fila.hide()); fila.fadeIn(180);
        });
    }
    function dibujar() {
        $('#carrito').empty(); carrito.forEach(i => { const fila = $('<div class="fila">').attr('data-id', i.id); fila.append($('<h3>').text(i.nombre)); const acciones = $('<div class="acciones">'); acciones.append($('<input type="number" min="1" step="1" class="cantidad">').attr({ 'max': i.stock, 'aria-label': 'Cantidad de ' + i.nombre }).val(i.cantidad), $('<span>').text(dinero(Number(i.precio) * i.cantidad)), $('<button class="quitar secundario">').text('Quitar')); fila.append(acciones); $('#carrito').append(fila); });
        $('#vacio').toggle(!carrito.length); $('#total').text(dinero(total())); $('#contador').text(carrito.reduce((s, i) => s + i.cantidad, 0) + ' unidades'); $('#cobrar,#vaciar').prop('disabled', ocupado || !carrito.length); cambio();
        if($('[name=metodo]:checked').val()==='qr_demo')programarDemo();
    }
    function cambio() { const recibido = Number($('#recibido').val()); $('#cambio').text(dinero(Math.max(0, recibido - total()))); $('#saldo-qr').text(dinero(Math.max(0, Math.round(total() * 100 - Math.round(recibido * 100)) / 100))); }
    $('#buscar').on('input', catalogo);
    $('#catalogo').on('click', '.agregar', function () { if (ocupado) return; const p = productos.find(p => p.id === Number($(this).attr('data-id'))); let i = carrito.find(i => i.id === p.id); if ((i?.cantidad || 0) >= p.stock) return mensaje('No hay más existencias disponibles.', true); if (i) i.cantidad++; else carrito.push({ ...p, cantidad: 1 }); dibujar(); $('#total').stop(true, true).fadeOut(80).fadeIn(150); });
    $('#carrito').on('change', '.cantidad', function () { const i = carrito.find(i => i.id === Number($(this).closest('.fila').attr('data-id'))); const n = Number(this.value); if (!Number.isInteger(n) || n < 1 || n > i.stock) { this.value = i.cantidad; return mensaje('Cantidad fuera de las existencias disponibles.', true); } i.cantidad = n; dibujar(); });
    $('#carrito').on('click', '.quitar', function () { if (ocupado) return; const fila = $(this).closest('.fila'); const id = Number(fila.attr('data-id')); fila.slideUp(160, () => { carrito = carrito.filter(i => i.id !== id); dibujar(); }); });
    $('#vaciar').on('click', () => { if (confirm('¿Vaciar el carrito?')) { carrito = []; dibujar(); } });
    $('[name=metodo]').on('change', function () {
        const demo=this.value==='qr_demo',mixto=this.value==='mixto',qr=this.value==='qr'||mixto;
        solicitudDemo++;clearTimeout(temporizadorDemo);
        $('#efectivo').prop('hidden',demo||this.value==='qr');$('#qr').prop('hidden',!qr);$('#qr-demo').prop('hidden',!demo);
        $('#nombre-pagador').prop('required',qr);$('#recibido').prop('required',!demo&&this.value!=='qr');
        $('#resumen-saldo').prop('hidden',!mixto);$('#resumen-cambio').prop('hidden',mixto);
        $('#cobrar').text(demo?'Actualizar QR de prueba':'Confirmar pago');
        cambio();if(qr)cargarQR();if(demo){$('#seguimiento,#aviso-pago').prop('hidden',true);programarDemo();}else if(pedidoToken)consultarPago();
    });
    function programarDemo(){
        clearTimeout(temporizadorDemo);solicitudDemo++;
        $('#monto-demo').text(dinero(total()));$('#imagen-qr-demo').prop('hidden',true);
        $('#estado-demo').text(carrito.length?'Generando QR de demostración…':'Agrega productos al carrito para ver el QR con monto.');
        if(carrito.length)temporizadorDemo=setTimeout(()=>generarDemo().catch(fallo),180);
    }
    async function generarDemo(){
        if(!carrito.length)return;
        const turno=++solicitudDemo;
        try{
            const r=await api('qr-demostracion','POST',{items:carrito.map(i=>({id:i.id,cantidad:i.cantidad}))});
            if(turno!==solicitudDemo||$('[name=metodo]:checked').val()!=='qr_demo')return;
            $('#monto-demo').text(dinero(r.total));$('#imagen-qr-demo').attr('src',r.imagen).prop('hidden',false);
            $('#estado-demo').text('QR de prueba listo. No realiza ningún cobro.');
        }catch(e){if(turno===solicitudDemo){$('#imagen-qr-demo').prop('hidden',true);$('#estado-demo').text('No se pudo generar el QR. Pulsa Actualizar QR de prueba.');throw e;}}
    }
    $('#recibido').prop('required', true).on('input', cambio);
    async function cargarQR() { try { const c = await api('configuracion'); if (c.qr_imagen) { $('#imagen-qr').attr('src', c.qr_imagen).prop('hidden', false); $('#estado-qr').text(''); } else { $('#imagen-qr').removeAttr('src').prop('hidden', true); $('#estado-qr').text('El negocio todavía no configuró su QR.'); } } catch (e) { $('#imagen-qr').removeAttr('src').prop('hidden', true); fallo(e); } }

    let temporizadorPago = null, consultandoPago = false;
    async function consultarPago(manual = false) {
        if (!pedidoToken || consultandoPago) return;
        const clave = pedidoToken;
        consultandoPago = true; clearTimeout(temporizadorPago);
        $('#verificar-pago').prop('disabled',true).text('Actualizando…');
        try {
            const pedido = await api('pedidos/' + clave);
            if (pedidoToken === clave) mostrarPedido(pedido);
        } catch (e) {
            if (manual) fallo(e);
            if (pedidoToken === clave) {
                $('#estado-consulta').text('Reconectando… Tu pedido sigue guardado. No vuelvas a pagar.');
                temporizadorPago = setTimeout(() => consultarPago(),15000);
            }
        } finally { consultandoPago = false; $('#verificar-pago').prop('disabled',false).text('Actualizar pago'); }
    }
    function mostrarPedido(v) {
        const pagado = v.estado === 'pagado', qrRecibido = Boolean(v.qr_verificado);
        $('#seguimiento').prop('hidden',$('[name=metodo]:checked').val()==='qr_demo').toggleClass('pago-confirmado',pagado);
        $('#numero-pedido').text('Pedido #' + v.id);
        $('#importes-pedido').text('Total: ' + dinero(v.total) + ' · Efectivo: ' + dinero(v.monto_efectivo) + ' · QR: ' + dinero(v.monto_qr));
        $('#estado-pedido').text(pagado ? '¡Pago confirmado! Tu pedido está pagado.' : qrRecibido ? 'Llegó tu pago QR. Falta confirmar la entrega del efectivo.' : 'Esperando el aviso de tu pago QR. La pantalla se actualizará cuando se confirme.');
        $('#estado-consulta').text(pagado ? 'Confirmación recibida del servidor.' : 'Verificación automática cada 8 segundos. Si ya pagaste, no vuelvas a transferir.');
        $('#verificar-pago').prop('disabled',false).text('Actualizar pago');
        $('#comprobante-confirmado').prop('hidden',!pagado);
        $('#detalle-confirmacion').text('Pedido #' + v.id + ' · Total pagado: ' + dinero(v.total));
        $('#aviso-pago').prop('hidden',$('[name=metodo]:checked').val()==='qr_demo'||(!pagado && !qrRecibido)).toggleClass('pago-completo',pagado);
        $('#aviso-pago-titulo').text(pagado ? '✓ Pago confirmado' : 'QR recibido · Efectivo pendiente');
        $('#aviso-pago-detalle').text('Pedido #' + v.id + ' · ' + (pagado ? dinero(v.total) + ' pagados.' : dinero(v.monto_qr) + ' recibidos por QR.'));
        clearTimeout(temporizadorPago);
        if (!pagado) temporizadorPago = setTimeout(() => consultarPago(),8000);
    }
    $('#verificar-pago').on('click',() => consultarPago(true));
    $('#pago').on('submit', async function (e) {
        e.preventDefault(); if (ocupado || !carrito.length) return;
        const metodo = $('[name=metodo]:checked').val();
        if(metodo==='qr_demo'){clearTimeout(temporizadorDemo);try{await generarDemo();}catch(e){fallo(e);}return;}
        if (metodo !== 'efectivo' && !$('#imagen-qr').attr('src')) return mensaje('El negocio aún no configuró su QR.', true);
        if (!confirm('¿Registrar este pago por ' + dinero(total()) + ' para su verificación?')) return;
        ocupado = true; $('#pago input,#carrito input,#carrito button,#catalogo button').prop('disabled', true); dibujar(); $('#carrito input,#carrito button').prop('disabled', true);
        try {
            const v = await api('ventas', 'POST', { items: carrito.map(i => ({ id: i.id, cantidad: i.cantidad })), metodo, recibido: Number($('#recibido').val()), nombre_pagador: $('#nombre-pagador').val().trim() });
            pedidoToken = v.consulta_token; try { localStorage.setItem('nexus-pedido', pedidoToken); } catch { }
            mostrarPedido(v); carrito = []; $('#recibido').val(''); mensaje('Pedido #' + v.id + ' registrado. Consulta el resultado en «Actualizar pago».'); await cargar();
        } catch (e) { fallo(e); } finally { ocupado = false; $('#pago input,#catalogo button').prop('disabled', false); catalogo(); dibujar(); }
    });
    try { pedidoToken = localStorage.getItem('nexus-pedido') || ''; } catch { }
    if (pedidoToken) consultarPago();
    dibujar(); cargar().catch(fallo);
});

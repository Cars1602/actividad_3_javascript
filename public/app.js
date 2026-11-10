// Selectores #id, .clase y atributos, eventos delegados y efectos de jQuery.
$(function () {
    let productos = [], carrito = [], ocupado = false;
    const dinero = n => 'Bs ' + Number(n).toFixed(2);
    const total = () => carrito.reduce((s, i) => s + Math.round(Number(i.precio) * 100) * i.cantidad, 0) / 100;
    function mensaje(t, error = false) { $('#mensaje').text(t).toggleClass('error', error).stop(true, true).hide().fadeIn(180); }
    async function api(ruta, method = 'GET', data) { return $.ajax({ url: '/api/' + ruta, method, contentType: 'application/json', data: data ? JSON.stringify(data) : undefined }); }
    function fallo(e) { mensaje(e.responseJSON?.error || 'No se pudo conectar con el servidor.', true); }
    async function cargar() { productos = await api('productos'); catalogo(); }
    function catalogo() {
        $('#catalogo').empty(); const texto = $('#buscar').val().toLowerCase();
        const visibles = productos.filter(p => p.nombre.toLowerCase().includes(texto));
        $('#sin-productos').text(productos.length ? 'No hay coincidencias.' : 'Aún no hay videojuegos. Agrégalos desde el panel admin.').toggle(!visibles.length);
        visibles.forEach(p => { const fila = $('<article class="producto">'); const datos = $('<div>'); datos.append($('<h3>').text(p.nombre), $('<strong>').text(dinero(p.precio)), $('<p>').text(p.stock + ' disponibles')); if (p.imagen) fila.append($('<img class="foto-producto">').attr({ src: p.imagen, alt: p.nombre })); else fila.append($('<div class="sin-foto">').text('Sin imagen')); datos.prepend($('<small class="categoria">').text(p.categoria || 'General')); datos.append($('<p>').text(p.descripcion || '')); fila.append(datos, $('<button class="agregar">').attr('data-id', p.id).text('Agregar +').prop('disabled', p.stock === 0)); $('#catalogo').append(fila.hide()); fila.fadeIn(180); });
    }
    function dibujar() {
        $('#carrito').empty(); carrito.forEach(i => { const fila = $('<div class="fila">').attr('data-id', i.id); fila.append($('<h3>').text(i.nombre)); const acciones = $('<div class="acciones">'); acciones.append($('<input type="number" min="1" step="1" class="cantidad">').attr({ 'max': i.stock, 'aria-label': 'Cantidad de ' + i.nombre }).val(i.cantidad), $('<span>').text(dinero(Number(i.precio) * i.cantidad)), $('<button class="quitar secundario">').text('Quitar')); fila.append(acciones); $('#carrito').append(fila); });
        $('#vacio').toggle(!carrito.length); $('#total').text(dinero(total())); $('#contador').text(carrito.reduce((s, i) => s + i.cantidad, 0) + ' unidades'); $('#cobrar,#vaciar').prop('disabled', ocupado || !carrito.length); cambio();
    }
    function cambio() { const recibido = Number($('#recibido').val()); $('#cambio').text(dinero(Math.max(0, recibido - total())));$('#saldo-qr').text(dinero(Math.max(0,Math.round(total()*100-Math.round(recibido*100))/100))); }
    $('#buscar').on('input', catalogo);
    $('#catalogo').on('click', '.agregar', function () { if (ocupado) return; const p = productos.find(p => p.id === Number($(this).attr('data-id'))); let i = carrito.find(i => i.id === p.id); if ((i?.cantidad || 0) >= p.stock) return mensaje('No hay más existencias disponibles.', true); if (i) i.cantidad++; else carrito.push({ ...p, cantidad: 1 }); dibujar(); $('#total').stop(true, true).fadeOut(80).fadeIn(150); });
    $('#carrito').on('change', '.cantidad', function () { const i = carrito.find(i => i.id === Number($(this).closest('.fila').attr('data-id'))); const n = Number(this.value); if (!Number.isInteger(n) || n < 1 || n > i.stock) { this.value = i.cantidad; return mensaje('Cantidad fuera de las existencias disponibles.', true); } i.cantidad = n; dibujar(); });
    $('#carrito').on('click', '.quitar', function () { if (ocupado) return; const fila = $(this).closest('.fila'); const id = Number(fila.attr('data-id')); fila.slideUp(160, () => { carrito = carrito.filter(i => i.id !== id); dibujar(); }); });
    $('#vaciar').on('click', () => { if (confirm('¿Vaciar el carrito?')) { carrito = []; dibujar(); } });
    $('[name=metodo]').on('change', function () {
        const mixto=this.value==='mixto', qr=this.value!=='efectivo';
        $('#efectivo').prop('hidden',this.value==='qr');$('#qr').prop('hidden',!qr);
        $('#recibido').prop('required',this.value!=='qr');$('#resumen-saldo').prop('hidden',!mixto);
        $('#resumen-cambio').prop('hidden',mixto);$('#cobrar').text(qr?'Registrar pedido pendiente':'Registrar cobro');
        cambio();if(qr)cargarQR();
    });
    $('#recibido').prop('required', true).on('input', cambio);
    async function cargarQR() { try { const c = await api('configuracion'); if (c.qr_imagen) { $('#imagen-qr').attr('src', c.qr_imagen).prop('hidden', false); $('#estado-qr').text(''); } else { $('#imagen-qr').removeAttr('src').prop('hidden', true); $('#estado-qr').text('El negocio todavía no configuró su QR.'); } } catch (e) { $('#imagen-qr').removeAttr('src').prop('hidden', true); fallo(e); } }

    $('#pago').on('submit', async function (e) { e.preventDefault(); if (ocupado || !carrito.length) return; const metodo = $('[name=metodo]:checked').val(); if (metodo !== 'efectivo' && !$('#imagen-qr').attr('src')) return mensaje('El QR no está disponible. Solicita al administrador configurarlo.', true); ocupado = true; $('#pago input,#carrito input,#carrito button,#catalogo button').prop('disabled', true); dibujar(); $('#carrito input,#carrito button').prop('disabled', true); try { const v = await api('ventas', 'POST', { items: carrito.map(i => ({ id: i.id, cantidad: i.cantidad })), metodo, recibido: Number($('#recibido').val()) }); carrito = []; $('#recibido').val(''); mensaje(metodo !== 'efectivo' ? 'Pedido #' + v.id + ' · Efectivo: '+dinero(v.monto_efectivo)+' · QR: '+dinero(v.monto_qr)+' · Pendiente de verificar. Guarda este número de pedido.' : 'Venta #' + v.id + ' pagada. Cambio: ' + dinero(Number(v.recibido) - Number(v.total))); await cargar(); } catch (e) { fallo(e); } finally { ocupado = false; $('#pago input,#catalogo button').prop('disabled', false); catalogo(); dibujar(); } });
    dibujar(); cargar().catch(fallo);
});

// Selectores #id, .clase y atributos, eventos delegados y efectos de jQuery.
$(function () {
    let productos = [], carrito = [], ocupado = false, pedidoToken = '';
    let solicitudDemo=0,temporizadorDemo;
    const dinero = n => 'Bs ' + Number(n).toFixed(2);
    const total = () => carrito.reduce((s, i) => s + Math.round(Number(i.precio) * 100) * i.cantidad, 0) / 100;
    const mensaje = NexusUI.mensaje;
    async function api(ruta, method = 'GET', data) { return $.ajax({ url: '/api/' + ruta, method, contentType: 'application/json', data: data ? JSON.stringify(data) : undefined }); }
    function fallo(e, formulario) { mensaje(e.responseJSON?.error || 'No se pudo conectar con el servidor.', true, formulario); }
    let cargaCatalogo = null, ultimaActualizacion = null;
    let catalogoCargado = false;
    const productosActualizados = new Set();

    function mostrarHoraActualizacion() {
        if (!ultimaActualizacion) return;
        const segundos = Math.floor((Date.now() - ultimaActualizacion.getTime()) / 1000);
        const texto = segundos < 30 ? 'Actualizado hace unos segundos'
            : segundos < 60 ? 'Actualizado hace ' + segundos + ' s'
                : 'Actualizado hace ' + Math.floor(segundos / 60) + ' min';
        $('#ultima-actualizacion').text(texto).attr({
            datetime: ultimaActualizacion.toISOString(),
            title: ultimaActualizacion.toLocaleTimeString('es-BO')
        });
    }

    function sincronizarCarrito() {
        const avisos = [];
        let cambiado = false;
        carrito = carrito.flatMap(item => {
            const producto = productos.find(p => p.id === item.id);
            if (!producto || producto.stock === 0) {
                avisos.push('«' + item.nombre + '» dejó de estar disponible y se retiró del carrito.');
                cambiado = true;
                return [];
            }
            const cantidad = Math.min(item.cantidad, producto.stock);
            if (cantidad !== item.cantidad) avisos.push('«' + producto.nombre + '» se ajustó a ' + cantidad + (cantidad === 1 ? ' unidad disponible.' : ' unidades disponibles.'));
            if (Number(item.precio) !== Number(producto.precio)) avisos.push('El precio de «' + producto.nombre + '» cambió a ' + dinero(producto.precio) + '.');
            cambiado ||= cantidad !== item.cantidad || ['nombre', 'precio', 'stock', 'imagen'].some(campo => String(item[campo]) !== String(producto[campo]));
            return [{ ...producto, cantidad }];
        });
        if (avisos.length) $('#aviso-carrito').text(avisos.join(' ')).prop('hidden', false);
        if (cambiado) dibujar();
    }

    async function actualizarCatalogo(silenciosa) {
        const primeraCarga = !catalogoCargado;
        $('#catalogo').attr('aria-busy', 'true');
        $('#catalogo-carga').prop('hidden', !primeraCarga);
        if (primeraCarga) $('#sin-productos').prop('hidden', true);
        $('#estado-catalogo').text(primeraCarga ? 'Consultando inventario…' : 'Actualizando inventario…').removeClass('sin-conexion').addClass('actualizando');
        try {
            const datos = await api('productos');
            if (!Array.isArray(datos)) throw new Error('Respuesta de catálogo inválida');
            // Durante el envío de una compra, la respuesta del pedido tiene prioridad.
            if (silenciosa && ocupado) {
                $('#estado-catalogo').text('La actualización continuará después del pago.');
                return;
            }
            const anteriores = new Map(productos.map(p => [p.id, p]));
            const campos = ['nombre', 'precio', 'stock', 'imagen', 'descripcion', 'categoria'];
            datos.forEach(producto => {
                const anterior = anteriores.get(producto.id);
                if (catalogoCargado && (!anterior || campos.some(campo => String(anterior[campo]) !== String(producto[campo])))) {
                    productosActualizados.add(producto.id);
                }
            });
            const cambioCatalogo = primeraCarga || productos.length !== datos.length || productosActualizados.size > 0;
            productos = datos;
            catalogoCargado = true;
            if (cambioCatalogo) {
                cargarFiltros();
                catalogo();
                if (!ocupado) sincronizarCarrito();
            }
            ultimaActualizacion = new Date();
            mostrarHoraActualizacion();
            $('#estado-catalogo').text('Inventario actualizado');
            $('#reintentar-catalogo').prop('hidden', true);
        } catch (e) {
            $('#estado-catalogo').text('Sin conexión. Reintentando la actualización…').addClass('sin-conexion');
            if (!catalogoCargado) $('#sin-productos').text('No se pudo cargar el inventario. Pulsa Reintentar.').prop('hidden', false);
            $('#reintentar-catalogo').prop('hidden', false);
            throw e;
        } finally {
            $('#catalogo').attr('aria-busy', 'false');
            $('#estado-catalogo').removeClass('actualizando');
            $('#catalogo-carga').prop('hidden', true);
        }
    }

    async function cargar({ silenciosa = false, forzar = false } = {}) {
        if (cargaCatalogo) {
            if (!forzar) return cargaCatalogo;
            try { await cargaCatalogo; } catch { /* La siguiente consulta permite reintentar. */ }
        }
        if (silenciosa && (ocupado || document.hidden)) return;
        const solicitud = actualizarCatalogo(silenciosa);
        cargaCatalogo = solicitud;
        try { return await solicitud; }
        finally { if (cargaCatalogo === solicitud) cargaCatalogo = null; }
    }
    $('#reintentar-catalogo').on('click',function(){cargar().catch(fallo);});
    const normalizarBusqueda = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    function cargarFiltros(){
        const seleccion=$('#filtrar-categoria').val();
        const conteo=new Map();productos.forEach(p=>conteo.set(p.categoria,(conteo.get(p.categoria)||0)+1));
        const lista=$('#filtrar-categoria').empty().append($('<option>').val('').text('Todas las categorías ('+productos.length+')'));
        [...conteo.keys()].sort((a,b)=>a.localeCompare(b,'es')).forEach(c=>lista.append($('<option>').val(c).text(c+' ('+conteo.get(c)+')')));
        if(conteo.has(seleccion))lista.val(seleccion);
    }
    function catalogo() {
        const enfocado = document.activeElement?.matches('#catalogo .agregar')
            ? document.activeElement.getAttribute('data-id') : null;
        $('#catalogo').empty();
        const texto=normalizarBusqueda($('#buscar').val().trim()),categoria=$('#filtrar-categoria').val(),orden=$('#orden-productos').val();
        const visibles=productos.filter(p=>(!categoria||p.categoria===categoria)&&normalizarBusqueda(p.nombre+' '+(p.descripcion||'')).includes(texto));
        if(orden==='nombre')visibles.sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
        if(orden==='precio-asc')visibles.sort((a,b)=>Number(a.precio)-Number(b.precio)||a.id-b.id);
        if(orden==='precio-desc')visibles.sort((a,b)=>Number(b.precio)-Number(a.precio)||a.id-b.id);
        $('#resultado-catalogo').text(visibles.length+' de '+productos.length+' productos'+(categoria?' · '+categoria:''));
        $('#limpiar-filtros').prop('hidden',!texto&&!categoria&&orden==='recientes');
        $('#sin-productos').text(productos.length?'No encontramos productos con esos filtros. Prueba otra categoría o búsqueda.':'Aún no hay videojuegos. Agrégalos desde el panel admin.').prop('hidden', Boolean(visibles.length));
        visibles.forEach(p => {
            const fila = $('<article class="producto">').attr('data-producto', p.id);
            const datos = $('<div>');
            datos.append($('<small class="categoria">').text(p.categoria || 'General'),
                $('<h3>').text(p.nombre), $('<strong>').text(dinero(p.precio)),
                $('<p>').text(p.stock + (p.stock === 1 ? ' disponible' : ' disponibles')), $('<p>').text(p.descripcion || ''));
            if (p.imagen) fila.append($('<img class="foto-producto">').attr({ src:p.imagen, alt:p.nombre }));
            else fila.append($('<div class="sin-foto">').text('Sin imagen'));
            const disponibilidad = p.stock === 0 ? 'agotado' : p.stock <= 3 ? 'ultimas' : 'disponible';
            fila.append($('<span class="disponibilidad">').addClass(disponibilidad)
                .text(p.stock === 0 ? 'Agotado' : p.stock <= 3 ? 'Últimas unidades' : 'Disponible'));
            fila.append(datos, $('<button class="agregar">').attr('data-id',p.id).text(p.stock === 0 ? 'Agotado' : 'Agregar +').prop('disabled',p.stock === 0 || ocupado));
            if (productosActualizados.has(p.id)) fila.addClass('producto-actualizado');
            $('#catalogo').append(fila);
        });
        productosActualizados.clear();
        if (enfocado) $('#catalogo .agregar[data-id="' + enfocado + '"]:enabled').trigger('focus');
    }
    function dibujar() {
        $('#carrito').empty();
        carrito.forEach(i=>{
            const fila=$('<article class="fila item-carrito">').attr('data-id',i.id);
            const cabecera=$('<div class="cabecera-item">');
            if(i.imagen)cabecera.append($('<img class="miniatura-carrito">').attr({src:i.imagen,alt:i.nombre}));
            cabecera.append($('<div>').append($('<h3>').text(i.nombre),$('<small>').text(dinero(i.precio)+' por unidad')),
                $('<button type="button" class="quitar secundario">').attr('aria-label','Quitar '+i.nombre).text('Quitar'));
            const acciones=$('<div class="acciones acciones-cantidad">');
            const selector=$('<div class="selector-cantidad">').append(
                $('<button type="button" class="menos secundario">').attr('aria-label','Restar una unidad de '+i.nombre).text('−').prop('disabled',ocupado||i.cantidad<=1),
                $('<input type="number" min="1" step="1" class="cantidad">').attr({max:i.stock,'aria-label':'Cantidad de '+i.nombre}).val(i.cantidad).prop('disabled',ocupado),
                $('<button type="button" class="mas secundario">').attr('aria-label','Sumar una unidad de '+i.nombre).text('+').prop('disabled',ocupado||i.cantidad>=i.stock));
            acciones.append(selector,$('<strong class="subtotal-item">').text(dinero(Number(i.precio)*i.cantidad)));
            fila.append(cabecera,acciones);$('#carrito').append(fila);
        });
        const cantidadTotal = carrito.reduce((s, i) => s + i.cantidad, 0);
        const unidades = cantidadTotal === 1 ? '1 unidad' : cantidadTotal + ' unidades';
        $('#vacio').toggle(!carrito.length); $('#total').text(dinero(total())); $('#contador').text(unidades); $('#cobrar,#vaciar').prop('disabled', ocupado || !carrito.length); cambio();
        $('#total-movil').text(dinero(total()));
        $('#contador-movil').text(unidades);
        if($('[name=metodo]:checked').val()==='qr_demo')programarDemo();
    }
    function cambio() { const recibido = Number($('#recibido').val()); $('#cambio').text(dinero(Math.max(0, recibido - total()))); $('#saldo-qr').text(dinero(Math.max(0, Math.round(total() * 100 - Math.round(recibido * 100)) / 100))); }
    $('#buscar').on('input', catalogo);
    $('#filtrar-categoria,#orden-productos').on('change',catalogo);
    $('#limpiar-filtros').on('click',()=>{$('#buscar').val('');$('#filtrar-categoria').val('');$('#orden-productos').val('recientes');catalogo();});
    $('#carrito').on('click','.menos,.mas',function(){
        if(ocupado)return;
        const i=carrito.find(i=>i.id===Number($(this).closest('.fila').attr('data-id')));if(!i)return;
        const siguiente=i.cantidad+($(this).hasClass('mas')?1:-1);
        if(siguiente<1||siguiente>i.stock)return;
        i.cantidad=siguiente;dibujar();
    });
    $('#catalogo').on('click', '.agregar', function () { if (ocupado) return; const p = productos.find(p => p.id === Number($(this).attr('data-id'))); let i = carrito.find(i => i.id === p.id); if ((i?.cantidad || 0) >= p.stock) return mensaje('No hay más existencias disponibles.', true); if (i) i.cantidad++; else carrito.push({ ...p, cantidad: 1 }); dibujar(); $('#total').stop(true, true).fadeOut(80).fadeIn(150); });
    $('#carrito').on('change', '.cantidad', function () { if(ocupado)return; const i = carrito.find(i => i.id === Number($(this).closest('.fila').attr('data-id'))); const n = Number(this.value); if (!Number.isInteger(n) || n < 1 || n > i.stock) { this.value = i.cantidad; NexusUI.errorCampo(this, 'Selecciona entre 1 y ' + i.stock + ' unidades.'); return; } i.cantidad = n; dibujar(); });
    $('#carrito').on('click', '.quitar', function () { if(ocupado)return; if (ocupado) return; const fila = $(this).closest('.fila'); const id = Number(fila.attr('data-id')); fila.slideUp(160, () => { carrito = carrito.filter(i => i.id !== id); dibujar(); }); });
    $('#vaciar').on('click', () => { if (confirm('¿Vaciar el carrito?')) { carrito = []; $('#aviso-carrito').prop('hidden', true); dibujar(); } });
    $('[name=metodo]').on('change', function () {
        const demo=this.value==='qr_demo',mixto=this.value==='mixto',qr=this.value==='qr'||mixto;
        solicitudDemo++;clearTimeout(temporizadorDemo);
        $('#efectivo').prop('hidden',demo||this.value==='qr');$('#qr').prop('hidden',!qr);$('#qr-demo').prop('hidden',!demo);
        $('#nombre-pagador').prop({ required: qr, disabled: !qr });
        $('#recibido').prop({ required: !demo && this.value !== 'qr', disabled: demo || this.value === 'qr' });
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
        $('#progreso-pago li').removeClass('completado actual').removeAttr('aria-current');
        $('#progreso-pago [data-paso=registrado]').addClass('completado');
        $('#progreso-pago [data-paso=esperando]').toggleClass('completado', pagado).toggleClass('actual', !pagado);
        $('#progreso-pago [data-paso=confirmado]').toggleClass('actual completado', pagado);
        $('#progreso-pago [data-paso=' + (pagado ? 'confirmado' : 'esperando') + ']').attr('aria-current', 'step');
        $('#seguimiento').prop('hidden',$('[name=metodo]:checked').val()==='qr_demo').toggleClass('pago-confirmado',pagado);
        $('#numero-pedido').text('Pedido #' + v.id);
        $('#importes-pedido').text('Total: ' + dinero(v.total) + ' · Efectivo: ' + dinero(v.monto_efectivo) + ' · QR: ' + dinero(v.monto_qr));
        $('#estado-pedido').text(pagado ? '¡Pago confirmado! Tu pedido está pagado.' : v.metodo === 'efectivo' ? 'Esperando que administración confirme el efectivo recibido.' : qrRecibido ? 'Llegó tu pago QR. Falta confirmar la entrega del efectivo.' : 'Esperando el aviso de tu pago QR. La pantalla se actualizará cuando se confirme.');
        $('#estado-consulta').text(pagado ? (!v.cliente_email ? 'Este pedido no tiene correo registrado; puedes imprimir su factura.' : v.correo_enviado_en ? 'Comprobante entregado a Gmail para su envío.' : v.correo_error || 'Pago confirmado. Comprobante pendiente de envío por correo.') : 'Verificación automática cada 8 segundos. Si ya pagaste, no vuelvas a transferir.');
        $('#verificar-pago').prop('disabled',false).text('Actualizar pago');
        $('#comprobante-confirmado').prop('hidden',!pagado);
        $('#ver-factura').prop('hidden', !pagado || !pedidoToken).attr('href', pagado && pedidoToken ? '/factura.html#' + encodeURIComponent(pedidoToken) : null);
        $('#detalle-confirmacion').text('Pedido #' + v.id + ' · Total pagado: ' + dinero(v.total));
        $('#aviso-pago').prop('hidden',$('[name=metodo]:checked').val()==='qr_demo'||(!pagado && !qrRecibido)).toggleClass('pago-completo',pagado);
        $('#aviso-pago-titulo').text(pagado ? '✓ Pago confirmado' : 'QR recibido · Efectivo pendiente');
        $('#aviso-pago-detalle').text('Pedido #' + v.id + ' · ' + (pagado ? dinero(v.total) + ' pagados.' : dinero(v.monto_qr) + ' recibidos por QR.'));
        clearTimeout(temporizadorPago);
        if (!pagado || (v.cliente_email && !v.correo_enviado_en)) temporizadorPago = setTimeout(() => consultarPago(),8000);
    }
    $('#verificar-pago').on('click',() => consultarPago(true));
    $('#pago').on('submit', async function (e) {
        e.preventDefault(); if (ocupado || !carrito.length) return;
        const metodo = $('[name=metodo]:checked').val();
        if(metodo==='qr_demo'){clearTimeout(temporizadorDemo);try{await generarDemo();}catch(e){fallo(e);}return;}
        if (metodo !== 'efectivo' && !$('#imagen-qr').attr('src')) return mensaje('El negocio aún no configuró su QR.', true, this);
        if (!confirm('¿Registrar este pago por ' + dinero(total()) + ' para su verificación?')) return;
        ocupado = true; $('#pago input,#carrito input,#carrito button,#catalogo button').prop('disabled', true); dibujar(); $('#carrito input,#carrito button').prop('disabled', true);
        try {
            const v = await api('ventas', 'POST', { items: carrito.map(i => ({ id: i.id, cantidad: i.cantidad })), metodo, recibido: Number($('#recibido').val()), cliente_nombre: $('#cliente-nombre').val().trim(), cliente_email: $('#cliente-email').val().trim(), nombre_pagador: $('#nombre-pagador').val().trim() });
            pedidoToken = v.consulta_token; try { localStorage.setItem('nexus-pedido', pedidoToken); } catch { }
            mostrarPedido(v); carrito = []; $('#aviso-carrito').prop('hidden', true); $('#recibido').val(''); mensaje('Pedido #' + v.id + ' registrado. Consulta el resultado en «Actualizar pago».', false, this); await cargar({ forzar: true });
        } catch (e) { fallo(e, this); } finally {
            ocupado = false;
            $('#pago input,#catalogo button').prop('disabled', false);
            $('#recibido').prop('disabled', ['qr', 'qr_demo'].includes($('[name=metodo]:checked').val()));
            $('#nombre-pagador').prop('disabled', !['qr', 'mixto'].includes($('[name=metodo]:checked').val()));
            catalogo(); dibujar();
        }
    });
    try { pedidoToken = localStorage.getItem('nexus-pedido') || ''; } catch { }
    if (pedidoToken) consultarPago();
    const dialogo = document.getElementById('carrito-movil');
    const panel = document.getElementById('panel-carrito');
    const contenedorCarrito = panel.parentElement;
    const vistaMovil = window.matchMedia('(max-width: 900px)');
    $('#abrir-carrito').on('click', () => {
        if (!vistaMovil.matches) return;
        dialogo.append(panel);
        dialogo.showModal();
        document.body.classList.add('carrito-abierto');
        $('#cerrar-carrito').trigger('focus');
    });
    $('#cerrar-carrito').on('click', () => dialogo.close());
    dialogo.addEventListener('close', () => {
        contenedorCarrito.append(panel);
        document.body.classList.remove('carrito-abierto');
        if (vistaMovil.matches) $('#abrir-carrito').trigger('focus');
    });
    dialogo.addEventListener('click', event => { if (event.target === dialogo) dialogo.close(); });
    vistaMovil.addEventListener('change', () => { if (dialogo.open && !vistaMovil.matches) dialogo.close(); });
    setInterval(() => cargar({ silenciosa: true }).catch(() => {}), 15000);
    setInterval(() => { if (!document.hidden) mostrarHoraActualizacion(); }, 15000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) cargar({ silenciosa: true }).catch(() => {});
    });
    dibujar(); cargar().catch(fallo);
});

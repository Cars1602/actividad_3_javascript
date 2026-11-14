$(function () {
    let imagen = '', leyendo = false, editando=null, productosAdmin=[],imagenOriginal='',lecturaImagen=0;
    const dinero = n => 'Bs ' + Number(n).toFixed(2);
    const mensaje = NexusUI.mensaje;
    function api(path, method = 'GET', data) { return $.ajax({ url: '/api/' + path, method, contentType: 'application/json', data: data ? JSON.stringify(data) : undefined }); }
    function fallo(e, formulario) { mensaje(e.responseJSON?.error || 'No se pudo completar la operación.', true, formulario); }

    const pestanas = [...document.querySelectorAll('.tabs-admin [role=tab]')];
    function activarPestana(elegida, enfocar = false) {
        pestanas.forEach(pestana => {
            const activa = pestana === elegida;
            pestana.setAttribute('aria-selected', String(activa));
            pestana.tabIndex = activa ? 0 : -1;
            document.getElementById(pestana.getAttribute('aria-controls')).hidden = !activa;
        });
        if (enfocar) elegida.focus();
    }
    pestanas.forEach((pestana, indice) => {
        pestana.addEventListener('click', () => activarPestana(pestana));
        pestana.addEventListener('keydown', event => {
            const destinos = { ArrowRight: (indice + 1) % pestanas.length,
                ArrowLeft: (indice + pestanas.length - 1) % pestanas.length,
                Home: 0, End: pestanas.length - 1 };
            if (!(event.key in destinos)) return;
            event.preventDefault();
            activarPestana(pestanas[destinos[event.key]], true);
        });
    });

    async function productos() {
        $('#productos-admin').attr('aria-busy', 'true');
        $('#recargar').prop('disabled', true).text('Actualizando…');
        try {
            const datos = await api('productos');
            productosAdmin = datos;
            $('#productos-admin').empty();
            if (!datos.length) $('#productos-admin').text('Agrega tu primer videojuego usando el formulario.');
            datos.forEach(p => {
                const fila = $('<article class="producto producto-admin">');
                if (p.imagen) fila.append($('<img class="foto-producto">').attr({ src: p.imagen, alt: p.nombre }));
                const d = $('<div>');
                d.append($('<small class="categoria">').text(p.categoria), $('<h3>').text(p.nombre),
                    $('<p>').text(p.descripcion), $('<strong>').text(dinero(p.precio)), $('<p>').text(p.stock + ' disponibles'));
                fila.append(d, $('<button class="editar-producto secundario" type="button">').attr('data-id', p.id).text('Editar'));
                $('#productos-admin').append(fila);
            });
        } finally {
            $('#productos-admin').attr('aria-busy', 'false');
            $('#recargar').prop('disabled', false).text('Actualizar');
        }
    }
    async function categorias(seleccion) {
        const elegida=seleccion??$('#categoria').val();
        const datos=await api('categorias');
        const lista=$('#categoria').empty().append($('<option>').val('').text('Selecciona una categoría'));
        const panel=$('#lista-categorias').empty();
        datos.forEach(c=>{
            lista.append($('<option>').val(c.nombre).text(c.nombre));
            const fila=$('<div class="categoria-admin">').append($('<span>').text(c.nombre));
            if(c.nombre==='General')fila.append($('<small>').text('Predeterminada'));
            else fila.append($('<button type="button" class="eliminar-categoria secundario">').attr({'data-id':c.id,'data-nombre':c.nombre,'aria-label':'Eliminar categoría '+c.nombre}).text('Eliminar'));
            panel.append(fila);
        });
        if(elegida&&datos.some(c=>c.nombre===elegida))lista.val(elegida);
    }
    $('#lista-categorias').on('click','.eliminar-categoria',async function(){
        const boton=$(this),nombre=boton.attr('data-nombre');
        if(!confirm('¿Estás seguro de eliminar la categoría «'+nombre+'»?'))return;
        boton.prop('disabled',true);
        try{await api('categorias/'+boton.attr('data-id'),'DELETE');await categorias();mensaje('Categoría «'+nombre+'» eliminada.');}
        catch(e){fallo(e);boton.prop('disabled',false);}
    });
    $('#form-categoria').on('submit', async function (e) { e.preventDefault(); const b = $(this).find('button'); b.prop('disabled', true); try { const c = await api('categorias', 'POST', { nombre: $('#nueva-categoria').val().trim() }); this.reset(); await categorias(c.nombre); mensaje('Categoría creada. Ya puedes seleccionarla.', false, this); } catch (e) { fallo(e, this); } finally { b.prop('disabled', false); } });
    let qrImagen = '';
    $('#qr-admin').on('change', function () { qrImagen = ''; const f = this.files[0]; if (!f) return; if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 1500000) { this.value = ''; NexusUI.errorCampo(this, 'Selecciona un QR PNG, JPG o WebP de hasta 1.5 MB.'); return; } const lector = new FileReader(); $('#guardar-qr').prop('disabled', true); lector.onload = () => { qrImagen = lector.result; $('#qr-previa').attr('src', qrImagen).prop('hidden', false); $('#guardar-qr').prop('disabled', false); }; lector.onerror = () => { $('#guardar-qr').prop('disabled', false); mensaje('No se pudo leer el QR.', true, '#form-qr'); }; lector.readAsDataURL(f); });
    $('#form-qr').on('submit', async function (e) { e.preventDefault(); if (!qrImagen) return mensaje('Selecciona la imagen QR.', true, this); $('#guardar-qr').prop('disabled', true); try { await api('configuracion/qr', 'PUT', { imagen: qrImagen }); mensaje('QR guardado. Aparecerá al seleccionar QR en la tienda.', false, this); } catch (e) { fallo(e, this); } finally { $('#guardar-qr').prop('disabled', false); } });
    async function configuracion() { const c = await api('configuracion'); if (c.qr_imagen) $('#qr-previa').attr('src', c.qr_imagen).prop('hidden', false); }
    function mostrarPrevia(){if(imagen)$('#vista-previa').attr('src',imagen).prop('hidden',false);else $('#vista-previa').removeAttr('src').prop('hidden',true);}
    $('#imagen').on('change',function(){
        const turno=++lecturaImagen,f=this.files[0];imagen=imagenOriginal;leyendo=false;$('#guardar').prop('disabled',false);mostrarPrevia();
        if(!f)return;
        if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>1500000){this.value='';NexusUI.errorCampo(this,'Usa una imagen JPG, PNG o WebP de hasta 1.5 MB.');return;}
        leyendo=true;$('#guardar').prop('disabled',true);const lector=new FileReader();
        lector.onload=()=>{if(turno!==lecturaImagen)return;imagen=lector.result;leyendo=false;$('#guardar').prop('disabled',false);mostrarPrevia();};
        lector.onerror=()=>{if(turno!==lecturaImagen)return;leyendo=false;$('#guardar').prop('disabled',false);mensaje('No se pudo leer la imagen.',true,'#registro-admin');};lector.readAsDataURL(f);
    });
    $('#registro-admin').on('reset',()=>{lecturaImagen++;imagen='';imagenOriginal='';editando=null;leyendo=false;mostrarPrevia();$('#imagen').prop('required',true);$('#titulo-producto').text('Agregar videojuego');$('#guardar').text('Guardar videojuego').prop('disabled',false);$('#cancelar-edicion').prop('hidden',true);});
    $('#cancelar-edicion').on('click',()=>$('#registro-admin')[0].reset());
    $('#productos-admin').on('click','.editar-producto',function(){
        const p=productosAdmin.find(p=>p.id===Number($(this).attr('data-id')));if(!p)return;
        $('#registro-admin')[0].reset();editando=p.id;imagen=imagenOriginal=p.imagen||'';
        $('#nombre').val(p.nombre);$('#descripcion').val(p.descripcion);$('#categoria').val(p.categoria);$('#precio').val(p.precio);$('#stock').val(p.stock);
        $('#imagen').prop('required',false);mostrarPrevia();$('#titulo-producto').text('Editar videojuego #'+p.id);$('#guardar').text('Guardar cambios');$('#cancelar-edicion').prop('hidden',false);
        document.getElementById('titulo-producto').scrollIntoView({behavior:'smooth',block:'center'});$('#nombre').trigger('focus');
    });
    $('#registro-admin').on('keydown',function(e){if(e.key==='Escape'){this.reset();$('#nombre').trigger('focus');}});
    $('#registro-admin').on('submit',async function(e){
        e.preventDefault();if(leyendo||(!editando&&!imagen))return mensaje('Selecciona una imagen válida.',true,this);
        const id=editando;$('#guardar').prop('disabled',true);
        try{await api(id?'productos/'+id:'productos',id?'PUT':'POST',{nombre:$('#nombre').val().trim(),descripcion:$('#descripcion').val().trim(),categoria:$('#categoria').val(),precio:Number($('#precio').val()),stock:Number($('#stock').val()),imagen});this.reset();await productos();mensaje(id?'Producto actualizado. Los cambios ya están disponibles en la tienda.':'Videojuego guardado. Ya está disponible en la tienda.',false,this);$('#nombre').trigger('focus');}
        catch(e){fallo(e,this);}finally{$('#guardar').prop('disabled',false);}
    });
    let paginaVentas=1,paginasVentas=1,solicitudVentas=0,filtrosVentas={};
    const nombresPago={efectivo:'Efectivo',qr:'QR',mixto:'Efectivo + QR'};
    async function ventas(pagina=paginaVentas){
        const solicitud=++solicitudVentas;
        const datos=await api('admin/ventas/historial?'+new URLSearchParams({...filtrosVentas,pagina}));
        if(solicitud!==solicitudVentas)return;
        paginaVentas=datos.pagina;paginasVentas=datos.paginas;
        const resumen=$('#resumen-ventas').empty(),r=datos.resumen;
        [['Ventas encontradas',r.cantidad],['Pagadas ('+r.pagadas+')',dinero(r.total_pagado)],['Pendientes ('+r.pendientes+')',dinero(r.total_pendiente)]].forEach(([titulo,valor])=>resumen.append($('<div>').append($('<span>').text(titulo),$('<strong>').text(valor))));
        $('#ventas-pagina').text('Página '+paginaVentas+' de '+paginasVentas);
        $('#ventas-anterior').prop('disabled',paginaVentas<=1);$('#ventas-siguiente').prop('disabled',paginaVentas>=paginasVentas);
        const lista=$('#ventas-admin').empty();if(!datos.ventas.length)lista.text('No hay ventas con estos filtros.');
        datos.ventas.forEach(v=>{
            const fila=$('<article class="venta">'),d=$('<div>');
            d.append($('<strong>').text('Venta #'+v.id+' · '+dinero(v.total)),
                $('<span class="estado-venta">').addClass(v.estado==='pagado'?'pagada':'pendiente').text(v.estado==='pagado'?'Pagada':'Pendiente'),
                $('<p>').text(nombresPago[v.metodo]+' · '+new Date(v.creado_en).toLocaleString('es-BO',{timeZone:'America/La_Paz'})),
                $('<p>').text(v.detalle.map(i=>i.nombre+' × '+i.cantidad).join(', ')),
                $('<p>').text('Efectivo: '+dinero(v.monto_efectivo||0)+' · QR: '+dinero(v.monto_qr||0)));
            if(v.nombre_pagador)d.append($('<p>').text('Titular QR: '+v.nombre_pagador));
            if(v.qr_verificado&&v.estado==='pendiente')d.append($('<p>').text('Aviso QR recibido. Falta confirmar el efectivo.'));
            fila.append(d);if(v.estado==='pendiente')fila.append($('<button class="confirmar">').attr('data-id',v.id).text(v.metodo==='mixto'?'Confirmar efectivo y QR':'Confirmar pago QR'));lista.append(fila);
        });
    }
    $('#filtros-ventas').on('submit',function(e){e.preventDefault();const desde=$('#ventas-desde').val(),hasta=$('#ventas-hasta').val();if(desde&&hasta&&desde>hasta)return mensaje('La fecha inicial no puede ser posterior a la final.',true);filtrosVentas={desde,hasta,estado:$('#ventas-estado').val(),metodo:$('#ventas-metodo').val()};ventas(1).catch(fallo);}).on('reset',()=>{filtrosVentas={};ventas(1).catch(fallo);});
    $('#ventas-anterior').on('click',()=>ventas(Math.max(1,paginaVentas-1)).catch(fallo));
    $('#ventas-siguiente').on('click',()=>ventas(Math.min(paginasVentas,paginaVentas+1)).catch(fallo));
    $('#ventas-admin').on('click', '.confirmar', async function () { if (!confirm('¿Verificaste el ingreso QR y, si es pago mixto, recibiste también el efectivo indicado?')) return; const b = $(this); b.prop('disabled', true); try { await api('ventas/' + b.attr('data-id') + '/confirmar', 'POST', {}); await ventas(); mensaje('Pago QR confirmado manualmente.'); } catch (e) { fallo(e); b.prop('disabled', false); } });
    $('#recargar').on('click', () => productos().catch(fallo)); $('#actualizar-ventas').on('click', () => ventas().catch(fallo)); Promise.all([productos(), ventas(), categorias(), configuracion()]).catch(fallo);
    async function avisosYape(){const rows=await api('admin/yape');$('#avisos-yape').empty();if(!rows.length)$('#avisos-yape').text('No llegaron avisos. Configura el endpoint y token en la app Android.');rows.forEach(a=>{const fila=$('<article class="fila">');fila.append($('<strong>').text(a.estado+' · '+new Date(a.fecha_recepcion).toLocaleString()),$('<p>').text(a.texto_original),$('<p>').text(a.sheets_sincronizado_en?'Google Sheets: registrado':'Google Sheets: pendiente'));if(a.pedido_id)fila.append($('<p>').text('Pedido #'+a.pedido_id));if(a.estado==='por_revisar'){const input=$('<input type="number" min="1" step="1" placeholder="Número de pedido">');const b=$('<button>').text('Asociar y confirmar pago');b.on('click',async()=>{const id=Number(input.val());if(!Number.isInteger(id)||id<1)return mensaje('Indica el número de pedido.',true);if(!confirm('¿Verificaste en el banco este aviso, el importe QR del pedido #'+id+' y el efectivo si es mixto?'))return;b.prop('disabled',true);try{await api('admin/yape/'+a.evento_id+'/confirmar','POST',{pedido_id:id,verificado:true});await avisosYape();await ventas();mensaje('Pedido confirmado y aviso asociado.');}catch(e){fallo(e);b.prop('disabled',false);}});fila.append(input,b);}$('#avisos-yape').append(fila);});}
    $('#sincronizar-sheets').on('click',async function(){ $(this).prop('disabled',true);try{const r=await api('admin/yape/sincronizar','POST',{});mensaje(r.configurado?r.mensaje:'Falta configurar GOOGLE_SHEETS_URL y GOOGLE_SHEETS_TOKEN en Render.',!r.configurado);await avisosYape();}catch(e){fallo(e);}finally{$(this).prop('disabled',false);}});$('#actualizar-yape').on('click',()=>avisosYape().catch(fallo));avisosYape().catch(fallo);
});

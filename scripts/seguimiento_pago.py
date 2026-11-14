from pathlib import Path
r=Path(__file__).resolve().parent.parent
p=r/'schema.sql';s=p.read_text(encoding='utf-8-sig')+'''\n-- Clave privada de consulta del pedido para el comprador.
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS consulta_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS ventas_consulta_token_idx ON tienda.ventas(consulta_token);
''';p.write_text(s,encoding='utf-8')
p=r/'js/server.js';s=p.read_text(encoding='utf-8-sig');idx=s.index("app.get('/api/ventas'")
s=s[:idx]+'''// Consulta de estado con clave aleatoria, sin exponer ventas de otros compradores.
app.get('/api/pedidos/:token',async(req,res,next)=>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.token))return res.status(400).json({error:'Clave de pedido inválida.'});
 try{const r=await pool.query('SELECT id,total,metodo,estado,monto_efectivo,monto_qr FROM tienda.ventas WHERE consulta_token=$1',[req.params.token]);if(!r.rowCount)return res.status(404).json({error:'Pedido no encontrado.'});res.json({...r.rows[0],verificacion_excel:'no_configurada'});}catch(e){next(e);}
});
'''+s[idx:];p.write_text(s,encoding='utf-8')
p=r/'public/index.html';s=p.read_text(encoding='utf-8-sig').replace('>Registrar cobro</button>','>Confirmar pedido</button>')
s=s.replace('</form>\n            </aside>','''</form>
                <section id="seguimiento" hidden aria-live="polite">
                    <h3 id="numero-pedido"></h3>
                    <p id="importes-pedido"></p>
                    <p id="estado-pedido"></p>
                    <button type="button" id="verificar-pago" class="principal">Verificar pago</button>
                    <p class="ayuda">No vuelvas a pagar si ya transferiste. Conserva tu comprobante y solicita la verificación del administrador.</p>
                </section>
            </aside>''');p.write_text(s,encoding='utf-8')
p=r/'public/js/inicio.js';s=p.read_text(encoding='utf-8-sig').replace("$('#cobrar').text(qr?'Registrar pedido pendiente':'Registrar cobro');", "$('#cobrar').text('Confirmar pedido');")
s=s.replace("let productos = [], carrito = [], ocupado = false;", "let productos = [], carrito = [], ocupado = false, pedidoToken='';")
a=s.index("    $('#pago').on('submit'")
s=s[:a]+'''    function mostrarPedido(v){
        $('#seguimiento').prop('hidden',false);
        $('#numero-pedido').text('Pedido #'+v.id);
        $('#importes-pedido').text('Total: '+dinero(v.total)+' · Efectivo: '+dinero(v.monto_efectivo)+' · QR: '+dinero(v.monto_qr));
        $('#estado-pedido').text(v.estado==='pagado'?'Pago confirmado en el sistema.':'Pedido registrado. Pago pendiente de verificación. La conexión automática con Excel todavía no está configurada.');
        $('#verificar-pago').prop('disabled',v.estado==='pagado');
    }
    $('#verificar-pago').on('click',async function(){
        if(!pedidoToken)return;
        $(this).prop('disabled',true);
        try{mostrarPedido(await api('pedidos/'+pedidoToken));}catch(e){fallo(e);$(this).prop('disabled',false);}
    });
    $('#pago').on('submit',async function(e){
        e.preventDefault();if(ocupado||!carrito.length)return;
        const metodo=$('[name=metodo]:checked').val();
        if(metodo!=='efectivo'&&!$('#imagen-qr').attr('src'))return mensaje('El negocio aún no configuró su QR.',true);
        if(!confirm('¿Confirmar este pedido por '+dinero(total())+'?'))return;
        ocupado=true;$('#pago input,#carrito input,#carrito button,#catalogo button').prop('disabled',true);dibujar();$('#carrito input,#carrito button').prop('disabled',true);
        try{
            const v=await api('ventas','POST',{items:carrito.map(i=>({id:i.id,cantidad:i.cantidad})),metodo,recibido:Number($('#recibido').val())});
            pedidoToken=v.consulta_token;try{localStorage.setItem('nexus-pedido',pedidoToken);}catch{}
            mostrarPedido(v);carrito=[];$('#recibido').val('');mensaje('Pedido #'+v.id+' registrado. Consulta su estado en «Verificar pago».');await cargar();
        }catch(e){fallo(e);}finally{ocupado=false;$('#pago input,#catalogo button').prop('disabled',false);catalogo();dibujar();}
    });
    try{pedidoToken=localStorage.getItem('nexus-pedido')||'';}catch{}
    if(pedidoToken)api('pedidos/'+pedidoToken).then(mostrarPedido).catch(()=>{});
    dibujar();cargar().catch(fallo);
});
''';p.write_text(s,encoding='utf-8')
p=r/'public/estilos.css';s=p.read_text(encoding='utf-8-sig')+'\n#seguimiento{margin-top:24px;padding-top:20px;border-top:1px solid var(--linea)}#estado-pedido{line-height:1.6;color:var(--acento)}\n';p.write_text(s,encoding='utf-8')

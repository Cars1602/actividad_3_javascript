import { normalizarNombre, reconciliarAviso } from './pagos-yape.js';
import { timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
pool.on('error', () => console.error('Conexión interrumpida.'));
app.disable('x-powered-by');
// En Render la administración requiere credenciales independientes de Neon.
function igual(a,b){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
app.use((req,res,next)=>{
 const privada=req.path.startsWith('/api/admin/')||req.path==='/admin.html'||req.path==='/admin.js'||req.path==='/api/ventas'&&req.method==='GET'||req.path.endsWith('/confirmar')||['/api/productos','/api/categorias','/api/configuracion/qr'].includes(req.path)&&req.method!=='GET';
 if(!privada||!process.env.ADMIN_PASSWORD)return next();
 const header=req.headers.authorization||'';
 const raw=header.startsWith('Basic ')?Buffer.from(header.slice(6),'base64').toString():'';
 const corte=raw.indexOf(':');const usuario=raw.slice(0,corte),clave=raw.slice(corte+1);
 if(corte>0&&igual(usuario,process.env.ADMIN_USER||'admin')&&igual(clave,process.env.ADMIN_PASSWORD))return next();
 res.set('WWW-Authenticate','Basic realm="NexusPlay Admin", charset="UTF-8"');res.status(401).send('Acceso de administración requerido.');
});
app.get('/health',async(req,res)=>{try{await pool.query('SELECT 1');res.json({estado:'ok'});}catch{res.status(503).json({estado:'sin conexion'});}});
app.use(express.json({ limit: '3mb' }));
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
let sincronizandoSheets=false;
async function sincronizarSheets(){
 if(sincronizandoSheets)return;
 const url=process.env.GOOGLE_SHEETS_URL,token=process.env.GOOGLE_SHEETS_TOKEN;
 if(!url||!token)return;
 const destino=new URL(url);
 if(destino.protocol!=='https:'||destino.hostname!=='script.google.com'||!destino.pathname.endsWith('/exec'))throw new Error('Configura la URL de implementación de Apps Script.');
 sincronizandoSheets=true;
 try{
  const eventos=(await pool.query('SELECT evento_id,fecha_recepcion,aplicacion,texto_original,estado,pedido_id,registrado_en FROM tienda.notificaciones_yape WHERE sheets_sincronizado_en IS NULL ORDER BY registrado_en LIMIT 50')).rows;
  if(!eventos.length)return;
  const respuesta=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,eventos}),signal:AbortSignal.timeout(30000)});
  const resultado=await respuesta.json();
  if(!respuesta.ok||resultado.ok!==true||!Array.isArray(resultado.aceptados))throw new Error('Google no confirmó el registro.');
  const aceptados=eventos.map(e=>e.evento_id).filter(id=>resultado.aceptados.includes(id));
  if(aceptados.length)await pool.query('UPDATE tienda.notificaciones_yape SET sheets_sincronizado_en=now() WHERE evento_id=ANY($1::text[])',[aceptados]);
 }finally{sincronizandoSheets=false;}
}
app.post('/api/admin/yape/sincronizar',async(req,res)=>{try{await sincronizarSheets();res.json({configurado:!!(process.env.GOOGLE_SHEETS_URL&&process.env.GOOGLE_SHEETS_TOKEN),mensaje:'Sincronización revisada. Actualiza los avisos.'});}catch{res.status(503).json({error:'No se pudo sincronizar con Google. El aviso permanece guardado en Neon.'});}});
setInterval(()=>sincronizarSheets().catch(()=>console.error('Google Sheets pendiente de sincronizar.')),60000).unref();
// Reintenta avisos ya recibidos, sin depender de una acción del administrador.
let conciliando=false;
async function revisarPagosPendientes(){
 if(conciliando)return;
 conciliando=true;
 try{
  const avisos=(await pool.query(`SELECT n.evento_id FROM tienda.notificaciones_yape n
   WHERE n.estado='por_revisar' AND n.pedido_id IS NULL
   AND n.fecha_recepcion>=now()-interval '24 hours'
   AND EXISTS(SELECT 1 FROM tienda.ventas v WHERE v.estado='pendiente'
    AND v.metodo IN ('qr','mixto') AND NOT v.qr_verificado AND v.nombre_pagador_clave<>''
    AND v.creado_en<=n.fecha_recepcion AND v.creado_en>=n.fecha_recepcion-interval '30 minutes')
   ORDER BY n.fecha_recepcion LIMIT 50`)).rows;
  for(const aviso of avisos){
   const c=await pool.connect();
   try{await c.query('BEGIN');await reconciliarAviso(c,aviso.evento_id);await c.query('COMMIT');}
   catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
 }finally{conciliando=false;}
}
setInterval(()=>revisarPagosPendientes().catch(()=>console.error('Conciliación pendiente de reintento.')),8000).unref();
// Contrato compatible con el JSON que ya envía el lector Android.
app.post('/api/yape/notificaciones',async(req,res,next)=>{
 const token=process.env.YAPE_API_TOKEN;
 if(!token||token.length<32)return res.status(503).json({error:'Configura YAPE_API_TOKEN en el servidor (mínimo 32 caracteres).'});
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer ')||!igual(auth.slice(7),token))return res.status(401).json({error:'Token del lector inválido.'});
 const {EventoId,FechaRecepcion,Aplicacion,TextoOriginal}=req.body||{};
 if(typeof EventoId!=='string'||!/^[-a-zA-Z0-9_:]{16,128}$/.test(EventoId)||typeof Aplicacion!=='string'||Aplicacion.length>200||!Aplicacion||typeof TextoOriginal!=='string'||!TextoOriginal.trim()||TextoOriginal.length>8000||typeof FechaRecepcion!=='string'||!Number.isFinite(Date.parse(FechaRecepcion)))return res.status(400).json({error:'Notificación inválida.'});
 let c;try{
 c=await pool.connect();await c.query('BEGIN');
 await c.query('SELECT pg_advisory_xact_lock(853002)');
 const r=await c.query('INSERT INTO tienda.notificaciones_yape(evento_id,fecha_recepcion,aplicacion,texto_original) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING evento_id',[EventoId,FechaRecepcion,Aplicacion,TextoOriginal]);
 await reconciliarAviso(c,EventoId);
 const aviso=(await c.query('SELECT estado,pedido_id FROM tienda.notificaciones_yape WHERE evento_id=$1',[EventoId])).rows[0];
 await c.query('COMMIT');
 sincronizarSheets().catch(()=>console.error('Google Sheets pendiente de sincronizar.'));
 res.status(r.rowCount?201:200).json({registrado:true,duplicado:!r.rowCount,...aviso});
 }catch(e){if(c)await c.query('ROLLBACK');next(e);}finally{c?.release();}
});
app.get('/api/admin/yape',async(req,res,next)=>{try{res.json((await pool.query('SELECT * FROM tienda.notificaciones_yape ORDER BY registrado_en DESC LIMIT 100')).rows);}catch(e){next(e);}});
app.get('/api/admin/yape/excel.csv',async(req,res,next)=>{
 try{const rows=(await pool.query('SELECT evento_id,fecha_recepcion,aplicacion,texto_original,estado,pedido_id FROM tienda.notificaciones_yape ORDER BY registrado_en DESC LIMIT 10000')).rows;
 const celda=v=>'"'+String(v??'').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""')+'"';
 const csv=['EventoId;FechaRecepcion;Aplicacion;TextoOriginal;Estado;PedidoId',...rows.map(r=>Object.values(r).map(celda).join(';'))].join('\r\n');
 res.set('Content-Disposition','attachment; filename="pagos_yape.csv"').type('text/csv; charset=utf-8').send('\uFEFF'+csv);
 }catch(e){next(e);}
});
app.post('/api/admin/yape/:evento/confirmar',async(req,res,next)=>{
 const id=Number(req.body.pedido_id);if(!Number.isSafeInteger(id)||id<1||req.body.verificado!==true)return res.status(400).json({error:'Indica el pedido y verifica el abono en el banco.'});
 let c;try{c=await pool.connect();await c.query('BEGIN');
 const aviso=(await c.query('SELECT * FROM tienda.notificaciones_yape WHERE evento_id=$1 FOR UPDATE',[req.params.evento])).rows[0];
 const venta=(await c.query('SELECT * FROM tienda.ventas WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!aviso||aviso.estado!=='por_revisar'||!venta||venta.estado!=='pendiente'||!['qr','mixto'].includes(venta.metodo)){await c.query('ROLLBACK');return res.status(409).json({error:'Aviso o pedido no disponible para confirmar.'});}
 await c.query("UPDATE tienda.notificaciones_yape SET estado='verificado',sheets_sincronizado_en=NULL,pedido_id=$1 WHERE evento_id=$2",[id,req.params.evento]);
 await c.query("UPDATE tienda.ventas SET estado='pagado' WHERE id=$1",[id]);await c.query('COMMIT');res.json({estado:'pagado',pedido_id:id});
 }catch(e){if(c)await c.query('ROLLBACK');if(e.code==='23505')res.status(409).json({error:'El pedido ya tiene un aviso asociado.'});else next(e);}finally{c?.release();}
});
const imagenValida = imagen => typeof imagen === 'string' && imagen.length <= 2100000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imagen);
app.get('/api/categorias', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM tienda.categorias ORDER BY nombre')).rows); } catch (e) { next(e); } });
app.post('/api/categorias', async (req, res, next) => {
    const nombre = req.body.nombre?.trim();
    if (typeof nombre !== 'string' || !nombre || nombre.length > 60) return res.status(400).json({ error: 'Escribe una categoría de hasta 60 caracteres.' });
    try { const r = await pool.query('INSERT INTO tienda.categorias(nombre) VALUES($1) ON CONFLICT DO NOTHING RETURNING *', [nombre]); if (!r.rowCount) return res.status(409).json({ error: 'La categoría ya existe.' }); res.status(201).json(r.rows[0]); } catch (e) { next(e); }
});
app.get('/api/configuracion', async (req, res, next) => { try { res.json((await pool.query('SELECT qr_imagen FROM tienda.configuracion WHERE id=1')).rows[0]); } catch (e) { next(e); } });
app.put('/api/configuracion/qr', async (req, res, next) => {
    if (!imagenValida(req.body.imagen)) return res.status(400).json({ error: 'Selecciona una imagen QR válida de hasta 1.5 MB.' });
    try { await pool.query('UPDATE tienda.configuracion SET qr_imagen=$1,actualizado_en=now() WHERE id=1', [req.body.imagen]); res.json({ mensaje: 'QR guardado para toda la tienda.' }); } catch (e) { next(e); }
});
app.get('/api/productos', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM tienda.productos ORDER BY id DESC')).rows); } catch (e) { next(e); } });
app.post('/api/productos', async (req, res, next) => {
    const { nombre, precio, stock, descripcion = "", categoria = "General", imagen = "" } = req.body;
    if (typeof descripcion !== "string" || descripcion.length > 500 || typeof categoria !== "string" || categoria.length > 60 || typeof imagen !== "string" || imagen.length > 2100000 || (imagen && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(imagen))) return res.status(400).json({ error: "Descripción, categoría o imagen inválida (máximo 1.5 MB)." });
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 100 || !Number.isFinite(precio) || precio <= 0 || precio >= 100000000 || Math.abs(precio * 100 - Math.round(precio * 100)) > .001 || !Number.isInteger(stock) || stock < 0 || stock > 1000000) return res.status(400).json({ error: 'Revisa nombre, precio y existencias.' });
    try { if (!(await pool.query('SELECT 1 FROM tienda.categorias WHERE nombre=$1', [categoria.trim()])).rowCount) return res.status(400).json({ error: 'Selecciona una categoría registrada.' }); res.status(201).json((await pool.query('INSERT INTO tienda.productos(nombre,precio,stock,descripcion,categoria,imagen) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [nombre.trim(), precio, stock, descripcion.trim(), categoria.trim() || "General", imagen])).rows[0]); } catch (e) { next(e); }
});
// Consulta de estado con clave aleatoria, sin exponer ventas de otros compradores.
app.get('/api/pedidos/:token',async(req,res,next)=>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.token))return res.status(400).json({error:'Clave de pedido inválida.'});
 try{const r=await pool.query('SELECT id,total,metodo,estado,monto_efectivo,monto_qr,qr_verificado FROM tienda.ventas WHERE consulta_token=$1',[req.params.token]);if(!r.rowCount)return res.status(404).json({error:'Pedido no encontrado.'});res.json({...r.rows[0],verificacion_excel:'reemplazada_por_neon'});}catch(e){next(e);}
});
app.get('/api/admin/ventas/historial', async (req,res,next) => {
 const {estado='',metodo='',desde='',hasta=''}=req.query;
 const pagina=Number(req.query.pagina||1);
 const fecha=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!Number.isSafeInteger(pagina)||pagina<1||pagina>1000000||!['','pagado','pendiente'].includes(estado)||!['','efectivo','qr','mixto'].includes(metodo)||(desde&&!fecha(desde))||(hasta&&!fecha(hasta))||(desde&&hasta&&desde>hasta))return res.status(400).json({error:'Revisa las fechas y filtros del historial.'});
 const valores=[],condiciones=[];
 const filtro=(sql,v)=>{valores.push(v);condiciones.push(sql.replace('?', '$'+valores.length));};
 if(estado)filtro('estado=?',estado);
 if(metodo)filtro('metodo=?',metodo);
 if(desde)filtro("creado_en >= (?::date::timestamp AT TIME ZONE 'America/La_Paz')",desde);
 if(hasta)filtro("creado_en < ((?::date+1)::timestamp AT TIME ZONE 'America/La_Paz')",hasta);
 const where=condiciones.length?' WHERE '+condiciones.join(' AND '):'';
 let c;
 try{
  c=await pool.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const resumen=(await c.query(`SELECT count(*)::integer AS cantidad,count(*) FILTER(WHERE estado='pagado')::integer AS pagadas,count(*) FILTER(WHERE estado='pendiente')::integer AS pendientes,COALESCE(sum(total) FILTER(WHERE estado='pagado'),0) AS total_pagado,COALESCE(sum(total) FILTER(WHERE estado='pendiente'),0) AS total_pendiente FROM tienda.ventas${where}`,valores)).rows[0];
  const paginas=Math.max(1,Math.ceil(resumen.cantidad/20)),actual=Math.min(pagina,paginas);
  const ventas=(await c.query(`SELECT id,metodo,total,recibido,estado,detalle,creado_en,monto_efectivo,monto_qr,nombre_pagador,qr_verificado FROM tienda.ventas${where} ORDER BY creado_en DESC,id DESC LIMIT 20 OFFSET $${valores.length+1}`,[...valores,(actual-1)*20])).rows;
  await c.query('COMMIT');res.json({ventas,resumen,pagina:actual,paginas});
 }catch(e){if(c)await c.query('ROLLBACK');next(e);}finally{c?.release();}
});
app.get('/api/ventas', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM tienda.ventas ORDER BY id DESC LIMIT 30')).rows); } catch (e) { next(e); } });
// La transacción bloquea existencias y calcula el total con precios del servidor.
app.post('/api/ventas', async (req, res, next) => {
    const { items, metodo, recibido, nombre_pagador = '' } = req.body;
    if(typeof nombre_pagador!=='string'||nombre_pagador.length>150||(nombre_pagador.trim()&&normalizarNombre(nombre_pagador).split(' ').length<2))return res.status(400).json({error:'Escribe el nombre completo del titular que hará el pago QR.'});
    if (!['efectivo', 'qr', 'mixto'].includes(metodo) || !Array.isArray(items) || !items.length || items.length > 100) return res.status(400).json({ error: 'Carrito o método inválido.' });
    if (metodo !== 'efectivo' && !(await pool.query("SELECT 1 FROM tienda.configuracion WHERE id=1 AND qr_imagen<>''")).rowCount) return res.status(400).json({ error: 'El negocio aún no configuró su QR.' });
    const ids = new Set();
    for (const i of items) { if (!Number.isSafeInteger(i.id) || i.id < 1 || ids.has(i.id) || !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 1000000) return res.status(400).json({ error: 'Cantidades inválidas.' }); ids.add(i.id); }
    let c;
    try {
        c = await pool.connect(); await c.query('BEGIN'); let centavos = 0; const detalle = [];
        for (const i of [...items].sort((a, b) => a.id - b.id)) {
            const p = (await c.query('SELECT * FROM tienda.productos WHERE id=$1 FOR UPDATE', [i.id])).rows[0];
            if (!p || p.stock < i.cantidad) throw new Error('Existencias insuficientes. Actualiza el catálogo.');
            centavos += Math.round(Number(p.precio) * 100) * i.cantidad;
            if (!Number.isSafeInteger(centavos) || centavos > 99999999999999) throw new Error('Total demasiado alto.');
            detalle.push({ id: p.id, nombre: p.nombre, precio: p.precio, cantidad: i.cantidad });
        }
        const total = centavos / 100;
        if (metodo === 'efectivo' && (!Number.isFinite(recibido) || recibido < total || recibido > 999999999999 || Math.abs(recibido * 100 - Math.round(recibido * 100)) > .001)) throw new Error('El efectivo debe cubrir el total y admitir máximo dos decimales.');
        if(metodo==='mixto'&&(!Number.isFinite(recibido)||recibido<=0||recibido>=total||Math.abs(recibido*100-Math.round(recibido*100))>.001))throw new Error('El efectivo del pago mixto debe ser mayor que cero y menor que el total.');
        const efectivo=metodo==='efectivo'?total:metodo==='mixto'?Math.round(recibido*100)/100:0;
        const saldoQr=(centavos-Math.round(efectivo*100))/100;
        for (const i of items) await c.query('UPDATE tienda.productos SET stock=stock-$1 WHERE id=$2', [i.cantidad, i.id]);
        await c.query('SELECT pg_advisory_xact_lock(853002)');
        const venta = (await c.query('INSERT INTO tienda.ventas(metodo,total,recibido,estado,detalle,monto_efectivo,monto_qr,nombre_pagador,nombre_pagador_clave) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [metodo, total, metodo !== 'qr' ? recibido : null, metodo === 'efectivo' ? 'pagado' : 'pendiente', JSON.stringify(detalle),efectivo,saldoQr,metodo==='efectivo'?'':nombre_pagador.trim(),metodo==='efectivo'?'':normalizarNombre(nombre_pagador)])).rows[0];
        await c.query('COMMIT'); res.status(201).json(venta);
    } catch (e) { if (c) await c.query('ROLLBACK'); if (e instanceof Error && ['Existencias', 'Total', 'El efectivo'].some(x => e.message.startsWith(x))) res.status(400).json({ error: e.message }); else next(e); } finally { c?.release(); }
});
app.post('/api/ventas/:id/confirmar', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return res.sendStatus(400);
    try { const r = await pool.query("UPDATE tienda.ventas SET estado='pagado' WHERE id=$1 AND metodo IN ('qr','mixto') AND estado='pendiente' RETURNING *", [req.params.id]); if (!r.rowCount) return res.status(404).json({ error: 'Venta pendiente no encontrada.' }); res.json(r.rows[0]); } catch (e) { next(e); }
});
app.use((err, req, res, next) => { console.error('Error de servicio:', err.code || 'desconocido'); res.status(503).json({ error: 'No se pudo completar la operación. Revisa la conexión con PostgreSQL.' }); });
try { if(process.env.NODE_ENV==='production'&&!process.env.ADMIN_PASSWORD)throw new Error('Configura ADMIN_PASSWORD'); if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL'); await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8')); await pool.query(await readFile(new URL('./migracion.sql', import.meta.url), 'utf8')); app.listen(process.env.PORT || 3001, '0.0.0.0', () => console.log('NexusPlay iniciado en puerto ' + (process.env.PORT || 3001))); } catch (e) { console.error('No se pudo iniciar. Configura DATABASE_URL y revisa Neon.', e.code || ''); await pool.end(); process.exitCode = 1; }



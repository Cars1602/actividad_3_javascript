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
 const privada=req.path==='/admin.html'||req.path==='/admin.js'||req.path==='/api/ventas'&&req.method==='GET'||req.path.endsWith('/confirmar')||['/api/productos','/api/categorias','/api/configuracion/qr'].includes(req.path)&&req.method!=='GET';
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
app.get('/api/ventas', async (req, res, next) => { try { res.json((await pool.query('SELECT * FROM tienda.ventas ORDER BY id DESC LIMIT 30')).rows); } catch (e) { next(e); } });
// La transacción bloquea existencias y calcula el total con precios del servidor.
app.post('/api/ventas', async (req, res, next) => {
    const { items, metodo, recibido } = req.body;
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
        const venta = (await c.query('INSERT INTO tienda.ventas(metodo,total,recibido,estado,detalle,monto_efectivo,monto_qr) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [metodo, total, metodo !== 'qr' ? recibido : null, metodo === 'efectivo' ? 'pagado' : 'pendiente', JSON.stringify(detalle),efectivo,saldoQr])).rows[0];
        await c.query('COMMIT'); res.status(201).json(venta);
    } catch (e) { if (c) await c.query('ROLLBACK'); if (e instanceof Error && ['Existencias', 'Total', 'El efectivo'].some(x => e.message.startsWith(x))) res.status(400).json({ error: e.message }); else next(e); } finally { c?.release(); }
});
app.post('/api/ventas/:id/confirmar', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return res.sendStatus(400);
    try { const r = await pool.query("UPDATE tienda.ventas SET estado='pagado' WHERE id=$1 AND metodo IN ('qr','mixto') AND estado='pendiente' RETURNING *", [req.params.id]); if (!r.rowCount) return res.status(404).json({ error: 'Venta pendiente no encontrada.' }); res.json(r.rows[0]); } catch (e) { next(e); }
});
app.use((err, req, res, next) => { console.error('Error de servicio:', err.code || 'desconocido'); res.status(503).json({ error: 'No se pudo completar la operación. Revisa la conexión con PostgreSQL.' }); });
try { if(process.env.NODE_ENV==='production'&&!process.env.ADMIN_PASSWORD)throw new Error('Configura ADMIN_PASSWORD'); if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL'); await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8')); await pool.query(await readFile(new URL('./migracion.sql', import.meta.url), 'utf8')); app.listen(process.env.PORT || 3001, '0.0.0.0', () => console.log('NexusPlay iniciado en puerto ' + (process.env.PORT || 3001))); } catch (e) { console.error('No se pudo iniciar. Configura DATABASE_URL y revisa Neon.', e.code || ''); await pool.end(); process.exitCode = 1; }



from pathlib import Path
p=Path('server.js');s=p.read_text(encoding='utf-8-sig');s="import { timingSafeEqual, createHash } from 'node:crypto';\n"+s
idx=s.index("app.use(express.json")
s=s[:idx]+'''app.disable('x-powered-by');
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
'''+s[idx:]
s=s.replace("if (!process.env.DATABASE_URL)","if(process.env.NODE_ENV==='production'&&!process.env.ADMIN_PASSWORD)throw new Error('Configura ADMIN_PASSWORD'); if (!process.env.DATABASE_URL)")
s=s.replace("console.log('Carrito: http://localhost:' + (process.env.PORT || 3001))", "console.log('NexusPlay iniciado en puerto ' + (process.env.PORT || 3001))")
p.write_text(s,encoding='utf-8')

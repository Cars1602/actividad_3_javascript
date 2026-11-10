import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)).replace(/[\\/]$/,'');
process.loadEnvFile(root+'/.env');
const require=createRequire(root+'/package.json'),{Pool}=require('pg'),QRCode=require('qrcode');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const clave=randomBytes(24).toString('hex'),base='http://localhost:3022';
const auth={Authorization:'Basic '+Buffer.from('admin:'+clave).toString('base64'),'Content-Type':'application/json'};
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3022',NODE_ENV:'production',ADMIN_USER:'admin',ADMIN_PASSWORD:clave,GOOGLE_SHEETS_URL:'',GOOGLE_SHEETS_TOKEN:''},stdio:['ignore','pipe','pipe']});
let id;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('El servidor no inició')),25000);child.stdout.on('data',d=>{if(d.toString().includes('iniciado')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error('El servidor terminó'));});});
 const imagen=await QRCode.toDataURL('Imagen de prueba');
 id=(await pool.query("INSERT INTO tienda.productos(nombre,categoria,precio,stock,imagen) VALUES($1,'General',15.25,7,$2) RETURNING id",['Prueba QR '+randomBytes(5).toString('hex'),imagen])).rows[0].id;
 const datos={nombre:'Producto editado de prueba',categoria:'General',descripcion:'Validación temporal',precio:18.5,stock:6};
 let r=await fetch(base+'/api/productos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(datos)});assert.equal(r.status,401);
 r=await fetch(base+'/api/productos/'+id,{method:'PUT',headers:auth,body:JSON.stringify({...datos,stock:-1})});assert.equal(r.status,400);
 r=await fetch(base+'/api/qr-demostracion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id,cantidad:2}],total:0.01})});assert.equal(r.status,200);const demo=await r.json();assert.equal(demo.total,30.5);assert.equal(demo.demostracion,true);assert.ok(demo.contenido.includes('NO VALIDO PARA PAGAR'));assert.ok(demo.contenido.includes('30.50'));assert.ok(demo.imagen.startsWith('data:image/png;base64,'));assert.equal(Buffer.from(demo.imagen.split(',')[1],'base64').subarray(1,4).toString(),'PNG');
 assert.equal((await pool.query('SELECT stock FROM tienda.productos WHERE id=$1',[id])).rows[0].stock,7);
 r=await fetch(base+'/api/productos/'+id,{method:'PUT',headers:auth,body:JSON.stringify(datos)});assert.equal(r.status,200);let editado=await r.json();assert.equal(editado.nombre,datos.nombre);assert.equal(Number(editado.precio),18.5);assert.equal(editado.imagen,imagen);
 const otra=await QRCode.toDataURL('Imagen reemplazada de prueba');r=await fetch(base+'/api/productos/'+id,{method:'PUT',headers:auth,body:JSON.stringify({...datos,imagen:otra})});assert.equal(r.status,200);editado=await r.json();assert.equal(editado.imagen,otra);
 r=await fetch(base+'/api/qr-demostracion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id,cantidad:3}]})});assert.equal((await r.json()).total,55.5);
 for(const items of [[],[{id,cantidad:0}],[{id,cantidad:1},{id,cantidad:1}]]){r=await fetch(base+'/api/qr-demostracion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});assert.equal(r.status,400);}
 r=await fetch(base+'/api/ventas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({metodo:'qr_demo',items:[{id,cantidad:1}]})});assert.equal(r.status,400);
 console.log('OK: edición protegida, validaciones, conservación y reemplazo de imagen, importe QR calculado por servidor y QR demo sin descuento de stock ni venta real.');
}finally{child.kill();if(id)await pool.query('DELETE FROM tienda.productos WHERE id=$1',[id]);await pool.end();}

import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});let id,venta,qr;
const child=spawn(process.execPath,[fileURLToPath(new URL('../js/server.js',import.meta.url))],{env:{...process.env,PORT:'3003'},stdio:['ignore','pipe','pipe']});
async function post(path,data){const r=await fetch('http://localhost:3003/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};}
try{
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('No inició')),20000);child.stdout.on('data',d=>{if(d.toString().includes('iniciado')){clearTimeout(timer);ok();}});child.on('exit',()=>{clearTimeout(timer);no(Error('Inicio fallido'));});});
 qr=(await db.query('SELECT qr_imagen FROM tienda.configuracion WHERE id=1')).rows[0].qr_imagen;
 await db.query("UPDATE tienda.configuracion SET qr_imagen='data:image/png;base64,AA==' WHERE id=1");
 const p=await post('productos',{nombre:'Prueba pago mixto',precio:100,stock:2,categoria:'General'});id=p.data.id;
 const v=await post('ventas',{items:[{id,cantidad:1}],metodo:'mixto',recibido:30});venta=v.data.id;
 if(v.status!==201||Number(v.data.monto_qr)!==70||Number(v.data.monto_efectivo)!==30||v.data.estado!=='pendiente')throw Error(JSON.stringify(v));
 const invalido=await post('ventas',{items:[{id,cantidad:1}],metodo:'mixto',recibido:100});if(invalido.status!==400)throw Error('Debe rechazar pago mixto sin saldo QR');
 const estado=await (await fetch('http://localhost:3003/api/pedidos/'+v.data.consulta_token)).json();if(estado.estado!=='pendiente')throw Error('Consulta pendiente');const confirmado=await post('ventas/'+venta+'/confirmar',{});if(confirmado.status!==200)throw Error('Confirmación');const pagado=await (await fetch('http://localhost:3003/api/pedidos/'+v.data.consulta_token)).json();if(pagado.estado!=='pagado')throw Error('Consulta pagado');console.log('OK: pago mixto y consulta de estado pendiente a pagado.');
}finally{child.kill();if(venta)await db.query('DELETE FROM tienda.ventas WHERE id=$1',[venta]);if(id)await db.query('DELETE FROM tienda.productos WHERE id=$1',[id]);if(qr!==undefined)await db.query('UPDATE tienda.configuracion SET qr_imagen=$1 WHERE id=1',[qr]);await db.end();}


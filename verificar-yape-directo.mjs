import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
const clave=randomBytes(32).toString('hex'),evento='prueba_'+randomBytes(20).toString('hex');
const hijo=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'production',PORT:'3004',ADMIN_PASSWORD:clave,YAPE_API_TOKEN:clave},stdio:['ignore','pipe','pipe']});
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
try{
 await new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Inicio agotado')),25000);hijo.stdout.on('data',d=>{if(d.toString().includes('iniciado')){clearTimeout(timer);ok();}});hijo.on('exit',()=>{clearTimeout(timer);no(Error('Inicio falló'));});});
 const url='http://localhost:3004/api/yape/notificaciones';const datos={EventoId:evento,FechaRecepcion:new Date().toISOString(),Aplicacion:'prueba.local',TextoOriginal:'PRUEBA TÉCNICA SIN TRANSACCIÓN REAL'};
 const send=token=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(datos)});
 if((await send('incorrecto')).status!==401)throw Error('Autorización');
 if((await send(clave)).status!==201)throw Error('Guardar');
 const dup=await send(clave);if(!(await dup.json()).duplicado)throw Error('Duplicado');
 const headers={Authorization:'Basic '+Buffer.from('admin:'+clave).toString('base64')};
 if((await fetch('http://localhost:3004/api/admin/yape')).status!==401)throw Error('Panel expuesto');
 const rows=await (await fetch('http://localhost:3004/api/admin/yape',{headers})).json();if(!rows.some(r=>r.evento_id===evento))throw Error('Listado');
 const csv=await (await fetch('http://localhost:3004/api/admin/yape/excel.csv',{headers})).text();if(!csv.includes(evento))throw Error('CSV');
 console.log('OK: token, registro persistido, duplicados, panel protegido y descarga Excel.');
}finally{hijo.kill();await db.query('DELETE FROM tienda.notificaciones_yape WHERE evento_id=$1',[evento]);await db.end();}

import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
const clave=randomBytes(24).toString('hex');
const hijo=spawn(process.execPath,[fileURLToPath(new URL('../js/server.js',import.meta.url))],{env:{...process.env,NODE_ENV:'production',PORT:'3002',ADMIN_PASSWORD:clave},stdio:['ignore','pipe','pipe']});
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Inicio agotado')),20000);hijo.stdout.on('data',d=>{if(d.toString().includes('iniciado')){clearTimeout(timer);resolve();}});hijo.on('exit',()=>{clearTimeout(timer);reject(Error('No inició'));});});
 for(const path of ['/','/health','/api/productos','/api/configuracion','/js/inicio.js','/js/vendor/jquery.min.js']){if(!(await fetch('http://localhost:3002'+path)).ok)throw Error(path);}
 for(const path of ['/admin.html','/admin.js','/js/admin.js','/api/ventas']){if((await fetch('http://localhost:3002'+path)).status!==401)throw Error('Acceso sin protección');}
 const r=await fetch('http://localhost:3002/admin.html',{headers:{Authorization:'Basic '+Buffer.from('admin:'+clave).toString('base64')}});if(r.status!==200)throw Error('Login');
 console.log('OK: inicio en producción, web, salud, Neon y autenticación admin.');
}finally{hijo.kill();}

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)).replace(/[\\/]$/,'');
const {normalizarNombre,leerAviso,reconciliarAviso}=await import(pathToFileURL(root+'/pagos-yape.js'));
const app='com.bcp.bo.wallet';
const texto=nombre=>`Recibiste un yapeo\nQR DE ${nombre} te envió Bs. 10,00`;
assert.equal(normalizarNombre('Carlos Ademar Suárez Quispe'),normalizarNombre('SUAREZ QUISPE CARLOS ADEMAR'));
assert.equal(leerAviso(texto('ANA MARIA'),app).centavos,1000);
for(const [t,a] of [[texto('ANA MARIA'),'otra.app'],['Enviaste un yapeo\nANA MARIA te envió Bs. 10,00',app],[texto('ANA MARIA').replace('10,00','10,001'),app],[texto('ANA MARIA').replace('Bs.','USD'),app]])assert.equal(leerAviso(t,a),null);
process.loadEnvFile(root+'/.env');
const {Pool}=createRequire(root+'/package.json')('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const c=await pool.connect();
let id=-Math.floor(Math.random()*100000000)-10000;
const sufijo=randomBytes(8).toString('hex').replace(/[0-9]/g,'X');
let escenario=0;
async function caso(fn){await c.query('SAVEPOINT caso');try{await fn();escenario++;}finally{await c.query('ROLLBACK TO SAVEPOINT caso');}}
async function venta({nombre='PRUEBA '+sufijo,total=10,metodo='qr',creado=new Date(Date.now()-60000)}={}){
 const row=(await c.query(`INSERT INTO tienda.ventas(id,metodo,total,estado,detalle,monto_efectivo,monto_qr,nombre_pagador,nombre_pagador_clave,creado_en) VALUES($1,$2,$3,'pendiente','[]'::jsonb,$4,10,$5,$6,$7) RETURNING id`,[id--,metodo,total,metodo==='mixto'?total-10:0,nombre,normalizarNombre(nombre),creado])).rows[0];return row.id;
}
async function aviso({nombre='PRUEBA '+sufijo,fecha=new Date(),aplicacion=app,raw}={}){const evento='test_'+randomBytes(16).toString('hex');await c.query('INSERT INTO tienda.notificaciones_yape(evento_id,fecha_recepcion,aplicacion,texto_original) VALUES($1,$2,$3,$4)',[evento,fecha,aplicacion,raw??texto(nombre)]);return evento;}
async function estado(id){return(await c.query('SELECT estado,qr_verificado FROM tienda.ventas WHERE id=$1',[id])).rows[0];}
try{
 await c.query('BEGIN');
 await caso(async()=>{const v=await venta(),a=await aviso();assert.equal((await reconciliarAviso(c,a)).pedido_id,v);assert.equal((await estado(v)).estado,'pagado');assert.equal(await reconciliarAviso(c,a),null);const otro=await venta(),dup=await aviso();assert.equal(await reconciliarAviso(c,dup),null);assert.equal((await estado(otro)).estado,'pendiente');});
 await caso(async()=>{const v=await venta();await venta();assert.equal(await reconciliarAviso(c,await aviso()),null);assert.equal((await estado(v)).estado,'pendiente');});
 await caso(async()=>{const v=await venta();assert.equal(await reconciliarAviso(c,await aviso({nombre:'OTRO PAGADOR'})),null);assert.equal((await estado(v)).estado,'pendiente');});
 await caso(async()=>{await venta();assert.equal(await reconciliarAviso(c,await aviso({raw:texto('PRUEBA '+sufijo).replace('10,00','11,00')})),null);});
 await caso(async()=>{await venta({creado:new Date(Date.now()-3600000)});assert.equal(await reconciliarAviso(c,await aviso()),null);});
 await caso(async()=>{await venta({creado:new Date(Date.now()+60000)});assert.equal(await reconciliarAviso(c,await aviso()),null);});
 await caso(async()=>{await venta();assert.equal(await reconciliarAviso(c,await aviso({aplicacion:'otra.app'})),null);});
 await caso(async()=>{const v=await venta({total:15,metodo:'mixto'});assert.equal((await reconciliarAviso(c,await aviso())).estado,'pendiente');assert.deepEqual(await estado(v),{estado:'pendiente',qr_verificado:true});});
 await caso(async()=>{await venta();assert.equal(await reconciliarAviso(c,await aviso({fecha:new Date(Date.now()+120000)})),null);});
 console.log(`OK: formato de aviso y ${escenario} escenarios de conciliación; coincidencia, duplicados, ambigüedad, nombre, monto, fecha, origen y pago mixto. Todo revertido, sin confirmar pagos reales.`);
}finally{await c.query('ROLLBACK');c.release();await pool.end();}

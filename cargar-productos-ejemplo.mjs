import {readFile} from 'node:fs/promises';
import pg from 'pg';
const datos=JSON.parse(await readFile(new URL('./datos/productos-ejemplo.json',import.meta.url),'utf8'));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
try{
 const existentes=new Set((await pool.query('SELECT lower(nombre) AS nombre FROM tienda.productos')).rows.map(p=>p.nombre));
 const nuevos=datos.filter(p=>!existentes.has(p.nombre.toLowerCase()));
 if(!nuevos.length){console.log(JSON.stringify({agregados:0,mensaje:'Los productos de ejemplo ya existen. No se modificaron.'}));}
 else{
  let indice=0;const preparados=[];
  async function preparar(){while(indice<nuevos.length){const p=nuevos[indice++];const r=await fetch(p.imagen_url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('No se pudo descargar la portada de '+p.nombre);const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>1500000||bytes[0]!==255||bytes[1]!==216)throw Error('Portada inválida de '+p.nombre);preparados.push({...p,imagen:'data:image/jpeg;base64,'+bytes.toString('base64')});}}
  await Promise.all([preparar(),preparar(),preparar(),preparar()]);
  const c=await pool.connect();
  try{
   await c.query('BEGIN');await c.query('LOCK TABLE tienda.productos IN SHARE ROW EXCLUSIVE MODE');
   await c.query('INSERT INTO tienda.categorias(nombre) SELECT DISTINCT x.categoria FROM jsonb_to_recordset($1::jsonb) AS x(categoria text) ON CONFLICT DO NOTHING',[JSON.stringify(preparados)]);
   const r=await c.query(`INSERT INTO tienda.productos(nombre,descripcion,categoria,precio,stock,imagen)
    SELECT x.nombre,x.descripcion,x.categoria,x.precio,x.stock,x.imagen FROM jsonb_to_recordset($1::jsonb) AS x(nombre text,descripcion text,categoria text,precio numeric,stock integer,imagen text)
    WHERE NOT EXISTS(SELECT 1 FROM tienda.productos p WHERE lower(p.nombre)=lower(x.nombre)) RETURNING id,nombre,categoria`,[JSON.stringify(preparados)]);
   await c.query('COMMIT');console.log(JSON.stringify({agregados:r.rowCount,productos:r.rows},null,2));
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}finally{await pool.end();}

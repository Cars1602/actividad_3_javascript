import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const base='http://localhost:3001/api/';let cat,id,qrAnterior;
async function api(p,method='GET',data){const r=await fetch(base+p,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const json=await r.json();if(!r.ok)throw Error(JSON.stringify(json));return json;}
try{
 const original=await api('configuracion');qrAnterior=original.qr_imagen;
 cat=await api('categorias','POST',{nombre:'Prueba '+Date.now()});
 const cs=await api('categorias');if(!cs.some(c=>c.id===cat.id))throw Error('Categoría');
 const imagen='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4b0AAAAASUVORK5CYII=';
 const p=await api('productos','POST',{nombre:'Prueba categoría',categoria:cat.nombre,precio:5,stock:2,imagen});id=p.id;
 await api('configuracion/qr','PUT',{imagen});if((await api('configuracion')).qr_imagen!==imagen)throw Error('QR');
 console.log('OK: categoría, producto asociado y QR compartido persistidos.');
}finally{
 if(qrAnterior!==undefined)await pool.query('UPDATE tienda.configuracion SET qr_imagen=$1 WHERE id=1',[qrAnterior]);
 if(id)await pool.query('DELETE FROM tienda.productos WHERE id=$1',[id]);
 if(cat)await pool.query('DELETE FROM tienda.categorias WHERE id=$1',[cat.id]);
 await pool.end();
}

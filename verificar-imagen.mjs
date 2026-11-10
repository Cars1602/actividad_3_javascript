import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});let id;
try{
 for(const path of ['/','/admin.html','/admin.js','/app.js']){const r=await fetch('http://localhost:3001'+path);if(!r.ok)throw Error(path);}
 const imagen='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4b0AAAAASUVORK5CYII=';
 const r=await fetch('http://localhost:3001/api/productos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:'Prueba imagen',precio:10,stock:3,descripcion:'Descripción de prueba',categoria:'General',imagen})});const p=await r.json();if(r.status!==201)throw Error(JSON.stringify(p));id=p.id;
 const productos=await (await fetch('http://localhost:3001/api/productos')).json();const guardado=productos.find(p=>p.id===id);if(guardado.imagen!==imagen||guardado.descripcion!=='Descripción de prueba')throw Error('Persistencia');console.log('OK: tienda, panel y producto con imagen persistida en PostgreSQL.');
}finally{if(id)await pool.query('DELETE FROM lab3_productos WHERE id=$1',[id]);await pool.end();}

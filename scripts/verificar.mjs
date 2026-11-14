import pg from 'pg';
const base='http://localhost:3001';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const ids=[];const ventas=[];
async function request(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
try {
 for(const path of ['/','/js/vendor/jquery.min.js','/estilos.css','/js/inicio.js']){if(!(await fetch(base+path)).ok)throw Error(path);}
 const p=await request('/api/productos',{nombre:'Prueba de integración',precio:8,stock:5});if(p.status!==201)throw Error('Crear');ids.push(p.data.id);
 const insuf=await request('/api/ventas',{items:[{id:p.data.id,cantidad:2}],metodo:'efectivo',recibido:1});if(insuf.status!==400)throw Error('Efectivo insuficiente');
 const v=await request('/api/ventas',{items:[{id:p.data.id,cantidad:2}],metodo:'efectivo',recibido:20});if(v.status!==201||Number(v.data.total)!==16)throw Error('Venta efectivo');ventas.push(v.data.id);
 const qr=await request('/api/ventas',{items:[{id:p.data.id,cantidad:1}],metodo:'qr'});if(qr.status!==201||qr.data.estado!=='pendiente')throw Error('Venta QR');ventas.push(qr.data.id);
 const conf=await request('/api/ventas/'+qr.data.id+'/confirmar',{});if(conf.data.estado!=='pagado')throw Error('Confirmar QR');
 const sobre=await request('/api/ventas',{items:[{id:p.data.id,cantidad:99}],metodo:'qr'});if(sobre.status!==400)throw Error('Stock');
 console.log('OK: archivos, registro, efectivo insuficiente, cobro, QR pendiente, confirmación y existencias.');
}finally{await pool.query('DELETE FROM lab3_ventas WHERE id=ANY($1::int[])',[ventas]);await pool.query('DELETE FROM lab3_productos WHERE id=ANY($1::int[])',[ids]);await pool.end();}

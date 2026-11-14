import pg from 'pg';
import {readFile} from 'node:fs/promises';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
try{await pool.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));await pool.query(await readFile(new URL('../migracion.sql',import.meta.url),'utf8'));const r=await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='tienda' ORDER BY tablename");console.log('Conexión Neon OK. Tablas: '+r.rows.map(x=>x.tablename).join(', '));}finally{await pool.end();}

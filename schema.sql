-- PostgreSQL: estructura de la tienda. Ejecutar en Neon SQL Editor.
-- Un esquema propio evita conflictos con ejercicios anteriores.
CREATE SCHEMA IF NOT EXISTS tienda;
CREATE TABLE IF NOT EXISTS tienda.categorias (
 id SERIAL PRIMARY KEY,
 nombre VARCHAR(60) NOT NULL UNIQUE CHECK(length(trim(nombre))>0)
);
INSERT INTO tienda.categorias(nombre) VALUES ('General') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS tienda.productos (
 id SERIAL PRIMARY KEY,
 nombre VARCHAR(100) NOT NULL CHECK(length(trim(nombre))>0),
 descripcion VARCHAR(500) NOT NULL DEFAULT '',
 categoria VARCHAR(60) NOT NULL REFERENCES tienda.categorias(nombre),
 precio NUMERIC(12,2) NOT NULL CHECK(precio>0 AND precio<100000000),
 stock INTEGER NOT NULL CHECK(stock>=0),
 imagen TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tienda.ventas (
 id SERIAL PRIMARY KEY,
 metodo VARCHAR(10) NOT NULL CHECK(metodo IN ('efectivo','qr')),
 total NUMERIC(14,2) NOT NULL CHECK(total>0),
 recibido NUMERIC(14,2),
 estado VARCHAR(15) NOT NULL CHECK(estado IN ('pendiente','pagado')),
 detalle JSONB NOT NULL CHECK(jsonb_typeof(detalle)='array'),
 creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- El detalle JSON conserva el nombre y precio vendidos aunque cambie el catálogo.
CREATE TABLE IF NOT EXISTS tienda.configuracion (
 id INTEGER PRIMARY KEY CHECK(id=1),
 qr_imagen TEXT NOT NULL DEFAULT '',
 actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO tienda.configuracion(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS productos_categoria_idx ON tienda.productos(categoria);
CREATE INDEX IF NOT EXISTS ventas_fecha_idx ON tienda.ventas(creado_en DESC);

-- Pago mixto: el efectivo y el QR siempre suman el total.
ALTER TABLE tienda.ventas DROP CONSTRAINT IF EXISTS ventas_metodo_check;
ALTER TABLE tienda.ventas ADD CONSTRAINT ventas_metodo_check CHECK(metodo IN ('efectivo','qr','mixto'));
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS monto_efectivo NUMERIC(14,2);
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS monto_qr NUMERIC(14,2);
UPDATE tienda.ventas SET monto_efectivo=CASE WHEN metodo='efectivo' THEN total ELSE 0 END,
 monto_qr=CASE WHEN metodo='qr' THEN total ELSE 0 END WHERE monto_efectivo IS NULL;
ALTER TABLE tienda.ventas ALTER COLUMN monto_efectivo SET NOT NULL;
ALTER TABLE tienda.ventas ALTER COLUMN monto_qr SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ventas_importes_check' AND conrelid='tienda.ventas'::regclass) THEN
 ALTER TABLE tienda.ventas ADD CONSTRAINT ventas_importes_check CHECK(monto_efectivo>=0 AND monto_qr>=0 AND monto_efectivo+monto_qr=total);
 END IF;
END $$;

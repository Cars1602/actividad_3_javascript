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

-- Clave privada de consulta del pedido para el comprador.
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS consulta_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS ventas_consulta_token_idx ON tienda.ventas(consulta_token);

-- Avisos enviados por el teléfono; recibir un aviso no confirma una venta.
CREATE TABLE IF NOT EXISTS tienda.notificaciones_yape (
 evento_id VARCHAR(128) PRIMARY KEY,
 fecha_recepcion TIMESTAMPTZ NOT NULL,
 aplicacion VARCHAR(200) NOT NULL,
 texto_original TEXT NOT NULL,
 estado VARCHAR(20) NOT NULL DEFAULT 'por_revisar',
 pedido_id INTEGER UNIQUE REFERENCES tienda.ventas(id),
 registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tienda.notificaciones_yape ADD COLUMN IF NOT EXISTS sheets_sincronizado_en TIMESTAMPTZ;

-- Conciliación por aviso del teléfono: los pedidos antiguos conservan revisión manual.
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS nombre_pagador VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS nombre_pagador_clave TEXT NOT NULL DEFAULT '';
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS qr_verificado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tienda.notificaciones_yape ADD COLUMN IF NOT EXISTS huella_pago TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS yape_huella_asociada_idx ON tienda.notificaciones_yape(huella_pago) WHERE pedido_id IS NOT NULL;

-- Cada venta mantiene su propia sincronización, además de los avisos del teléfono.
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS sheets_sincronizado_en TIMESTAMPTZ;

ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(150) NOT NULL DEFAULT '';
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS cliente_email VARCHAR(254) NOT NULL DEFAULT '';
ALTER TABLE tienda.ventas ADD COLUMN IF NOT EXISTS correo_enviado_en TIMESTAMPTZ;

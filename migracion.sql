CREATE TABLE IF NOT EXISTS tienda.migraciones (nombre TEXT PRIMARY KEY);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM tienda.migraciones WHERE nombre='catalogo_inicial') THEN
  IF to_regclass('public.lab3_productos') IS NOT NULL THEN
   INSERT INTO tienda.categorias(nombre) SELECT DISTINCT categoria FROM public.lab3_productos ON CONFLICT DO NOTHING;
   INSERT INTO tienda.productos(id,nombre,precio,stock,descripcion,categoria,imagen)
   SELECT id,nombre,precio,stock,descripcion,categoria,imagen FROM public.lab3_productos ON CONFLICT DO NOTHING;
  END IF;
  IF to_regclass('public.lab3_ventas') IS NOT NULL THEN
   INSERT INTO tienda.ventas SELECT * FROM public.lab3_ventas ON CONFLICT DO NOTHING;
  END IF;
  PERFORM setval(pg_get_serial_sequence('tienda.productos','id'),COALESCE((SELECT max(id) FROM tienda.productos),1),EXISTS(SELECT 1 FROM tienda.productos));
  PERFORM setval(pg_get_serial_sequence('tienda.ventas','id'),COALESCE((SELECT max(id) FROM tienda.ventas),1),EXISTS(SELECT 1 FROM tienda.ventas));
  INSERT INTO tienda.migraciones VALUES('catalogo_inicial');
 END IF;
END $$;

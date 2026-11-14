-- Ejecutar en el SQL Editor de Neon, en la base utilizada por NexusPlay.
-- Consultas de lectura para revisar la conexión y los registros de la tienda.

-- 1. Identificar la base de datos y la hora de la consulta.
SELECT
    current_database() AS base_de_datos,
    now() AT TIME ZONE 'America/La_Paz' AS hora_bolivia;

-- 2. Revisar las últimas ventas y el aviso de Yape asociado, si existe.
-- En pagos mixtos, qr_verificado puede ser true y la venta seguir pendiente
-- hasta que administración compruebe también la entrega del efectivo.
SELECT
    v.id AS pedido,
    v.creado_en AT TIME ZONE 'America/La_Paz' AS fecha_bolivia,
    v.metodo,
    v.total,
    v.monto_efectivo,
    v.monto_qr,
    v.estado AS estado_venta,
    v.qr_verificado,
    n.evento_id AS aviso_asociado,
    n.estado AS estado_aviso
FROM tienda.ventas AS v
LEFT JOIN tienda.notificaciones_yape AS n ON n.pedido_id = v.id
ORDER BY v.id DESC
LIMIT 50;

-- 3. Revisar los últimos avisos recibidos desde Android.
-- pedido_id identifica la venta asociada. Un valor NULL indica un aviso sin asociar.
SELECT
    evento_id,
    fecha_recepcion AT TIME ZONE 'America/La_Paz' AS recibido_bolivia,
    aplicacion,
    texto_original,
    estado,
    pedido_id
FROM tienda.notificaciones_yape
ORDER BY registrado_en DESC, evento_id
LIMIT 50;

-- 4. Revisar el catálogo y las existencias actuales.
SELECT id, nombre, categoria, precio, stock
FROM tienda.productos
ORDER BY id DESC;

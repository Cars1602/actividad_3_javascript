# actividad_3_javascript


## Lector Android directo sin Power Automate
En Render configurar YAPE_API_TOKEN como una clave aleatoria privada de al menos 32 caracteres. En Android, Endpoint: https://actividad-3-javascript.onrender.com/api/yape/notificaciones. Token: el mismo valor de YAPE_API_TOKEN (sin escribir Bearer). Guardar con lectura activa y autorizar el acceso a notificaciones. Verificar que el paquete coincida con la versión de Yape instalada. Los eventos pendientes se envían con Reintentar envíos pendientes.

La ruta guarda las columnas enviadas por la app en tienda.notificaciones_yape y deduplica por EventoId. Solo devuelve éxito después de guardar en Neon. El panel admin lista los avisos y permite asociar uno a una venta pendiente tras revisión manual bancaria. No confirma por coincidencia de importe. El cliente consulta Verificar pago para obtener el estado desde Neon. La descarga Excel es CSV, no modifica el libro compartido de SharePoint.

## Confirmación por avisos de Yape Bolivia



En un pedido nuevo, indicar el nombre completo del titular que pagará por QR y confirmar el pedido antes de transferir. La app debe enviar el aviso a Render. El servidor compara nombre completo (sin importar orden de nombres y apellidos), monto QR exacto y recepción durante los 30 minutos posteriores al pedido. Solo se asocia si hay un candidato. No se consulta una API bancaria: la confirmación se basa en el aviso recibido del teléfono autorizado.



Los pedidos antiguos sin titular, textos no reconocidos, coincidencias múltiples y avisos con igual texto y fecha original que otro ya asociado quedan para revisión manual. Un aviso con igual texto y fecha original no se aplica a dos ventas. Pagos del mismo titular por igual importe se pueden reconocer si sus avisos tienen fechas distintas y cada uno coincide con un solo pedido. En pagos mixtos se reconoce el QR, pero la venta continúa pendiente hasta que administración compruebe el efectivo.



La página principal consulta el estado cada 8 segundos. Google Sheets conserva una copia de los avisos y no es necesario que esté disponible para actualizar el estado del pedido en Neon.



Validación: `node --env-file-if-exists=.env verificar-autopago.mjs`. Usa datos de prueba dentro de una transacción que se revierte; no confirma ventas reales.


El servidor reintenta cada 8 segundos la asociación de avisos pendientes compatibles con pedidos recientes, sin pulsar Confirmar en administración.


## QR con monto de demostración y edición

La tienda mantiene el QR estático bancario y agrega la opción `QR con monto (demo)`. El servidor calcula el importe desde los productos del carrito y genera un QR de texto, marcado como NO VÁLIDO PARA PAGAR. No realiza cobros, crea ventas, confirma pagos ni descuenta inventario.

En administración, el botón Editar de cada producto carga nombre, categoría, precio, descripción, cantidad e imagen. Guardar cambios actualiza el producto existente; no exige subir la foto otra vez. Cancelar edición vuelve al alta. La ruta PUT /api/productos/:id requiere las credenciales de administración en producción.

Prueba: `node --env-file-if-exists=.env verificar-qr-edicion.mjs`. Crea un producto temporal de prueba, comprueba edición y generación de QR, y elimina exclusivamente ese producto al terminar.

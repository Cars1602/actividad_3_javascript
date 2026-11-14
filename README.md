# actividad_3_javascript

## Organización del código

```text
public/
  index.html                 Página de inicio y tienda
  admin.html                 Panel de administración
  estilos.css                Estilos de las páginas
  js/
    inicio.js                Catálogo, filtros, carrito y seguimiento del pago
    factura.js               Comprobante de compra e impresión
    admin.js                 Productos, categorías, ventas y avisos de Yape
    vendor/
      jquery.min.js          Biblioteca jQuery
js/
  server.js                  Servidor Express, API y acceso a PostgreSQL
  pagos-yape.js              Lectura y conciliación de los avisos
  sheets-sync.js             Sincronización con Google Sheets
scripts/
  verificar-*.mjs             Pruebas de las funciones del proyecto
  comprobar-*.mjs             Comprobación de conexiones y despliegue
  cargar-productos-ejemplo.mjs Carga del catálogo de ejemplo
  GoogleSheets.gs            Integración para Google Apps Script
  preparar_render.py         Herramienta de preparación del despliegue
  seguimiento_pago.py        Herramienta de actualización del seguimiento
```

`npm start` inicia `js/server.js`. Express publica los archivos de `public`.
Los scripts `verificar-*.mjs` y `comprobar-*.mjs` de la carpeta scripts permiten ejecutar
las comprobaciones del proyecto.


## Lector Android directo sin Power Automate
En Render configurar YAPE_API_TOKEN como una clave aleatoria privada de al menos 32 caracteres. En Android, Endpoint: https://actividad-3-javascript.onrender.com/api/yape/notificaciones. Token: el mismo valor de YAPE_API_TOKEN (sin escribir Bearer). Guardar con lectura activa y autorizar el acceso a notificaciones. Verificar que el paquete coincida con la versión de Yape instalada. Los eventos pendientes se envían con Reintentar envíos pendientes.

La ruta guarda las columnas enviadas por la app en tienda.notificaciones_yape y deduplica por EventoId. Solo devuelve éxito después de guardar en Neon. El panel admin lista los avisos y permite asociar uno a una venta pendiente tras revisión manual bancaria. No confirma por coincidencia de importe. El cliente consulta Verificar pago para obtener el estado desde Neon. La descarga Excel es CSV, no modifica el libro compartido de SharePoint.

## Confirmación por avisos de Yape Bolivia



En un pedido nuevo, indicar el nombre completo del titular que pagará por QR y confirmar el pedido antes de transferir. La app debe enviar el aviso a Render. El servidor compara nombre completo (sin importar orden de nombres y apellidos), monto QR exacto y recepción durante los 30 minutos posteriores al pedido. Solo se asocia si hay un candidato. No se consulta una API bancaria: la confirmación se basa en el aviso recibido del teléfono autorizado.



Los pedidos antiguos sin titular, textos no reconocidos, coincidencias múltiples y avisos con igual texto y fecha original que otro ya asociado quedan para revisión manual. Un aviso con igual texto y fecha original no se aplica a dos ventas. Pagos del mismo titular por igual importe se pueden reconocer si sus avisos tienen fechas distintas y cada uno coincide con un solo pedido. En pagos mixtos se reconoce el QR, pero la venta continúa pendiente hasta que administración compruebe el efectivo.



La página principal consulta el estado cada 8 segundos. Google Sheets conserva una copia de los avisos y no es necesario que esté disponible para actualizar el estado del pedido en Neon.



Validación: `node --env-file-if-exists=.env scripts/verificar-autopago.mjs`. Usa datos de prueba dentro de una transacción que se revierte; no confirma ventas reales.


El servidor reintenta cada 8 segundos la asociación de avisos pendientes compatibles con pedidos recientes, sin pulsar Confirmar en administración.


## QR con monto de demostración y edición

La tienda mantiene el QR estático bancario y agrega la opción `QR con monto (demo)`. El servidor calcula el importe desde los productos del carrito y genera un QR de texto, marcado como NO VÁLIDO PARA PAGAR. No realiza cobros, crea ventas, confirma pagos ni descuenta inventario.

En administración, el botón Editar de cada producto carga nombre, categoría, precio, descripción, cantidad e imagen. Guardar cambios actualiza el producto existente; no exige subir la foto otra vez. Cancelar edición vuelve al alta. La ruta PUT /api/productos/:id requiere las credenciales de administración en producción.

Prueba: `node --env-file-if-exists=.env scripts/verificar-qr-edicion.mjs`. Crea un producto temporal de prueba, comprueba edición y generación de QR, y elimina exclusivamente ese producto al terminar.


## Filtros y catálogo de ejemplo

La tienda filtra por categoría y búsqueda a la vez, muestra el número de resultados y permite ordenar por nombre o precio. El carrito incluye miniaturas, precio unitario, subtotal y controles de cantidad.

El catálogo consulta el inventario automáticamente cada 15 segundos mientras la página
está visible. Muestra la última actualización y resalta los productos modificados.
Si cambian el precio o las existencias, el carrito ajusta sus datos y muestra un aviso.
En móvil, la barra inferior abre el carrito en un diálogo. El estado del pedido se
representa con los pasos de registro, espera y confirmación del pago.
La administración se organiza en las pestañas Productos, Categorías, Ventas y
Configuración QR, con navegación mediante las flechas del teclado.

Se cargaron 20 productos de ejemplo sin modificar los productos anteriores. Precios y cantidades son demostrativos y se pueden cambiar desde administración. Las portadas proceden de Steam; cada entrada conserva su URL de origen en datos/productos-ejemplo.json.

Para cargar estos ejemplos en otra base de datos: `node --env-file-if-exists=.env scripts/cargar-productos-ejemplo.mjs`. La carga es explícita, no se ejecuta al iniciar el servidor y omite nombres ya existentes.

## Factura del pedido

Al confirmarse el pago aparece Ver e imprimir factura. La página factura.html consulta el pedido con su clave privada y usa el detalle de la venta guardada en Neon, sin tomar los precios actuales del catálogo. Incluye productos, cantidades, subtotales, fecha, forma de pago, total y cambio en efectivo. El botón Imprimir / Guardar PDF abre la impresión del navegador. Los pedidos pendientes no muestran una factura. Es un comprobante de compra sin validez fiscal; no existe integración tributaria.

## Correo con PDF por Gmail API
El comprador ingresa nombre y correo. Cada 15 segundos el servidor busca pedidos pagados sin correo enviado. PDFKit genera el PDF y Nodemailer compone el mensaje MIME; Gmail API lo entrega por HTTPS con OAuth 2.0. No se usa SMTP.

Configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN y GMAIL_FROM en Render o .env. Ver GOOGLE_CLOUD_CORREO.md. Ejecutar npm install antes de iniciar. No guardar secretos en Git. Los fallos se reintentan; una interrupcion entre el envio y el registro en Neon puede producir un duplicado.

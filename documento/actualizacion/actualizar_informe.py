from pathlib import Path
from docx import Document
from docx.shared import Inches,Pt
from docx.oxml import OxmlElement
import json
base=Path(r'C:/Users/Carlos/Downloads/Informe_NexusPlay_APA7_final.docx')
d=Document(base)
# Conservar el informe previo y actualizar rutas que cambiaron al reorganizar el proyecto.
for p in d.paragraphs:
 for r in p.runs:
  r.text=r.text.replace('public/app.js','public/js/inicio.js').replace('public/admin.js','public/js/admin.js')
  if 'líneas 72 a 73' in r.text:r.text=r.text.replace(', líneas 72 a 73','')
  if 'líneas 5 a 5' in r.text:r.text=r.text.replace(', líneas 5 a 5','')
ancla=next(p for p in d.paragraphs if p.text.strip()=='Ejes transversales')
def par(text,style=None):
 p=d.add_paragraph(text,style);ancla._p.addprevious(p._p);return p
def head(text):return par(text,'Heading 2')
def table(headers,rows):
 t=d.add_table(rows=1,cols=len(headers));t.style='Table Grid'
 for c,x in zip(t.rows[0].cells,headers):c.text=x
 trpr=t.rows[0]._tr.get_or_add_trPr();trpr.append(OxmlElement('w:tblHeader'))
 for row in rows:
  for c,x in zip(t.add_row().cells,row):c.text=str(x)
 for row in t.rows:
  for cell in row.cells:
   for p in cell.paragraphs:
    for run in p.runs:run.font.size=Pt(10)
 ancla._p.addprevious(t._tbl)
head('Actualización del proyecto con confirmación por correo')
par('La tienda incorpora nombre del comprador y correo electrónico al registrar el pedido. La confirmación del pago se muestra debajo del catálogo y del carrito, y el comprador puede abrir el comprobante de compra. Cuando la venta queda pagada, el servidor prepara un PDF y lo envía como adjunto mediante Gmail API. La recepción del mensaje del pedido 17 se observa en la captura del correo presentada en esta actualización.')
head('Google Auth y autorización de la cuenta remitente')
par('Google Cloud contiene el proyecto con Gmail API habilitada y el cliente OAuth 2.0. La cuenta remitente autoriza el permiso https://www.googleapis.com/auth/gmail.send. El servidor utiliza el ID del cliente, su secreto y un refresh token para obtener un access token temporal. Los compradores solo escriben sus datos de contacto; no autorizan sus propias cuentas de Google.')
par('El aviso de aplicación o desarrollador no verificado pertenece al proceso de autorización de Google. Crear un cliente OAuth no equivale a obtener la verificación de Google. Una autorización de prueba puede permitir el envío para usuarios habilitados sin que la aplicación haya completado la verificación pública. La ausencia de un aviso en una sesión no demuestra que el desarrollador esté verificado. En aplicaciones externas en estado Testing, los refresh tokens con permisos Gmail normalmente caducan a los siete días (Google, s. f.).')
par('Las variables privadas del servicio en Render son GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN y GMAIL_FROM. El archivo .env está excluido de Git. El informe no reproduce secretos ni tokens. No se usa contraseña SMTP para entregar estos mensajes.')
head('Ubicación de las API y responsabilidades del código')
par('Las rutas HTTP propias están definidas en js/server.js y se publican bajo https://actividad-3-javascript.onrender.com. public/js/inicio.js realiza las consultas AJAX de la tienda; public/js/admin.js administra productos, ventas y confirmaciones; public/js/factura.js consulta el pedido y construye el comprobante mediante el DOM. js/correo.js genera el PDF y llama a las API externas de Google.')
par('Tabla 2').runs[0].bold=True
par('Rutas principales de la tienda').runs[0].italic=True
table(['Método y ruta','Uso y protección'],[
('GET /health','Comprueba la conexión con PostgreSQL.'),('GET /api/productos','Devuelve catálogo, precio, stock e imagen en JSON.'),('GET /api/categorias','Devuelve las categorías disponibles.'),('POST /api/ventas','Valida carrito, datos del comprador e importes y registra la venta en una transacción.'),('GET /api/pedidos/:token','Consulta privada mediante una clave aleatoria del pedido; no usa el número de venta como autorización.'),('GET /api/admin/ventas/historial','Historial y estado del correo. Requiere autenticación administrativa.'),('POST /api/ventas/:id/confirmar','Confirmación administrativa tras comprobar el pago recibido.'),('POST /api/yape/notificaciones','Recibe avisos del lector Android con Bearer token; un aviso por sí solo no demuestra la transferencia bancaria.')])
head('Funcionamiento del nuevo envío por correo electrónico')
par('Primero, el usuario selecciona productos y escribe nombre y correo. jQuery captura el envío del formulario y $.ajax transmite JSON a POST /api/ventas. El servidor vuelve a validar cantidades, stock, precios y correo, guarda el detalle de la compra en Neon y devuelve una clave privada de consulta. El precio y la portada de cada nuevo producto comprado se conservan en el detalle de la venta.')
par('En efectivo se conserva la confirmación automática del sistema. En QR estático, el pedido queda pendiente hasta que la conciliación del aviso compatible o la revisión administrativa confirma el pago. La página consulta su estado cada ocho segundos mientras está pendiente. La conciliación compara el titular y el importe del QR; los casos ambiguos requieren revisión. El proyecto no consulta una API bancaria de verificación del saldo.')
par('Cada quince segundos, enviarConfirmaciones revisa las ventas pagadas con correo y sin correo_enviado_en. Un bloqueo de PostgreSQL evita que dos procesos ejecuten simultáneamente este envío. PDFKit prepara el documento con el título Pago confirmado, el pedido, comprador, productos, portadas, forma de pago y total. Si una imagen no está disponible o no es compatible, la generación mantiene una tarjeta de sustitución.')
par('Nodemailer compone el mensaje MIME y adjunta el PDF; no entrega el mensaje mediante SMTP. El servidor renueva el acceso en https://oauth2.googleapis.com/token y hace POST a https://gmail.googleapis.com/gmail/v1/users/me/messages/send con el mensaje codificado en base64url. Gmail devuelve una respuesta de aceptación y el servidor registra correo_enviado_en. Esa aceptación no garantiza que el destinatario lo lea ni que no se clasifique como spam (Google, s. f.).')
par('Los errores se muestran mediante correo_error y se reintentan. Una interrupción después de entregar a Gmail y antes de registrar el resultado puede provocar un mensaje duplicado. Las compras antiguas sin correo guardado no se envían automáticamente. El PDF es un comprobante de compra sin validez fiscal.')
head('Pruebas de la API y reproducción en Postman')
par('El 13 de noviembre de 2026 se verificaron por HTTP las siguientes rutas del servicio publicado, sin registrar ventas ni modificar pagos. Estos resultados corresponden a solicitudes HTTP efectuadas durante la revisión; la ejecución en Postman se documenta por separado mediante sus capturas.')
resultados=json.loads(Path('documento/pruebas_http_actualizacion.json').read_text(encoding='utf-8-sig'))
par('Tabla 3').runs[0].bold=True
par('Resultados de las consultas HTTP del servicio publicado').runs[0].italic=True
table(['Solicitud','Resultado','Interpretación'],[(r['ruta'],r['estado'], {'/health':'Servicio y conexión disponibles.','/api/productos':'Catálogo en JSON.','/api/categorias':'Categorías en JSON.','/api/pedidos/no-valido':'Se rechaza la clave de pedido inválida.','/api/admin/ventas/historial':'Se rechaza el acceso sin credenciales.'}[r['ruta']]) for r in resultados])
par('Para reproducir en Postman, crear la variable base_url con https://actividad-3-javascript.onrender.com y usar las mismas rutas. Para las consultas válidas, comprobar código 200 y contenido JSON. Para una clave inválida, comprobar 400. Para el historial sin autorización, comprobar 401. Al consultar un pedido real, guardar su token únicamente como variable privada y no incluirlo en las capturas.')
par('Para verificar el registro de una compra en un entorno de prueba, enviar POST {{base_url}}/api/ventas con Content-Type application/json. El cuerpo incluye items, metodo, recibido, nombre_pagador, cliente_nombre y cliente_email. En QR, el importe se calcula en el servidor y el pedido debe quedar pendiente hasta la confirmación. Esta operación descuenta inventario y crea una venta: no se ejecutó como prueba adicional sobre producción durante esta revisión.')
par('Ejemplo de cuerpo JSON para el entorno de pruebas')
par('{"items":[{"id":1,"cantidad":1}],"metodo":"qr","recibido":0,"nombre_pagador":"Titular de prueba","cliente_nombre":"Comprador de prueba","cliente_email":"comprador@example.com"}')
head('Capturas del correo y del comprobante recibido')
for n,name,title,note in [(20,'codex-clipboard-a4a64f11-cf1f-480a-b947-7e47711035cb.png','Recepción del correo del pedido 17 con PDF adjunto','Captura facilitada por el autor. Se observa la recepción del mensaje de confirmación en Gmail; corresponde al diseño anterior del PDF.'),(21,'codex-clipboard-866bbd07-93bd-4f01-8b1e-804bad35aaf6.png','Confirmación de pago debajo del carrito','Captura facilitada por el autor durante la mejora de la interfaz. La posición de la confirmación se conserva debajo de la compra.')]:
 par('Figura '+str(n)).runs[0].bold=True
 q=par(title);q.runs[0].italic=True;q.paragraph_format.keep_with_next=True
 q=par('');q.add_run().add_picture(str(Path('C:/Users/Carlos/AppData/Local/Temp')/name),width=Inches(2.7 if n==20 else 5.8));q.paragraph_format.keep_with_next=True
 par('Nota. '+note)
# Referencias sigue siendo el último apartado, sin anexos al final.
for text in ['Google. (s. f.). Create and send email messages. Google for Developers. https://developers.google.com/workspace/gmail/api/guides/sending','Google. (s. f.). Using OAuth 2.0 to access Google APIs. Google for Developers. https://developers.google.com/identity/protocols/oauth2']:
 d.add_paragraph(text)
out=Path('documento/actualizacion/Informe_NexusPlay_APA7_correo_borrador.docx');d.save(out)
print('Borrador actualizado; faltan capturas de Google Auth y Postman.')

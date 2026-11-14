# Correo de NexusPlay con Google Cloud y Gmail API

1. En https://console.cloud.google.com/ selecciona o crea un proyecto y habilita **Gmail API** en la biblioteca de APIs.
2. Configura Google Auth Platform: nombre NexusPlay, correo de soporte y audiencia. Si usas modo de prueba, agrega tu cuenta remitente como usuario de prueba.
3. Crea un cliente OAuth 2.0 de tipo aplicación web. Para autorizar mediante OAuth Playground, registra exactamente esta URI de redirección: `https://developers.google.com/oauthplayground`.
4. Abre https://developers.google.com/oauthplayground/ y en configuración activa **Use your own OAuth credentials**. Introduce allí el ID y secreto de tu cliente. Solicita acceso offline y el permiso `https://www.googleapis.com/auth/gmail.send`.
5. Autoriza con la cuenta Gmail que enviará las confirmaciones y cambia el código por tokens. Copia el refresh token directamente a las variables privadas del servidor. No lo compartas en chats ni en Git.
6. En Render → Environment configura `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` y `GMAIL_FROM` (la dirección Gmail autorizada). En local usa `.env`.
7. Instala dependencias con `npm install` y reinicia/publica el servicio. Realiza una compra de prueba con un correo bajo tu control. Comprueba el PDF y el campo `correo_enviado_en` en Neon.

Los compradores no necesitan iniciar sesión en Google: solo el propietario autoriza la cuenta remitente. El permiso solicitado permite enviar correo; no pide lectura de la bandeja.

En aplicaciones externas en estado Testing, los refresh tokens con permisos Gmail normalmente caducan a los siete días. Revisa la publicación y los requisitos de verificación de Google antes de usarlo permanentemente.

Documentación: https://developers.google.com/workspace/gmail/api/guides/sending y https://developers.google.com/identity/protocols/oauth2

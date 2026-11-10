# Conectar Google Sheets

Hoja elegida: https://docs.google.com/spreadsheets/d/10JvrtW9e_xrDLzKBFEGilIcti8UUPeKjf-iDQjhnRp0/edit

1. En esa hoja abrir Extensiones > Apps Script.
2. Pegar GoogleSheets.gs y guardar.
3. Configuración del proyecto > Propiedades del script: crear REGISTRO_TOKEN con una clave privada aleatoria de al menos 32 caracteres, diferente del token Android.
4. Ejecutar prepararHoja y autorizar el acceso a esa hoja. Crea PagosYape con encabezados si no existe; no reemplaza otras pestañas.
5. Implementar > Nueva implementación > Aplicación web. Ejecutar como tu cuenta. Para recibir el POST desde Render, el acceso debe permitir llamadas sin inicio de sesión interactivo; el script exige REGISTRO_TOKEN en cada solicitud. Si la universidad no permite esta implementación, no funcionará este método.
6. Copiar la URL terminada en /exec a GOOGLE_SHEETS_URL en Environment de Render.
7. Guardar la misma clave de REGISTRO_TOKEN como GOOGLE_SHEETS_TOKEN en Render.
8. Subir los cambios del proyecto a GitHub y esperar el despliegue.
9. En admin > Avisos Yape, pulsar Sincronizar Google Sheets. Primero probar con un registro técnico, sin transferencias reales.

La app Android mantiene el endpoint https://actividad-3-javascript.onrender.com/api/yape/notificaciones y YAPE_API_TOKEN. Este token es independiente de GOOGLE_SHEETS_TOKEN. No usar el enlace /edit de Sheets como endpoint.

Solo se sincronizan los avisos que llegaron al servidor. Si el historial del lector está vacío, hay que corregir su acceso o paquete Yape antes. No se generan registros a partir de una transferencia que el lector no capturó.

El servidor conserva los avisos en Neon, reintenta cada minuto, y Google actualiza la misma fila por EventoId en lugar de duplicarla. Google Sheets muestra el estado registrado; los pagos se verifican en administración. No hay confirmación bancaria automática.

const url=process.env.GOOGLE_SHEETS_URL;
for(const method of ['GET','POST']){
try{const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify({token:process.env.GOOGLE_SHEETS_TOKEN,eventos:[]}):undefined,signal:AbortSignal.timeout(30000)});const text=await r.text();let resumen;try{resumen=JSON.parse(text);}catch{resumen=text.includes('No se pudo abrir')?'Google indica que no pudo abrir el archivo.':text.includes('accounts.google.com')?'Solicita inicio de sesión.':text.includes('doGet')?'No hay doGet; endpoint requiere POST.':'Respuesta HTML de Google.';}console.log(JSON.stringify({method,status:r.status,resumen}));}catch(e){console.log(method+': '+e.message);}
}

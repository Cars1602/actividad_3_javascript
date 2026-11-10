const base='https://actividad-3-javascript.onrender.com';
for(const [path,method] of [['/health','GET'],['/api/yape/notificaciones','POST']]){
 try{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(45000)});const type=r.headers.get('content-type')||'';console.log(path+' HTTP '+r.status);if(type.includes('json'))console.log(JSON.stringify(await r.json()));}catch(e){console.log(path+': '+e.message);}
}

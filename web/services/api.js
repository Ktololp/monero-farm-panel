
let getCsrf = () => '';
let onUnauthorized = () => {};

export function configureApi({ getCsrf: csrfProvider, onUnauthorized: unauthorizedHandler } = {}) {
  if (typeof csrfProvider === 'function') getCsrf = csrfProvider;
  if (typeof unauthorizedHandler === 'function') onUnauthorized = unauthorizedHandler;
}

export async function api(path,options={}){
  const headers={...(options.body&&!(options.body instanceof FormData)?{'content-type':'application/json'}:{}),...(options.headers||{})};
  if(!['GET','HEAD'].includes((options.method||'GET').toUpperCase()))headers['x-csrf-token']=getCsrf();
  let res;try{res=await fetch(`/api/v1${path}`,{...options,headers,body:options.body&&!(options.body instanceof FormData)&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});}
  catch{throw new Error('Потеряна связь с backend панели. Проверьте окно START_WINDOWS и data/panel-crash.log.');}
  if(res.status===401){onUnauthorized();throw new Error('Требуется вход');}
  const ct=res.headers.get('content-type')||'',data=ct.includes('application/json')?await res.json():await res.text();
  if(!res.ok)throw new Error(data?.error||data||`HTTP ${res.status}`);return data;
}

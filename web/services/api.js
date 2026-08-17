let getCsrf = () => '';
let onUnauthorized = () => {};
let translate = id => id;

export function configureApi({ getCsrf: csrfProvider, onUnauthorized: unauthorizedHandler, t: translateProvider } = {}) {
  if (typeof csrfProvider === 'function') getCsrf = csrfProvider;
  if (typeof unauthorizedHandler === 'function') onUnauthorized = unauthorizedHandler;
  if (typeof translateProvider === 'function') translate = translateProvider;
}

function readableError(payload, status) {
  if (payload && typeof payload === 'object' && payload.error) return String(payload.error);
  if (typeof payload !== 'string') return `HTTP ${status}`;
  const text = payload.trim();
  if (!text) return `HTTP ${status}`;
  if (!/<(?:!doctype|html|body|pre|br)\b/i.test(text)) return text;
  try {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const raw = (doc.querySelector('pre')?.textContent || doc.body?.textContent || '').trim();
    const withoutStack = raw
      .replace(/\s+at\s+(?:async\s+)?[^\n]*?(?:file:\/\/\/|node:internal\/)[\s\S]*$/i, '')
      .trim();
    return (withoutStack || `HTTP ${status}`).replace(/^Error:\s*/i, '');
  } catch {
    return `HTTP ${status}`;
  }
}

export async function api(path,options={}){
  const headers={...(options.body&&!(options.body instanceof FormData)?{'content-type':'application/json'}:{}),...(options.headers||{})};
  if(!['GET','HEAD'].includes((options.method||'GET').toUpperCase()))headers['x-csrf-token']=getCsrf();
  let res;try{res=await fetch(`/api/v1${path}`,{...options,headers,body:options.body&&!(options.body instanceof FormData)&&typeof options.body!=='string'?JSON.stringify(options.body):options.body});}
  catch{throw new Error(translate('api.backendUnavailable'));}
  if(res.status===401){onUnauthorized();throw new Error(translate('api.loginRequired'));}
  const ct=res.headers.get('content-type')||'',data=ct.includes('application/json')?await res.json():await res.text();
  if(!res.ok)throw new Error(readableError(data,res.status));return data;
}

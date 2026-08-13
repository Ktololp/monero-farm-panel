import { i18n } from '@lingui/core';
import { messages as enMessages } from '../locales/en/messages.mjs';
import { messages as ruMessages } from '../locales/ru/messages.mjs';
import { sourceMessages } from './messages/index.js';

const STORAGE_KEY='mfp.locale',SUPPORTED=new Set(['ru','en']),listeners=new Set();
i18n.load('en',enMessages);i18n.load('ru',ruMessages);
function saved(){try{const x=globalThis.localStorage?.getItem(STORAGE_KEY);return SUPPORTED.has(x)?x:'ru';}catch{return'ru';}}
let locale=saved();i18n.activate(locale);

export const getLocale=()=>locale;
export const getLocaleTag=()=>locale==='en'?'en-US':'ru-RU';
export function t(key,values={}){
  const descriptor=sourceMessages[key];
  if(!descriptor){console.warn('[i18n] unknown message id:',key);return String(key);}
  return i18n._({...descriptor,values});
}
let localeClickBound=false;
function syncLocaleButtons(root=globalThis.document){
  root?.querySelectorAll?.('[data-locale]').forEach(el=>{
    const active=el.dataset.locale===locale;
    el.classList.toggle('active',active);
    el.setAttribute('aria-pressed',String(active));
  });
}
export function applyStaticI18n(root=globalThis.document){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  root.querySelectorAll('[data-i18n-title]').forEach(el=>el.title=t(el.dataset.i18nTitle));
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=t(el.dataset.i18nPlaceholder));
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAriaLabel)));
  syncLocaleButtons(root);
}
export function onLocaleChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function setLocale(next){
  if(!SUPPORTED.has(next))return false;locale=next;i18n.activate(locale);
  try{globalThis.localStorage?.setItem(STORAGE_KEY,locale);}catch{}
  if(globalThis.document?.documentElement)globalThis.document.documentElement.lang=locale;
  applyStaticI18n();for(const fn of listeners)fn(locale);
  const CE=globalThis.CustomEvent;
  if(CE)globalThis.document?.dispatchEvent?.(new CE('mfp:locale-change',{detail:{locale}}));
  return true;
}
function onLocaleClick(event){
  const button=event?.target?.closest?.('[data-locale]');
  if(!button)return;
  event.preventDefault?.();
  setLocale(button.dataset.locale);
}
export function initI18n(){
  i18n.activate(locale);
  if(globalThis.document?.documentElement)globalThis.document.documentElement.lang=locale;
  applyStaticI18n();
  if(globalThis.document?.addEventListener&&!localeClickBound){
    globalThis.document.addEventListener('click',onLocaleClick);
    localeClickBound=true;
  }
  return locale;
}

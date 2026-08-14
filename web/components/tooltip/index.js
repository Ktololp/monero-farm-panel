const SELECTOR=[
  '.help-icon[data-tip]',
  '[data-tooltip]',
  '[title]',
  '[data-i18n-title]'
].join(',');

const tooltip=document.createElement('div');
tooltip.id='mfp-tooltip';
tooltip.className='mfp-tooltip';
tooltip.setAttribute('role','tooltip');
tooltip.setAttribute('aria-hidden','true');
tooltip.innerHTML='<div class="mfp-tooltip__text"></div>';
document.body.append(tooltip);
const textNode=tooltip.querySelector('.mfp-tooltip__text');

let active=null;
let restoreTitle=null;

function resolveTarget(node){
  return node instanceof Element ? node.closest(SELECTOR) : null;
}

function tooltipText(el){
  if(!el)return'';
  return String(
    el.getAttribute('data-tip') ||
    el.getAttribute('data-tooltip') ||
    el.getAttribute('title') ||
    el.getAttribute('aria-label') ||
    ''
  ).trim();
}

function suppressNativeTitle(el){
  if(!el.hasAttribute('title'))return;
  restoreTitle={el,value:el.getAttribute('title')};
  el.removeAttribute('title');
}
function restoreNativeTitle(){
  if(!restoreTitle)return;
  const {el,value}=restoreTitle;
  if(el?.isConnected && value!=null && !el.hasAttribute('title'))el.setAttribute('title',value);
  restoreTitle=null;
}

function positionTooltip(anchor){
  const margin=10;
  const gap=9;
  const rect=anchor.getBoundingClientRect();
  const box=tooltip.getBoundingClientRect();
  const viewportW=document.documentElement.clientWidth;
  const viewportH=document.documentElement.clientHeight;

  let placement='top';
  let top=rect.top-box.height-gap;
  if(top<margin){
    placement='bottom';
    top=rect.bottom+gap;
  }
  top=Math.max(margin,Math.min(top,viewportH-box.height-margin));

  let left=rect.left+(rect.width/2)-(box.width/2);
  left=Math.max(margin,Math.min(left,viewportW-box.width-margin));

  const anchorCenter=rect.left+(rect.width/2);
  const arrowLeft=Math.max(12,Math.min(anchorCenter-left,box.width-12));
  tooltip.style.left=String(Math.round(left))+'px';
  tooltip.style.top=String(Math.round(top))+'px';
  tooltip.style.setProperty('--mfp-tooltip-arrow-left',String(Math.round(arrowLeft))+'px');
  tooltip.dataset.placement=placement;
}

function showTooltip(el){
  const text=tooltipText(el);
  if(!text)return;
  if(active && active!==el)hideTooltip();
  active=el;
  suppressNativeTitle(el);
  textNode.textContent=text;
  tooltip.classList.add('is-visible');
  tooltip.setAttribute('aria-hidden','false');
  el.setAttribute('aria-describedby','mfp-tooltip');
  requestAnimationFrame(()=>{
    if(active===el)positionTooltip(el);
  });
}

function hideTooltip(el=active){
  if(!active)return;
  const target=active;
  if(el && target!==el)return;
  target.removeAttribute('aria-describedby');
  active=null;
  tooltip.classList.remove('is-visible');
  tooltip.setAttribute('aria-hidden','true');
  restoreNativeTitle();
}

function refreshTooltip(){
  if(!active)return;
  const text=tooltipText(active);
  if(!text){hideTooltip();return;}
  textNode.textContent=text;
  positionTooltip(active);
}

document.addEventListener('pointerover',event=>{
  const el=resolveTarget(event.target);
  if(!el)return;
  if(event.relatedTarget instanceof Node && el.contains(event.relatedTarget))return;
  showTooltip(el);
});

document.addEventListener('pointerout',event=>{
  const el=resolveTarget(event.target);
  if(!el || active!==el)return;
  if(event.relatedTarget instanceof Node && el.contains(event.relatedTarget))return;
  hideTooltip(el);
});

document.addEventListener('focusin',event=>{
  const el=resolveTarget(event.target);
  if(el)showTooltip(el);
});

document.addEventListener('focusout',event=>{
  const el=resolveTarget(event.target);
  if(el && active===el)hideTooltip(el);
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape')hideTooltip();
});

window.addEventListener('resize',refreshTooltip,{passive:true});
window.addEventListener('scroll',refreshTooltip,{passive:true,capture:true});
document.addEventListener('mfp:locale-change',refreshTooltip);

export { hideTooltip, refreshTooltip };


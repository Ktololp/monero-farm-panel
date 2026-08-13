const sections = [
  ['◫','dashboard'],
  ['▦','servers'],
  ['⚒','xmrig'],
  ['⇄','proxy'],
  ['🟠','p2pool'],
  ['◉','monerod'],
  ['💰','income'],
  ['❤','health'],
  ['🧠','baseline'],
  ['♻','recovery'],
  ['⚡','operations'],
  ['⌨','terminal'],
  ['↻','updates'],
  ['⌘','topology'],
  ['🔔','alerts'],
  ['≡','audit']
];

export function createDocsPage(ctx) {
  const { $, esc, setHeader, t } = ctx;

  function renderDocs() {
    setHeader(t('docs.title'),t('docs.subtitle'));
    $('#view').innerHTML = `
      <div class="panel docs-intro"><h2>${t('docs.howTo')}</h2><p>${t('docs.howToText')} <span class="help-icon static-help">ⓘ</span></p></div>
      <div class="docs-grid">${sections.map(([icon,key]) => `<article class="panel doc-card"><div class="doc-icon">${esc(icon)}</div><div><h2>${esc(t(`docs.section.${key}.title`))}</h2><p>${esc(t(`docs.section.${key}.text`))}</p></div></article>`).join('')}</div>
      <div class="panel"><h2>🟠 ${t('docs.p2poolTitle')}</h2><p>${t('docs.p2poolText')}</p></div>
      <div class="panel"><h2>⇄ ${t('docs.proxyTitle')}</h2><p>${t('docs.proxyText')}</p></div>
      <div class="panel"><h2>🔐 ${t('docs.securityTitle')}</h2><p>${t('docs.securityText')}</p></div>`;
  }

  return { renderDocs };
}


const sections = [
  ['◫', 'Дашборд', 'Главное состояние фермы: общий хешрейт, предполагаемый доход, Fleet Health Score, курс XMR/USD и активные алерты.'],
  ['▦', 'Серверы', 'Список майнеров. Панель подключается по SSH, поэтому отдельный агент на майнерах не нужен.'],
  ['⚒', 'XMRig', 'Хешрейт 10s/60s/15m, uptime, accepted/rejected, pool, версия, логи и управление.'],
  ['⇄', 'XMRig Proxy', 'Автоматически обнаруживает и устанавливает XMRig Proxy. После установки кнопка «Перевести XMRig на XMRig Proxy» делает backup config, безопасно переключает pool и автоматически откатывается, если хешрейт не восстановится. Повторная установка и повторное переключение блокируются.'],
  ['🟠', 'P2Pool аналитика', 'Показывает local 15m/1h/24h hashrate, shares found/failed, effort, workers и статистику sidechain. Если Data API выключен, кнопка включает его автоматически с backup и безопасным restart.'],
  ['◉', 'monerod', 'Синхронизация, height, peers, network difficulty и награда последнего блока.'],
  ['💰', 'Оценка дохода', 'Автоматическая оценка XMR/сутки и USD/сутки/30 дней по текущему хешрейту фермы, сложности сети, награде блока и курсу XMR. Это статистическая оценка, а не гарантия дохода.'],
  ['❤', 'Fleet Health Score', 'Оценка 0–100 по каждому серверу и всей ферме: online/offline, деградация хешрейта, температура, rejected shares, сеть, monerod и свежие ошибки.'],
  ['🧠', 'Базовая норма', 'Панель изучает обычный 60s-хешрейт сервера и использует его для детектора деградации.'],
  ['♻', 'Auto Recovery', 'После grace period может автоматически восстановить XMRig при устойчивом сбое и соблюдает cooldown, чтобы не создать restart-loop.'],
  ['⚡', 'Операции', 'Профили производительности, rolling restart, rolling update XMRig, Huge Pages, MSR, Auto Fix и удалённые команды.'],
  ['⌨', 'SSH-терминал', 'Интерактивный терминал в браузере через SSH-соединение панели.'],
  ['↻', 'Обновления', 'Проверка версий компонентов и фоновые rolling-операции. Linux/Docker host может использовать mfp update/backup/rollback.'],
  ['⌘', 'Топология', 'Наглядно показывает цепочку майнер → pool/P2Pool → monerod и состояния компонентов.'],
  ['🔔', 'Оповещения', 'Предупреждения о температуре, offline, деградации хешрейта и других проблемах. Поддерживается Telegram.'],
  ['≡', 'Журнал', 'Audit log действий: кто и когда менял настройки, запускал операции и управлял серверами.']
];

export function createDocsPage(ctx) {
  const { $, esc, setHeader } = ctx;
  function renderDocs() {
    setHeader('Документация', 'Коротко и понятно о функциях Monero Farm Panel');
    $('#view').innerHTML = `
      <div class="panel docs-intro"><h2>Как пользоваться</h2><p>Наведи курсор на маленький значок <span class="help-icon static-help">ⓘ</span> рядом с функцией — появится короткое объяснение. Здесь собраны те же функции чуть подробнее.</p></div>
      <div class="docs-grid">${sections.map(([icon,title,text]) => `<article class="panel doc-card"><div class="doc-icon">${esc(icon)}</div><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></article>`).join('')}</div>
      <div class="panel"><h2>🟠 Как включить расширенную P2Pool-аналитику</h2><p>Запускай P2Pool с параметрами <code>--data-api /путь/к/api --local-api</code>. Панель найдёт путь в аргументах процесса и прочитает JSON локально через SSH. Публиковать эти файлы в Интернет не нужно.</p></div>
      <div class="panel"><h2>⇄ Как включить XMRig Proxy API</h2><p>В config.json xmrig-proxy включи HTTP API на <code>127.0.0.1</code>. Панель пытается определить порт и access-token из локального config.json на сервере и обращается к API через SSH.</p></div>
      <div class="panel"><h2>🔐 Безопасность</h2><p>XMRig/XMRig Proxy API рекомендуется оставлять на localhost. Не выставляй панель напрямую в Интернет без VPN или защищённого reverse proxy.</p></div>`;
  }
  return { renderDocs };
}

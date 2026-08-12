import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function createTerminalController({ $, esc, modal, closeModal, getSocket }) {
  let terminal = null;
  let fitAddon = null;
  let terminalServerId = null;

  function fitTerminal() {
    try { fitAddon?.fit(); } catch {}
  }

  function close() {
    if (terminalServerId) getSocket()?.emit('terminal:close', { serverId: terminalServerId });
    window.removeEventListener('resize', fitTerminal);
    try { terminal?.dispose(); } catch {}
    terminal = null;
    fitAddon = null;
    terminalServerId = null;
  }

  async function open(server) {
    if (terminal) close();
    terminalServerId = Number(server.id);
    modal(`<div class="modal-head"><div><h2>⌨ SSH · ${esc(server.name)}</h2><div class="muted small">${esc(server.username)}@${esc(server.host)}:${server.port}</div></div><button id="close-terminal" class="ghost">✕</button></div><div id="terminal-box"></div>`);
    $('#close-terminal').onclick = closeModal;

    terminal = new Terminal({ cursorBlink: true, fontFamily: 'Consolas,Menlo,monospace', fontSize: 14, theme: { background: '#070b14' } });
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open($('#terminal-box'));
    fitAddon.fit();
    terminal.focus();

    terminal.onData(data => getSocket()?.emit('terminal:input', { serverId: server.id, data }));
    terminal.onResize(({ cols, rows }) => getSocket()?.emit('terminal:resize', { serverId: server.id, cols, rows }));
    getSocket()?.emit('terminal:open', { serverId: server.id, cols: terminal.cols, rows: terminal.rows }, ack => {
      if (!ack?.ok) terminal.write(`\r\n\x1b[31m${ack?.error || 'SSH error'}\x1b[0m\r\n`);
    });

    setTimeout(() => fitAddon?.fit(), 100);
    window.addEventListener('resize', fitTerminal);
  }

  function handleData(serverId, data) {
    if (terminal && terminalServerId === Number(serverId)) terminal.write(data);
  }

  function handleClose(serverId) {
    if (terminal && terminalServerId === Number(serverId)) terminal.write('\r\n\x1b[33m[SSH-сессия закрыта]\x1b[0m\r\n');
  }

  return {
    open,
    close,
    isOpen: () => Boolean(terminal),
    handleData,
    handleClose
  };
}

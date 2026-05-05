/**
 * ChatWidget — embeddable chat widget for small businesses
 *
 * Usage:
 *   <script src="chat-widget.js"
 *     data-client="demo-restaurant"
 *     data-backend="https://your-backend.com"
 *     data-name="Nombre del negocio"
 *     data-color="#0F62FE"
 *     data-emoji="🍽️"
 *     data-welcome="¡Hola! ¿En qué puedo ayudarte?"
 *   ></script>
 */
(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const script    = document.currentScript || document.querySelector('script[data-client]');
  const CLIENT_ID = script?.dataset.client  || '';
  const API_URL   = (script?.dataset.backend || 'http://localhost:3000').replace(/\/$/, '');
  const COLOR     = script?.dataset.color   || '#0F62FE';
  const BOT_NAME  = script?.dataset.name    || 'Asistente';
  const EMOJI     = script?.dataset.emoji   || '💬';
  const WELCOME   = script?.dataset.welcome || '¡Hola! ¿En qué puedo ayudarte?';

  // Derived colors (darken primary slightly for hover states)
  const COLOR_DARK = shadeColor(COLOR, -15);

  function shadeColor(hex, pct) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + pct));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + pct));
    const b = Math.min(255, Math.max(0, (num & 0xff) + pct));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let messages  = [];
  let isOpen    = false;
  let isLoading = false;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .cw-wrap *, .cw-wrap *::before, .cw-wrap *::after {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 0;
    }

    /* ── Toggle button ── */
    .cw-btn {
      position: fixed; bottom: 24px; right: 24px;
      width: 56px; height: 56px; border-radius: 50%;
      background: ${COLOR}; color: #fff;
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 18px rgba(0,0,0,0.28);
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.15s;
      z-index: 99999;
    }
    .cw-btn:hover { background: ${COLOR_DARK}; transform: scale(1.07); box-shadow: 0 6px 26px rgba(0,0,0,0.32); }
    .cw-btn svg { width: 24px; height: 24px; }

    /* ── Panel ── */
    .cw-panel {
      position: fixed; bottom: 92px; right: 24px;
      width: 360px; height: 530px;
      background: #fff; border-radius: 16px;
      box-shadow: 0 10px 48px rgba(0,0,0,0.18);
      display: flex; flex-direction: column; overflow: hidden;
      z-index: 99998;
      transform: translateY(20px) scale(0.96);
      opacity: 0; pointer-events: none;
      transition: transform 0.28s cubic-bezier(.34,1.56,.64,1), opacity 0.2s ease;
    }
    .cw-panel.cw-open {
      transform: translateY(0) scale(1);
      opacity: 1; pointer-events: auto;
    }
    @media (max-width: 430px) {
      .cw-panel { width: calc(100vw - 28px); right: 14px; bottom: 82px; height: 70vh; }
      .cw-btn   { bottom: 14px; right: 14px; }
      .cw-input { font-size: 16px; }
    }

    /* ── Header ── */
    .cw-header {
      background: ${COLOR}; color: #fff;
      padding: 14px 16px;
      display: flex; align-items: center; gap: 10px;
      flex-shrink: 0;
    }
    .cw-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: rgba(255,255,255,0.22);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; flex-shrink: 0;
    }
    .cw-header-info { flex: 1; min-width: 0; }
    .cw-header-name {
      font-weight: 600; font-size: 14.5px; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cw-header-status { font-size: 11.5px; opacity: 0.82; margin-top: 1px; }
    .cw-header-status::before {
      content: ''; display: inline-block;
      width: 7px; height: 7px; border-radius: 50%;
      background: #4cff91; margin-right: 4px; vertical-align: middle;
    }
    .cw-close {
      background: none; border: none; color: #fff; cursor: pointer;
      opacity: 0.75; padding: 4px; transition: opacity 0.15s;
      display: flex; align-items: center; flex-shrink: 0;
    }
    .cw-close:hover { opacity: 1; }
    .cw-close svg { width: 20px; height: 20px; }

    /* ── Messages area ── */
    .cw-messages {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 14px 14px 8px;
      display: flex; flex-direction: column; gap: 8px;
      scroll-behavior: smooth;
    }
    .cw-messages::-webkit-scrollbar { width: 3px; }
    .cw-messages::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }

    /* ── Message bubbles ── */
    .cw-msg {
      max-width: 82%; padding: 9px 13px;
      border-radius: 14px; font-size: 13.5px; line-height: 1.5;
      word-break: break-word; white-space: pre-wrap;
      animation: cw-pop 0.22s ease;
    }
    @keyframes cw-pop {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .cw-msg--bot {
      background: #F0F2F5; color: #1a1a1a;
      border-bottom-left-radius: 4px; align-self: flex-start;
    }
    .cw-msg--user {
      background: ${COLOR}; color: #fff;
      border-bottom-right-radius: 4px; align-self: flex-end;
    }
    .cw-msg--error {
      background: #FFF0EE; color: #C62828;
      border: 1px solid #FFCDD2;
      border-radius: 10px; align-self: center;
      font-size: 12.5px; text-align: center; max-width: 90%;
    }

    /* ── Typing indicator ── */
    .cw-typing {
      align-self: flex-start;
      background: #F0F2F5; border-radius: 14px; border-bottom-left-radius: 4px;
      padding: 10px 14px;
      animation: cw-pop 0.22s ease;
    }
    .cw-dots { display: flex; gap: 4px; align-items: center; }
    .cw-dots span {
      width: 7px; height: 7px; border-radius: 50%; background: #aaa;
      animation: cw-dot 1.3s infinite;
    }
    .cw-dots span:nth-child(2) { animation-delay: 0.18s; }
    .cw-dots span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes cw-dot {
      0%, 70%, 100% { transform: translateY(0); opacity: 0.4; }
      35%            { transform: translateY(-5px); opacity: 1; }
    }

    /* ── Input area ── */
    .cw-footer {
      padding: 10px 12px; border-top: 1px solid #EBEBEB;
      display: flex; gap: 8px; align-items: flex-end;
      background: #fff; flex-shrink: 0;
    }
    .cw-input {
      flex: 1; border: 1.5px solid #E0E0E0; border-radius: 12px;
      padding: 8px 12px; font-size: 13.5px; color: #1a1a1a;
      resize: none; outline: none;
      min-height: 38px; max-height: 110px;
      line-height: 1.45; font-family: inherit;
      transition: border-color 0.15s;
    }
    .cw-input:focus { border-color: ${COLOR}; }
    .cw-input::placeholder { color: #bbb; }
    .cw-send {
      width: 38px; height: 38px; border-radius: 10px;
      background: ${COLOR}; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #fff; flex-shrink: 0;
      transition: background 0.15s, opacity 0.15s;
    }
    .cw-send:hover:not(:disabled) { background: ${COLOR_DARK}; }
    .cw-send:disabled { opacity: 0.38; cursor: not-allowed; }
    .cw-send svg { width: 17px; height: 17px; }

    /* ── Powered by ── */
    .cw-credit {
      text-align: center; font-size: 10px; color: #ccc;
      padding: 4px 0 6px; flex-shrink: 0; background: #fff;
    }
  `;
  document.head.appendChild(styleEl);

  // ── DOM ────────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'cw-wrap';

  // Toggle button
  const btn = document.createElement('button');
  btn.className = 'cw-btn';
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.innerHTML = `
    <svg class="cw-icon-chat" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>
    <svg class="cw-icon-x" viewBox="0 0 24 24" fill="currentColor" style="display:none">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;

  // Panel
  const panel = document.createElement('div');
  panel.className = 'cw-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Chat de soporte');

  // Header
  const header = document.createElement('div');
  header.className = 'cw-header';
  header.innerHTML = `
    <div class="cw-avatar">${EMOJI}</div>
    <div class="cw-header-info">
      <div class="cw-header-name">${BOT_NAME}</div>
      <div class="cw-header-status">En línea</div>
    </div>
    <button class="cw-close" aria-label="Cerrar chat">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>`;

  // Messages
  const msgsEl = document.createElement('div');
  msgsEl.className = 'cw-messages';
  msgsEl.setAttribute('role', 'log');
  msgsEl.setAttribute('aria-live', 'polite');
  msgsEl.setAttribute('aria-label', 'Conversación');

  // Input area
  const footer = document.createElement('div');
  footer.className = 'cw-footer';

  const textarea = document.createElement('textarea');
  textarea.className = 'cw-input';
  textarea.placeholder = 'Escribe tu mensaje...';
  textarea.setAttribute('aria-label', 'Escribe tu mensaje');
  textarea.rows = 1;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'cw-send';
  sendBtn.setAttribute('aria-label', 'Enviar mensaje');
  sendBtn.disabled = true;
  sendBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>`;

  const credit = document.createElement('div');
  credit.className = 'cw-credit';
  credit.textContent = 'Powered by ChatBot SaaS';

  footer.append(textarea, sendBtn);
  panel.append(header, msgsEl, footer, credit);
  wrap.append(panel, btn);
  document.body.appendChild(wrap);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function addBubble(role, text) {
    const el = document.createElement('div');
    el.className = `cw-msg cw-msg--${role}`;
    el.textContent = text;
    msgsEl.appendChild(el);
    scrollBottom();
    return el;
  }

  function addError(text) {
    const el = document.createElement('div');
    el.className = 'cw-msg cw-msg--error';
    el.textContent = text;
    msgsEl.appendChild(el);
    scrollBottom();
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'cw-typing';
    el.innerHTML = '<div class="cw-dots"><span></span><span></span><span></span></div>';
    msgsEl.appendChild(el);
    scrollBottom();
    return el;
  }

  function scrollBottom() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function autoResize() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 110) + 'px';
  }

  function openPanel(open) {
    isOpen = open ?? !isOpen;
    panel.classList.toggle('cw-open', isOpen);
    btn.querySelector('.cw-icon-chat').style.display = isOpen ? 'none' : '';
    btn.querySelector('.cw-icon-x').style.display    = isOpen ? ''     : 'none';
    btn.setAttribute('aria-label', isOpen ? 'Cerrar chat' : 'Abrir chat');
    if (isOpen) setTimeout(() => textarea.focus(), 280);
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function send() {
    const text = textarea.value.trim();
    if (!text || isLoading) return;

    messages.push({ role: 'user', content: text });
    addBubble('user', text);

    textarea.value = '';
    textarea.style.height = 'auto';
    sendBtn.disabled = true;
    isLoading = true;

    const typingEl = showTyping();

    try {
      const res = await fetch(`${API_URL}/api/chat?client=${encodeURIComponent(CLIENT_ID)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      });

      typingEl.remove();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { reply } = await res.json();
      messages.push({ role: 'assistant', content: reply });
      addBubble('bot', reply);
    } catch (err) {
      typingEl.remove();
      // Remove last user message so user can retry
      messages.pop();
      addError('No pude conectarme al servidor. Por favor intenta de nuevo.');
      console.error('[ChatWidget]', err);
    } finally {
      isLoading = false;
      textarea.focus();
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  btn.addEventListener('click', () => openPanel());
  header.querySelector('.cw-close').addEventListener('click', () => openPanel(false));

  textarea.addEventListener('input', () => {
    autoResize();
    sendBtn.disabled = !textarea.value.trim();
  });

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) send();
    }
  });

  sendBtn.addEventListener('click', send);

  // Close panel when clicking outside
  document.addEventListener('click', e => {
    if (isOpen && !wrap.contains(e.target)) openPanel(false);
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  if (WELCOME) {
    addBubble('bot', WELCOME);
  }
})();

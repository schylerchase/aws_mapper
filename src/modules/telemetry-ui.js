// Consent prompt + debug panel for the telemetry module.
// Both are injected into a parent element you supply, so this module does
// not assume any specific markup in index.html. See .telemetry/integration.md.

import { recordConsent, notePrompted, getConsent, debugLastN, isEnabled } from './telemetry.js';

const PROMPT_HTML_ID = 'telemetry-consent-prompt';
const DEBUG_HTML_ID = 'telemetry-debug-panel';

// ---- First run consent prompt -------------------------------------------
// Renders a small modal into parentEl. Only renders if the consent state
// is 'deferred'. Calls onResolve(choice) after the user picks accepted or
// declined. Safe to call repeatedly; it removes any prior prompt first.
function renderConsentPrompt(parentEl, onResolve) {
  if (!isEnabled()) {return;}
  if (!parentEl || typeof parentEl.appendChild !== 'function') {return;}
  removeNode(PROMPT_HTML_ID);
  if (getConsent() !== 'deferred') {return;}

  const wrap = document.createElement('div');
  wrap.id = PROMPT_HTML_ID;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-labelledby', PROMPT_HTML_ID + '-title');
  wrap.style.cssText =
    'position:fixed;right:16px;bottom:16px;max-width:380px;background:var(--panel,#1c1f26);color:var(--fg,#e7eaf0);border:1px solid var(--border,#2a2f3a);border-radius:10px;padding:14px 16px;font:13px/1.45 system-ui,sans-serif;z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,0.35)';

  const title = document.createElement('div');
  title.id = PROMPT_HTML_ID + '-title';
  title.style.cssText = 'font-weight:600;margin-bottom:6px;font-size:14px';
  title.textContent = 'Help improve AWS Network Mapper';

  const body = document.createElement('div');
  body.style.cssText = 'margin-bottom:10px;color:var(--fg-dim,#b6bccb)';
  body.textContent =
    'Send anonymous, aggregate usage counts to the maintainer. ' +
    'No AWS account IDs, ARNs, region names, or resource details are ever sent. ' +
    'You can change this any time in Settings.';

  const linkRow = document.createElement('div');
  linkRow.style.cssText = 'margin-bottom:10px';
  const seeLink = document.createElement('a');
  seeLink.href = '#';
  seeLink.textContent = 'See exactly what gets sent';
  seeLink.style.cssText =
    'color:var(--accent,#7aa2f7);text-decoration:underline;cursor:pointer;font-size:12px';
  seeLink.addEventListener('click', function (e) {
    e.preventDefault();
    renderDebugPanel(parentEl);
  });
  linkRow.appendChild(seeLink);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

  const decline = document.createElement('button');
  decline.type = 'button';
  decline.textContent = 'No thanks';
  decline.style.cssText =
    'padding:6px 12px;border:1px solid var(--border,#2a2f3a);background:transparent;color:inherit;border-radius:6px;cursor:pointer';
  decline.addEventListener('click', function () {
    _resolve('declined');
  });

  const accept = document.createElement('button');
  accept.type = 'button';
  accept.textContent = 'Send anonymous counts';
  accept.style.cssText =
    'padding:6px 12px;border:0;background:var(--accent,#7aa2f7);color:#0a0d12;border-radius:6px;cursor:pointer;font-weight:600';
  accept.addEventListener('click', function () {
    _resolve('accepted');
  });

  btnRow.appendChild(decline);
  btnRow.appendChild(accept);

  wrap.appendChild(title);
  wrap.appendChild(body);
  wrap.appendChild(linkRow);
  wrap.appendChild(btnRow);
  parentEl.appendChild(wrap);

  notePrompted();

  function _resolve(choice) {
    recordConsent(choice, 'first_run_prompt');
    removeNode(PROMPT_HTML_ID);
    if (typeof onResolve === 'function') {onResolve(choice);}
  }
}

// ---- Settings toggle row ------------------------------------------------
// Returns a DOM node you can mount inside the existing settings popover.
function buildSettingsRow() {
  if (!isEnabled()) {return null;}
  const row = document.createElement('div');
  row.className = 'gtc-row telemetry-settings-row';
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px';

  const label = document.createElement('span');
  label.textContent = 'Anonymous usage telemetry';
  label.style.flex = '1';

  const select = document.createElement('select');
  ['accepted', 'declined', 'deferred'].forEach(function (v) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v === 'accepted' ? 'On' : v === 'declined' ? 'Off' : 'Not decided';
    select.appendChild(opt);
  });
  select.value = getConsent();
  select.addEventListener('change', function () {
    recordConsent(select.value, 'settings_panel');
  });

  const debugBtn = document.createElement('button');
  debugBtn.type = 'button';
  debugBtn.textContent = 'View';
  debugBtn.title = 'View what is being sent';
  debugBtn.style.cssText =
    'padding:2px 8px;border:1px solid var(--border,#2a2f3a);background:transparent;color:inherit;border-radius:4px;cursor:pointer';
  debugBtn.addEventListener('click', function () {
    renderDebugPanel(document.body);
  });

  row.appendChild(label);
  row.appendChild(select);
  row.appendChild(debugBtn);
  return row;
}

// ---- "View what is being sent" debug panel ------------------------------
// A floating modal showing the last 50 batches in their exact wire form.
function renderDebugPanel(parentEl) {
  if (!parentEl || typeof parentEl.appendChild !== 'function') {return;}
  removeNode(DEBUG_HTML_ID);

  const wrap = document.createElement('div');
  wrap.id = DEBUG_HTML_ID;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.style.cssText =
    'position:fixed;inset:5% 10%;background:var(--panel,#1c1f26);color:var(--fg,#e7eaf0);border:1px solid var(--border,#2a2f3a);border-radius:10px;padding:16px 18px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;z-index:99999;display:flex;flex-direction:column;box-shadow:0 6px 24px rgba(0,0,0,0.45)';

  const head = document.createElement('div');
  head.style.cssText =
    'display:flex;align-items:center;gap:8px;margin-bottom:10px;font-family:system-ui,sans-serif';
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:600;font-size:14px;flex:1';
  title.textContent = 'Telemetry debug log: last 50 batches';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText =
    'padding:4px 10px;border:1px solid var(--border,#2a2f3a);background:transparent;color:inherit;border-radius:6px;cursor:pointer';
  close.addEventListener('click', function () {
    removeNode(DEBUG_HTML_ID);
  });
  head.appendChild(title);
  head.appendChild(close);

  const note = document.createElement('div');
  note.style.cssText =
    'margin-bottom:10px;color:var(--fg-dim,#b6bccb);font-family:system-ui,sans-serif;font-size:12px';
  note.textContent =
    'These are the exact JSON batches the browser has POSTed to the telemetry endpoint during this session. No AWS account IDs, ARNs, region names, resource names, or free text appear here. If you see one, that is a bug, please report it.';

  const pre = document.createElement('pre');
  pre.style.cssText =
    'flex:1;overflow:auto;background:var(--panel-2,#0f1218);padding:12px;border-radius:6px;margin:0;white-space:pre-wrap;word-break:break-word';

  const log = debugLastN();
  if (log.length === 0) {
    pre.textContent = '(nothing sent yet)';
  } else {
    pre.textContent = JSON.stringify(log, null, 2);
  }

  wrap.appendChild(head);
  wrap.appendChild(note);
  wrap.appendChild(pre);
  parentEl.appendChild(wrap);
}

function removeNode(id) {
  const n = document.getElementById(id);
  if (n && n.parentNode) {n.parentNode.removeChild(n);}
}

export { renderConsentPrompt, renderDebugPanel, buildSettingsRow };

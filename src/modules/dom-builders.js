// Safe DOM builder utilities — replaces string concatenation patterns
// with structured DOM API calls that auto-escape text content.

import { esc } from './utils.js';

/**
 * Create a DOM element with attributes and children.
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - attribute key/value pairs (class, id, style, data-*, etc.)
 * @param {(string|Node)[]} children - text strings or DOM nodes to append
 * @returns {HTMLElement}
 */
export function buildEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('data-')) el.setAttribute(k, v);
    else el[k] = v;
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child instanceof Node) el.appendChild(child);
  }
  return el;
}

/**
 * Create an <option> element safely.
 * @param {string} value
 * @param {string} text - displayed text (auto-escaped via textContent)
 * @param {boolean} [selected=false]
 * @returns {HTMLOptionElement}
 */
export function buildOption(value, text, selected = false) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  if (selected) opt.selected = true;
  return opt;
}

/**
 * Create a <select> with options.
 * @param {string} id
 * @param {{value:string, text:string}[]} options
 * @returns {HTMLSelectElement}
 */
export function buildSelect(id, options) {
  const sel = document.createElement('select');
  if (id) sel.id = id;
  for (const o of options) sel.appendChild(buildOption(o.value, o.text));
  return sel;
}

/**
 * Create a <button> with text and click handler.
 * @param {string} text
 * @param {Function} onClick
 * @param {string} [className]
 * @returns {HTMLButtonElement}
 */
export function buildButton(text, onClick, className) {
  const btn = document.createElement('button');
  btn.textContent = text;
  if (onClick) btn.addEventListener('click', onClick);
  if (className) btn.className = className;
  return btn;
}

/**
 * Set element text content safely (replaces string injection for simple values).
 * @param {HTMLElement|string} el - element or selector
 * @param {string|number} text
 */
export function setText(el, text) {
  const target = typeof el === 'string' ? document.getElementById(el) : el;
  if (target) target.textContent = String(text);
}

/**
 * Clear an element's children and optionally append new ones.
 * @param {HTMLElement} el
 * @param {Node[]} [children]
 */
export function replaceChildren(el, children = []) {
  el.textContent = '';
  for (const child of children) el.appendChild(child);
}

/**
 * Tagged template literal for safe HTML interpolation.
 * All interpolated values are HTML-escaped; static parts pass through raw.
 * @returns {string} - escaped markup string safe for DOM insertion
 */
export function safeHtml(strings, ...values) {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    result += esc(String(values[i] ?? '')) + strings[i + 1];
  }
  return result;
}

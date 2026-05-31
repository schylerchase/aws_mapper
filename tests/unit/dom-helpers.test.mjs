import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

function makeDocument() {
  const body = {
    children: [],
    appendChild(el) {
      this.children.push(el);
      el.parentNode = this;
    }
  };
  return {
    body,
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        style: {},
        textContent: ''
      };
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
}

const originalDocument = globalThis.document;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timers = [];

globalThis.document = makeDocument();
globalThis.setTimeout = (fn, delay) => {
  const timer = { fn, delay, cleared: false };
  timers.push(timer);
  return timer;
};
globalThis.clearTimeout = (timer) => {
  if (timer) {
    timer.cleared = true;
  }
};

const { showToast } = await import('../../src/modules/dom-helpers.js');

after(() => {
  globalThis.document = originalDocument;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

describe('showToast', { concurrency: false }, () => {
  it('preserves legacy duration-only calls', () => {
    showToast('Legacy toast', 1200);

    const toast = globalThis.document.body.children[0];
    assert.equal(globalThis.document.body.children.length, 1);
    assert.equal(toast.textContent, 'Legacy toast');
    assert.equal(toast.style.opacity, '1');
    assert.equal(toast.style.background, 'var(--accent-green)');
    assert.equal(toast.style.color, '#000');
    assert.equal(timers.at(-1).delay, 1200);
  });

  it('supports typed toast styling with explicit duration', () => {
    const existingToast = globalThis.document.body.children[0];

    showToast('Warning toast', 'warn', 4500);

    assert.equal(globalThis.document.body.children.length, 1);
    assert.equal(globalThis.document.body.children[0], existingToast);
    assert.equal(existingToast.textContent, 'Warning toast');
    assert.equal(existingToast.style.background, 'var(--accent-orange)');
    assert.equal(existingToast.style.color, '#111827');
    assert.equal(timers.at(-1).delay, 4500);
  });

  it('falls back to success styling for unknown toast types', () => {
    showToast('Unknown type', 'custom');

    const toast = globalThis.document.body.children[0];
    assert.equal(toast.style.background, 'var(--accent-green)');
    assert.equal(toast.style.color, '#000');
    assert.equal(timers.at(-1).delay, 3000);
  });
});

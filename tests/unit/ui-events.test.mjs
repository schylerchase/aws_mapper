import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bindSingletonEvent, clearSingletonEvent } from '../../src/modules/ui-events.js';

describe('ui event helpers', () => {
  it('replaces an existing listener for the same element/type/key', () => {
    const target = new EventTarget();
    let firstCalls = 0;
    let secondCalls = 0;

    bindSingletonEvent(target, 'click', 'preview', () => {
      firstCalls += 1;
    });
    bindSingletonEvent(target, 'click', 'preview', () => {
      secondCalls += 1;
    });

    target.dispatchEvent(new Event('click'));

    assert.equal(firstCalls, 0);
    assert.equal(secondCalls, 1);
  });

  it('returns a cleanup function for the active binding', () => {
    const target = new EventTarget();
    let calls = 0;

    const cleanup = bindSingletonEvent(target, 'input', 'search', () => {
      calls += 1;
    });
    cleanup();
    target.dispatchEvent(new Event('input'));

    assert.equal(calls, 0);
  });

  it('can clear a named binding directly', () => {
    const target = new EventTarget();
    let calls = 0;

    bindSingletonEvent(target, 'change', 'filter', () => {
      calls += 1;
    });
    clearSingletonEvent(target, 'change', 'filter');
    target.dispatchEvent(new Event('change'));

    assert.equal(calls, 0);
  });
});

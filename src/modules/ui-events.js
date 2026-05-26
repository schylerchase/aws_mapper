const SINGLETON_EVENT_STORE = '__awsMapperSingletonEvents';

export function bindSingletonEvent(target, type, key, handler, options) {
  if (!target || typeof target.addEventListener !== 'function') return function noopCleanup() {};

  const bindingKey = getBindingKey(type, key);
  const store = getEventStore(target);
  const existing = store.get(bindingKey);

  if (existing) target.removeEventListener(type, existing.handler, existing.options);

  target.addEventListener(type, handler, options);
  store.set(bindingKey, { handler, options });

  return function cleanupSingletonEvent() {
    const current = store.get(bindingKey);
    if (!current || current.handler !== handler) return;

    target.removeEventListener(type, handler, options);
    store.delete(bindingKey);
  };
}

export function clearSingletonEvent(target, type, key) {
  if (!target || typeof target.removeEventListener !== 'function') return;

  const bindingKey = getBindingKey(type, key);
  const store = getEventStore(target);
  const existing = store.get(bindingKey);
  if (!existing) return;

  target.removeEventListener(type, existing.handler, existing.options);
  store.delete(bindingKey);
}

function getBindingKey(type, key) {
  return String(type || '') + ':' + String(key || 'default');
}

function getEventStore(target) {
  if (!target[SINGLETON_EVENT_STORE]) {
    Object.defineProperty(target, SINGLETON_EVENT_STORE, {
      value: new Map(),
      enumerable: false
    });
  }

  return target[SINGLETON_EVENT_STORE];
}

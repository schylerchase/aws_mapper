// Unified Dashboard — state and pure logic
// DOM rendering functions (openUnifiedDash, _switchUdashTab, _renderBUDRDash, etc.)
// remain inline until modernized in Phase 5.

// === Module State ===
let _udashTab = null;
let _udashAcctFilter = 'all';
let _budrDashState = { tierFilter: 'all', search: '', sort: 'tier' };

export const BUDR_TIER_META = {
  protected: { name: 'Protected', color: '#10b981', icon: '' },
  partial: { name: 'Partially Protected', color: '#f59e0b', icon: '' },
  at_risk: { name: 'At Risk', color: '#ef4444', icon: '' }
};

// === State Accessors ===
export function getUdashTab() {
  return _udashTab;
}
export function setUdashTab(v) {
  _udashTab = v;
}
export function getUdashAcctFilter() {
  return _udashAcctFilter;
}
export function setUdashAcctFilter(v) {
  _udashAcctFilter = v;
}
export function getBudrDashState() {
  return _budrDashState;
}
export function setBudrDashState(v) {
  _budrDashState = v;
}

// === Pure Logic ===

/**
 * Filter items by current account filter.
 * @param {Array} items - items with _accountId or account property
 * @returns {Array} filtered items
 */
export function udashFilterByAccount(items) {
  if (!_udashAcctFilter || _udashAcctFilter === 'all') return items;
  let id = _udashAcctFilter;
  // Resolve account label via window bridge (report builder provides _rptAccountLabel)
  let lbl =
    typeof window !== 'undefined' && typeof window._rptAccountLabel === 'function'
      ? window._rptAccountLabel(id)
      : '';
  return items.filter(function (item) {
    let a = item._accountId || item.account || '';
    return a === id || a === lbl;
  });
}

// === Window Bridge (transitional) ===
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '_udashTab', {
    get() {
      return _udashTab;
    },
    set(v) {
      _udashTab = v;
    },
    configurable: true
  });
  Object.defineProperty(window, '_udashAcctFilter', {
    get() {
      return _udashAcctFilter;
    },
    set(v) {
      _udashAcctFilter = v;
    },
    configurable: true
  });
  Object.defineProperty(window, '_budrDashState', {
    get() {
      return _budrDashState;
    },
    set(v) {
      _budrDashState = v;
    },
    configurable: true
  });
  window._BUDR_TIER_META = BUDR_TIER_META;
  window._udashFilterByAccount = udashFilterByAccount;
  window.getUdashTab = getUdashTab;
  window.setUdashTab = setUdashTab;
  window.getUdashAcctFilter = getUdashAcctFilter;
  window.setUdashAcctFilter = setUdashAcctFilter;
}

// === Backward Compat Exports ===
export { _udashTab, _udashAcctFilter, _budrDashState, BUDR_TIER_META as _BUDR_TIER_META };

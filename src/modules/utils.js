// Utility functions used across the application
// Extracted from index.html for modularization

/**
 * Safe JSON parse with fallback for malformed JSON
 * Attempts to extract valid JSON objects from text
 * @param {string} t - Text to parse
 * @returns {Object|Object[]|null} Parsed JSON or null
 */
export function safeParse(t) {
  if (!t || !t.trim()) return null;
  try {
    return JSON.parse(t.trim());
  } catch (e) {
    const b = [];
    let d = 0, s = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '{') {
        if (d === 0) s = i;
        d++;
      }
      if (t[i] === '}') {
        d--;
        if (d === 0 && s >= 0) {
          b.push(t.substring(s, i + 1));
          s = -1;
        }
      }
    }
    return b.length
      ? b.map(x => {
          try {
            return JSON.parse(x);
          } catch (e2) {
            return null;
          }
        }).filter(Boolean)
      : null;
  }
}

/**
 * Extract nested properties from resource(s)
 * @param {Object|Object[]} r - Resource or array of resources
 * @param {string[]} keys - Property keys to extract
 * @returns {Array} Flattened array of extracted values
 */
export function ext(r, keys) {
  if (!r) return [];
  const a = Array.isArray(r) ? r : [r];
  let res = [];
  for (const i of a) {
    for (const k of keys) {
      if (i[k]) res = res.concat(i[k]);
    }
  }
  return res;
}

/**
 * HTML escape string
 * @param {*} s - String to escape
 * @returns {string} Escaped string
 */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Get Name tag from resource, with fallback
 * @param {Object} i - AWS resource with Tags
 * @param {string} f - Fallback value
 * @returns {string} Escaped name or fallback
 */
export function gn(i, f) {
  const t = (i.Tags || []).find(x => x.Key === 'Name');
  return esc(t ? t.Value : f);
}

/**
 * Shorten AWS resource ID (remove prefix, take first 10 chars)
 * @param {string} id - Full resource ID
 * @returns {string} Shortened ID
 */
export function sid(id) {
  return id ? id.replace(/^[a-z]+-/, '').substring(0, 10) : '';
}

/**
 * Classify gateway type from ID
 * @param {string} id - Gateway ID
 * @returns {string} Gateway type (IGW, VGW, VPCE, PCX, EIGW, LGW, or GW)
 */
export function clsGw(id) {
  const m = {
    'igw-': 'IGW',
    'vgw-': 'VGW',
    'vpce-': 'VPCE',
    'pcx-': 'PCX',
    'eigw-': 'EIGW',
    'lgw-': 'LGW'
  };
  for (const [p, t] of Object.entries(m)) {
    if (id.startsWith(p)) return t;
  }
  return 'GW';
}

/**
 * Check if resource type is shared across VPCs
 * @param {string} t - Resource type
 * @returns {boolean} True if shared
 */
export function isShared(t) {
  return t === 'TGW' || t === 'PCX';
}

/**
 * Get CSS color variable for resource type
 * @param {string} t - Resource type
 * @returns {string} CSS variable name
 */
export function gcv(t) {
  return {
    IGW: 'var(--igw-color)',
    NAT: 'var(--nat-color)',
    TGW: 'var(--tgw-color)',
    VGW: 'var(--vgw-color)',
    VPCE: 'var(--vpce-color)',
    PCX: 'var(--pcx-color)',
    EIGW: 'var(--igw-color)'
  }[t] || 'var(--text-muted)';
}

/**
 * Get hex color for resource type
 * @param {string} t - Resource type
 * @returns {string} Hex color
 */
export function gch(t) {
  return {
    IGW: '#10b981',
    NAT: '#f59e0b',
    TGW: '#ec4899',
    VGW: '#ef4444',
    VPCE: '#a78bfa',
    PCX: '#fb923c',
    EIGW: '#10b981'
  }[t] || '#4a5e80';
}

/**
 * Get value from input element by ID
 * @param {string} id - Element ID
 * @returns {string} Input value or empty string
 */
export function gv(id) {
  return (document.getElementById(id) || {}).value || '';
}

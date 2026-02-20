// Core constants used across the application
// Extracted from index.html for modularization

// Severity ordering for sorting findings
export const SEV_ORDER = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

// Framework display labels
export const FW_LABELS = {
  CIS: 'CIS Benchmark',
  WAF: 'Well-Architected Framework',
  IAM: 'IAM Security',
  ARCH: 'Best Practices',
  SOC2: 'SOC 2',
  PCI: 'PCI DSS 4',
  BUDR: 'Backup & DR'
};

// End-of-life Lambda runtimes
export const EOL_RUNTIMES = new Set([
  'nodejs14.x', 'nodejs12.x', 'nodejs10.x', 'nodejs8.10',
  'python2.7', 'python3.6', 'python3.7',
  'dotnetcore3.1', 'dotnetcore2.1',
  'ruby2.5', 'ruby2.7',
  'java8',
  'go1.x'
]);

// Effort estimation labels
export const EFFORT_LABELS = {
  low: 'Low',
  med: 'Med',
  high: 'High'
};

// Effort time estimates
export const EFFORT_TIME = {
  low: '~5 min',
  med: '~1-2 hrs',
  high: '~1+ days'
};

// Priority/tier metadata (colors, labels)
export const PRIORITY_META = {
  crit: {
    name: 'Critical',
    color: '#ef4444',
    bg: 'rgba(239,68,68,.08)',
    border: 'rgba(239,68,68,.3)'
  },
  high: {
    name: 'High',
    color: '#f97316',
    bg: 'rgba(249,115,22,.08)',
    border: 'rgba(249,115,22,.3)'
  },
  med: {
    name: 'Medium',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,.08)',
    border: 'rgba(245,158,11,.3)'
  },
  low: {
    name: 'Low',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,.08)',
    border: 'rgba(59,130,246,.3)'
  }
};

// Alias for backward compatibility
export const TIER_META = PRIORITY_META;

// Priority ordering for sorting
export const PRIORITY_ORDER = {
  crit: 0,
  high: 1,
  med: 2,
  low: 3
};

// Priority keys in order
export const PRIORITY_KEYS = ['crit', 'high', 'med', 'low'];

// LocalStorage keys
export const MUTE_KEY = 'aws_mapper_muted_findings';
export const NOTES_KEY = 'aws_mapper_annotations';
export const SNAP_KEY = 'aws_mapper_snapshots';
export const SAVE_KEY = 'aws_mapper_session';

// App configuration
export const MAX_SNAPSHOTS = 30;
export const SAVE_INTERVAL = 30000; // 30 seconds

// Note categories
export const NOTE_CATEGORIES = [
  'owner',
  'status',
  'incident',
  'todo',
  'info',
  'warning'
];

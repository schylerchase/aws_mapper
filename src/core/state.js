/**
 * Shared mutable state for app-core.js decomposition.
 * Variables are moved here incrementally as modules are extracted.
 * app-core.js accesses these via window._core.S during migration.
 */

export const S = {};

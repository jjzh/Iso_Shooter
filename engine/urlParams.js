// URL query parameter overrides — apply gameplay config from URL
// Format: ?player.speed=10&goblin.health=50&dash.cooldown=500
//
// First segment = config root, rest = nested dot-path within that object.
// Values are auto-parsed as number, boolean, hex (0x...), or string.

import { PLAYER } from '../config/player.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { ABILITIES } from '../config/abilities.js';
import { BOSS } from '../config/boss.js';

// Registry: first segment of param key → config object
const CONFIG_ROOTS = {
  player:          PLAYER,
  goblin:          ENEMY_TYPES.goblin,
  skeletonArcher:  ENEMY_TYPES.skeletonArcher,
  mortarImp:       ENEMY_TYPES.mortarImp,
  crystalGolem:    ENEMY_TYPES.crystalGolem,
  dash:            ABILITIES.dash,
  ultimate:        ABILITIES.ultimate,
  boss:            BOSS,
};

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('0x') || raw.startsWith('0X')) {
    const hex = parseInt(raw, 16);
    if (!isNaN(hex)) return hex;
  }
  const num = Number(raw);
  return isNaN(num) ? raw : num;
}

/**
 * Parse URL search params and apply overrides to config objects.
 * Returns the count of params applied.
 */
export function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  let applied = 0;

  for (const [key, rawValue] of params) {
    const dotIdx = key.indexOf('.');
    if (dotIdx === -1) continue; // no prefix, skip

    const prefix = key.slice(0, dotIdx);
    const path = key.slice(dotIdx + 1);
    if (!path) continue;

    const root = CONFIG_ROOTS[prefix];
    if (!root) {
      console.warn(`[urlParams] Unknown prefix: "${prefix}" (from "${key}")`);
      continue;
    }

    // Validate property exists (prevent typos from creating junk keys)
    const existing = getNestedValue(root, path);
    if (existing === undefined) {
      console.warn(`[urlParams] Unknown path: "${key}" — no such property`);
      continue;
    }

    const value = parseValue(rawValue);
    setNestedValue(root, path, value);
    applied++;
    console.log(`[urlParams] ${key} = ${value}`);
  }

  if (applied > 0) {
    console.log(`[urlParams] Applied ${applied} override(s) from URL`);
  }
  return applied;
}

/**
 * Snapshot current config values (call BEFORE applyUrlParams to capture defaults).
 */
export function snapshotDefaults() {
  const snap = {};
  for (const [prefix, root] of Object.entries(CONFIG_ROOTS)) {
    snap[prefix] = JSON.parse(JSON.stringify(root));
  }
  return snap;
}

/**
 * Build a share URL containing only parameters that differ from defaults.
 */
export function buildShareUrl(defaults) {
  const params = new URLSearchParams();

  for (const [prefix, root] of Object.entries(CONFIG_ROOTS)) {
    const defRoot = defaults[prefix];
    if (!defRoot) continue;
    collectDiffs(params, prefix, defRoot, root, '');
  }

  const base = window.location.origin + window.location.pathname;
  const qs = params.toString();
  return qs ? base + '?' + qs : base;
}

function collectDiffs(params, prefix, defObj, curObj, pathPrefix) {
  for (const key of Object.keys(curObj)) {
    const fullPath = pathPrefix ? pathPrefix + '.' + key : key;
    const curVal = curObj[key];
    const defVal = getNestedValue(defObj, fullPath);

    if (curVal != null && typeof curVal === 'object' && !Array.isArray(curVal)) {
      collectDiffs(params, prefix, defObj, curVal, fullPath);
    } else if (curVal !== defVal) {
      params.set(prefix + '.' + fullPath, String(curVal));
    }
  }
}

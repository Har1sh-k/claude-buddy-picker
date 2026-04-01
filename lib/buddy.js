/**
 * buddy.js — Core library for the Claude Code buddy picker tool.
 *
 * Deterministically rolls a buddy (species, rarity, stats, cosmetics)
 * from any identity string. Uses Bun.hash (Wyhash) when running under
 * Bun (Claude Code's native binary) and FNV-1a when running under Node.
 *
 * PRNG: Mulberry32
 * Salt: "friend-2026-401"
 */

"use strict";

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALT = "friend-2026-401";

const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus",
  "owl", "penguin", "turtle", "snail", "ghost", "axolotl",
  "capybara", "cactus", "robot", "rabbit", "mushroom", "chonk",
];

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

/** Numeric rank for comparing rarities (higher = rarer). */
const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** Minimum stat floor per rarity tier. */
const RARITY_FLOOR = { common: 5, uncommon: 15, rare: 25, epic: 35, legendary: 50 };

const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];

const EYES = ["·", "✦", "×", "◉", "@", "°"];

const HATS = [
  "none", "crown", "tophat", "propeller",
  "halo", "wizard", "beanie", "tinyduck",
];

const SPECIES_EMOJI = {
  duck: "🦆", goose: "🦢", blob: "🫧", cat: "🐱",
  dragon: "🐉", octopus: "🐙", owl: "🦉", penguin: "🐧",
  turtle: "🐢", snail: "🐌", ghost: "👻", axolotl: "🦎",
  capybara: "🦫", cactus: "🌵", robot: "🤖", rabbit: "🐰",
  mushroom: "🍄", chonk: "🐾",
};

const RARITY_STARS = {
  common: "★",
  uncommon: "★★",
  rare: "★★★",
  epic: "★★★★",
  legendary: "★★★★★",
};

// ---------------------------------------------------------------------------
// Hash — Wyhash (Bun) or FNV-1a (Node)
// ---------------------------------------------------------------------------

/**
 * Hash a string to a 32-bit unsigned integer.
 *
 * When running under Bun, delegates to `Bun.hash()` (Wyhash) and truncates
 * to 32 bits. Under Node (or any other runtime), uses FNV-1a.
 *
 * @param {string} s - The input string.
 * @returns {number} 32-bit unsigned hash.
 */
function hashString(s) {
  // Bun path — Bun.hash returns a 64-bit BigInt; keep the low 32 bits.
  if (typeof Bun !== "undefined") {
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn);
  }

  // Node path — FNV-1a (32-bit).
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// PRNG — Mulberry32
// ---------------------------------------------------------------------------

/**
 * Create a Mulberry32 PRNG from a 32-bit seed.
 *
 * @param {number} seed - 32-bit unsigned integer seed.
 * @returns {function(): number} Returns a float in [0, 1) on each call.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Roll helpers
// ---------------------------------------------------------------------------

/**
 * Pick a random element from an array.
 *
 * @param {function(): number} rng - Mulberry32 PRNG.
 * @param {Array} arr - Source array.
 * @returns {*} A randomly chosen element.
 */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Weighted rarity roll.
 *
 * Uses RARITY_WEIGHTS to determine the probability of each tier.
 *
 * @param {function(): number} rng - Mulberry32 PRNG.
 * @returns {string} One of the RARITIES.
 */
function rollRarity(rng) {
  const total = RARITIES.reduce((sum, r) => sum + RARITY_WEIGHTS[r], 0);
  let roll = rng() * total;

  for (const r of RARITIES) {
    roll -= RARITY_WEIGHTS[r];
    if (roll <= 0) return r;
  }

  // Fallback (should never be reached).
  return RARITIES[0];
}

/**
 * Roll five stats (DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK) for a buddy.
 *
 * Every rarity has a floor value (RARITY_FLOOR). One stat is chosen as the
 * "peak" and one other as the "dump":
 *   - Peak = min(100, floor + 50 + random * 30)
 *   - Dump = max(1,   floor - 10 + random * 15)
 *   - Others =        floor + random * 40
 *
 * @param {function(): number} rng - Mulberry32 PRNG.
 * @param {string} rarity - The buddy's rarity tier.
 * @returns {Object.<string, number>} Stats keyed by STAT_NAMES.
 */
function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];

  // Choose peak and dump indices (dump !== peak).
  const peakIdx = Math.floor(rng() * STAT_NAMES.length);
  let dumpIdx = Math.floor(rng() * (STAT_NAMES.length - 1));
  if (dumpIdx >= peakIdx) dumpIdx++;

  const stats = {};

  for (let i = 0; i < STAT_NAMES.length; i++) {
    let value;
    if (i === peakIdx) {
      value = Math.min(100, Math.floor(floor + 50 + rng() * 30));
    } else if (i === dumpIdx) {
      value = Math.max(1, Math.floor(floor - 10 + rng() * 15));
    } else {
      value = Math.floor(floor + rng() * 40);
    }
    stats[STAT_NAMES[i]] = value;
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Full roll
// ---------------------------------------------------------------------------

/**
 * Perform a complete buddy roll from an identity string.
 *
 * The identity is salted, hashed, and used to seed the PRNG.  All traits
 * are then derived deterministically.
 *
 * @param {string} id - Any identity string (e.g. user id, email, handle).
 * @returns {{ rarity: string, species: string, eye: string, hat: string,
 *             shiny: boolean, stats: Object.<string, number> }}
 */
function fullRoll(id) {
  const rng = mulberry32(hashString(id + SALT));

  const rarity  = rollRarity(rng);
  const species = pick(rng, SPECIES);
  const eye     = pick(rng, EYES);
  const hat     = rarity === "common" ? "none" : pick(rng, HATS);
  const shiny   = rng() < 0.01;
  const stats   = rollStats(rng, rarity);

  return { rarity, species, eye, hat, shiny, stats };
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

/**
 * Detect the current JavaScript runtime and hash algorithm in use.
 *
 * @returns {{ runtime: string, hashType: string, version: string }}
 */
function detectRuntime() {
  if (typeof Bun !== "undefined") {
    return {
      runtime:  "bun",
      hashType: "wyhash",
      version:  typeof Bun.version === "string" ? Bun.version : "unknown",
    };
  }

  return {
    runtime:  "node",
    hashType: "fnv1a",
    version:  typeof process !== "undefined" ? process.version : "unknown",
  };
}

// ---------------------------------------------------------------------------
// UUID / hex helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random v4 UUID using crypto.randomBytes.
 *
 * @returns {string} A UUID string in 8-4-4-4-12 format.
 */
function randomUUID() {
  const bytes = crypto.randomBytes(16);

  // Set version (4) and variant (RFC 4122).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Generate a random 64-character hex string.
 *
 * @returns {string} 64 hex characters (256 bits of randomness).
 */
function randomHex() {
  return crypto.randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Exports (CommonJS)
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  SALT,
  SPECIES,
  RARITIES,
  RARITY_WEIGHTS,
  RARITY_RANK,
  RARITY_FLOOR,
  STAT_NAMES,
  EYES,
  HATS,
  SPECIES_EMOJI,
  RARITY_STARS,

  // Hash & PRNG
  hashString,
  mulberry32,

  // Roll helpers
  pick,
  rollRarity,
  rollStats,
  fullRoll,

  // Runtime detection
  detectRuntime,

  // UUID / hex
  randomUUID,
  randomHex,
};

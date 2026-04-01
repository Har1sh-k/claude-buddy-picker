# Claude Buddy Picker — Project Guide

## What This Project Does

This tool lets users **deterministically select** their Claude Code companion (buddy) instead of accepting the one assigned by their identity hash. It brute-forces an identity (UUID or hex string) that produces the desired species + rarity combination, then applies it to `~/.claude.json`.

## Critical Technical Context

### The Bun.hash Discovery

**This is the most important thing to understand.** Claude Code's native binary (the 200MB+ executable at `~/.local/bin/claude`) embeds the **Bun runtime**, not Node.js. This means the hash function used for buddy generation is `Bun.hash()` (Wyhash), **not** FNV-1a.

The source code (`cli.js` in `@anthropic-ai/claude-code` npm package) contains:

```javascript
function hashString(s) {
  if (typeof Bun !== "undefined")
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn); // Wyhash — used by native binary
  let h = 2166136261; // FNV-1a — used only by npm installs running on Node
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
```

**Consequence:** Scripts MUST run under `bun` (not `node`) to produce correct results for users with the native binary. Running under Node will use FNV-1a and generate IDs that produce completely different buddies than expected.

### The Buddy Algorithm

```
identity + "friend-2026-401" → hash → Mulberry32 seed → rarity → species → eye → hat → shiny → stats
```

1. **Identity resolution** (in Claude Code source, function `ch1()`):
   ```
   oauthAccount?.accountUuid  ??  userID  ??  "anon"
   ```
   `accountUuid` always takes priority over `userID`.

2. **Salt**: `"friend-2026-401"` (April 1, 2026 launch date)

3. **PRNG**: Mulberry32 with constant `0x6d2b79f5` (1831565813)

4. **Roll order** (PRNG consumed sequentially):
   - Call 1 → rarity (weighted: common 60%, uncommon 25%, rare 10%, epic 4%, legendary 1%)
   - Call 2 → species (uniform across 18 species)
   - Call 3 → eye style
   - Call 4 → hat (common rarity always gets "none")
   - Call 5 → shiny (1% chance)
   - Remaining → stats (peak/dump system per rarity floor)

5. **Species list** (order matters for determinism):
   ```
   duck, goose, blob, cat, dragon, octopus, owl, penguin,
   turtle, snail, ghost, axolotl, capybara, cactus, robot,
   rabbit, mushroom, chonk
   ```

### What's Stored vs. Regenerated

In `~/.claude.json`:
- **Stored** (`companion` field): `name`, `personality`, `hatchedAt` — AI-generated at hatch time
- **Regenerated every read** (from identity hash): `rarity`, `species`, `eye`, `hat`, `shiny`, `stats`

Users CANNOT edit rarity/species in the config file. The source code explicitly prevents this:
> "users can't edit their way to a legendary"

### The accountUuid Problem

Team/Pro plan users have `oauthAccount.accountUuid` in their config, which takes priority over `userID`. The tool handles this by brute-forcing a **UUID** (v4 format) and setting it as `accountUuid` directly, rather than trying to remove it.

**Why removing accountUuid doesn't work reliably:** The OAuth startup flow can re-add `accountUuid` to the in-memory config even if it's removed from disk. Setting it to a known value is more reliable.

**Why the OAuth flow doesn't overwrite our UUID:** If the config's `oauthAccount` already has `billingType`, `accountCreatedAt`, and `subscriptionCreatedAt`, the startup flow skips the OAuth profile fetch (early return), preserving our value.

## Project Structure

```
picker.js          — Interactive CLI entry point (menu, progress bar, apply flow)
lib/
  buddy.js         — Core algorithm: hash, PRNG, roll, constants, runtime detection
  config.js        — Read/write ~/.claude.json, identity resolution, install detection
platforms/
  windows/
    persist.ps1        — PowerShell profile wrapper for persistence
    persist-bash.sh    — Git Bash alias for persistence
  unix/
    persist.sh         — Linux/macOS shell function for persistence
```

### `lib/buddy.js`
- `hashString(s)` — Dual hash: Bun.hash when available, FNV-1a fallback
- `mulberry32(seed)` — Seeded PRNG returning floats in [0, 1)
- `fullRoll(id)` — Complete deterministic roll from identity string
- `detectRuntime()` — Returns `{ runtime, hashType, version }`
- `randomUUID()` / `randomHex()` — Generate candidate IDs for brute-force

### `lib/config.js`
- `readConfig()` / `getConfigPath()` — Read ~/.claude.json
- `getActiveIdentity(config)` — Resolve which ID the buddy system uses
- `applyBuddy(id, mode)` — Write brute-forced ID to config, delete companion
- `detectInstallMethod()` — Native binary vs npm install detection

### `picker.js`
- Interactive menu with species grid, emoji, ANSI colors
- Brute-force search with live progress bar
- Stat visualization with bar charts
- One-command apply + persistence setup guidance
- CLI flags: `--verify [id]`, `--quick <species> [max]`

## How to Run

```bash
bun picker.js              # Interactive mode
bun picker.js --verify     # Check current buddy
bun picker.js --quick cat  # Quick: find legendary cat
```

**Always use `bun`, not `node`**, unless the user installed Claude Code via npm.

## Platform Persistence Scripts

These add a shell wrapper around `claude` that enforces the chosen `accountUuid` on every launch:

- **PowerShell**: Wraps `claude` as a function in `$PROFILE`
- **Git Bash**: Adds an alias to `~/.bashrc`
- **Unix**: Adds a shell function to `~/.bashrc` or `~/.zshrc`

All scripts accept the target UUID as an argument and are idempotent (safe to re-run).

## Common Issues

1. **"I got the wrong buddy"** — Almost certainly running brute-force under Node instead of Bun. The hash functions produce completely different results.

2. **"My buddy reverted after re-login"** — OAuth flow overwrote `accountUuid`. User needs to set up persistence (option 4 in the menu).

3. **"verify says legendary dragon but I got ghost"** — Verify was run under Node (FNV-1a) but Claude Code uses Bun (Wyhash). Run verify under Bun.

4. **Config trailing comma errors** — When deleting the `companion` field, a trailing comma can remain. The `applyBuddy()` function handles this by rewriting the full JSON.

## Dependencies

**Zero npm dependencies.** Uses only Node/Bun built-ins: `crypto`, `fs`, `path`, `os`, `readline`, `child_process`.

## Testing Changes

After modifying the algorithm or hash function:
```bash
# Verify a known ID produces expected result
bun picker.js --verify 18b852ac-df26-44ed-9a3f-d8992a0760f5
# Should output: legendary dragon

# Quick brute-force test
bun picker.js --quick duck 10000
```

## Version Compatibility

- Tested on Claude Code v2.1.89 (March/April 2026)
- Salt `"friend-2026-401"` is version-specific — if Anthropic changes it, all rolls change
- The buddy feature is gated behind `feature('BUDDY')` server-side

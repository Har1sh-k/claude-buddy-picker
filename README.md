# Claude Buddy Picker

**Pick your Claude Code companion. Don't leave it to chance.**

Your buddy isn't random — it's deterministically generated from your identity using a seeded PRNG. Same identity = same buddy, every time. This tool lets you choose exactly which species + rarity you want.

> Tested on Claude Code v2.1.89 (April 2026). Works with the native binary on Windows, macOS, and Linux.

## The Key Discovery

Every guide and script out there uses **FNV-1a** as the hash function. They're all wrong for native installs.

Claude Code's native binary embeds the **Bun runtime**. Bun uses `Bun.hash()` (Wyhash) instead of FNV-1a. If you brute-force an ID using FNV-1a and apply it, you'll get a completely different buddy than expected.

```
                 npm install (Node.js)          native binary (Bun)
                 ────────────────────           ───────────────────
Hash function:   FNV-1a (32-bit)                Bun.hash() → Wyhash
Result:          ❌ Wrong buddy                 ✅ Correct buddy
```

**This tool auto-detects your runtime and uses the correct hash function.**

## Quick Start

### Prerequisites

Install [Bun](https://bun.sh) (required for correct hashing with native Claude Code):

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (PowerShell)
irm bun.sh/install.ps1 | iex
```

### Interactive Mode

```bash
bun picker.js
```

```
  ╔════════════════════════════════════════════════╗
  ║  Claude Buddy Picker                           ║
  ║  Pick your companion. Don't leave it to chance. ║
  ╚════════════════════════════════════════════════╝

  Runtime:  bun 1.3.11  →  Bun.hash (Wyhash)
  Install:  native (~/.local/bin/claude)
  Buddy:    🐱 common cat named Whiskers

  What would you like to do?

  1. Pick a new buddy       Find your perfect companion
  2. Check any ID           See what an ID produces
  3. View current buddy     Show your active companion
  4. Setup persistence      Survive re-logins
  5. Exit
```

### Quick Pick (non-interactive)

```bash
# Find a legendary dragon
bun picker.js --quick dragon

# Verify what an ID produces
bun picker.js --verify 18b852ac-df26-44ed-9a3f-d8992a0760f5

# Check your current buddy
bun picker.js --verify
```

## How It Works

### The Algorithm

```
identity + "friend-2026-401"  →  hash  →  Mulberry32 PRNG seed
                                                │
                                    ┌───────────┼──────────────┐
                                    ▼           ▼              ▼
                                 rarity      species     eye/hat/stats
```

1. **Identity resolution**: `oauthAccount.accountUuid ?? userID ?? "anon"`
2. **Hashing**: identity + salt hashed with **Bun.hash** (native) or **FNV-1a** (npm)
3. **PRNG**: Hash seeds a Mulberry32 generator
4. **Rolling**: PRNG consumed in order → rarity → species → eye → hat → shiny → stats

### What's Stored vs. Regenerated

| Field | Stored in config? | Source |
|-------|:-:|--------|
| `name` | Yes | AI-generated at hatch |
| `personality` | Yes | AI-generated at hatch |
| `rarity`, `species`, `stats` | **No** | Regenerated from identity hash every time |

You **cannot** edit your way to a legendary. The tool brute-forces an identity that deterministically produces the buddy you want.

### Species

| | | | |
|---|---|---|---|
| 🦆 duck | 🦢 goose | 🫧 blob | 🐱 cat |
| 🐉 dragon | 🐙 octopus | 🦉 owl | 🐧 penguin |
| 🐢 turtle | 🐌 snail | 👻 ghost | 🦎 axolotl |
| 🦫 capybara | 🌵 cactus | 🤖 robot | 🐰 rabbit |
| 🍄 mushroom | 🐾 chonk | | |

### Rarity

| Rarity | Probability | Stars |
|--------|-------------|-------|
| Common | 60% | ★ |
| Uncommon | 25% | ★★ |
| Rare | 10% | ★★★ |
| Epic | 4% | ★★★★ |
| Legendary | 1% | ★★★★★ |

## The `accountUuid` Problem

If you're on a Team or Pro plan, your config has an `oauthAccount.accountUuid` that **takes priority** over `userID`:

```javascript
oauthAccount?.accountUuid  ??  userID  ??  "anon"
```

This tool handles it by brute-forcing a **UUID** (not a hex string) and setting it directly as `accountUuid`. This is more reliable than removing `accountUuid`, because the OAuth flow can re-add it.

### Why Previous Approaches Failed

| Approach | Problem |
|----------|---------|
| Set `userID` + remove `accountUuid` | OAuth flow re-adds `accountUuid` in memory at startup |
| Use FNV-1a brute-force | Native binary uses Bun.hash, not FNV-1a |
| Edit `rarity` in config | Bones are regenerated from identity hash, not stored |

### Persistence

After applying, your buddy can revert if you re-login (`claude login`). The persistence scripts add a shell wrapper that auto-enforces your chosen UUID on every launch:

**Windows (PowerShell):**
```powershell
.\platforms\windows\persist.ps1 <your-uuid>
```

**Windows (Git Bash):**
```bash
bash platforms/windows/persist-bash.sh <your-uuid>
```

**Linux / macOS:**
```bash
bash platforms/unix/persist.sh <your-uuid>
```

## Deep Dive

### How the Native Binary Uses Bun

The Claude Code npm package (`@anthropic-ai/claude-code`) contains this hash function:

```javascript
function hashString(s) {
  if (typeof Bun !== "undefined")
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn);  // ← Wyhash
  // FNV-1a fallback for Node.js
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
```

The native binary (238MB PE/ELF/Mach-O executable) embeds Bun as its JS runtime. Evidence:
- `bun.lock` in the npm package
- Species names obfuscated with `String.fromCharCode` (Bun bundler pattern)
- Node FNV-1a produces wrong results; Bun.hash produces correct results (empirically verified)

### Companion Internals

**Reaction system**: After every Claude response, `fireCompanionObserver` sends your transcript to:
```
POST /api/organizations/{orgId}/claude_code/buddy_react
```
The server returns a quip for the speech bubble. Your buddy is *not* Claude — it's a separate system.

**Stats**: Generated deterministically from identity. No XP, no leveling, no evolution. DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK — all fixed.

**Animation**: 3 frames per species, 500ms tick rate. Idle loop: `[0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` where -1 = blink.

**Hats**: Only non-common rarities get hats: crown, tophat, propeller, halo, wizard, beanie, tinyduck.

**Feature flag**: Gated behind `feature('BUDDY')`. The salt `friend-2026-401` confirms the April 1, 2026 launch.

## Project Structure

```
claude-buddy-picker/
├── picker.js                  # Interactive CLI
├── lib/
│   ├── buddy.js               # Hash, PRNG, roll algorithm
│   └── config.js              # Config read/write/apply
├── platforms/
│   ├── windows/
│   │   ├── persist.ps1        # PowerShell persistence
│   │   └── persist-bash.sh    # Git Bash persistence
│   └── unix/
│       └── persist.sh         # Linux/macOS persistence
├── package.json
└── LICENSE (MIT)
```

## FAQ

**Q: Will my buddy evolve or level up?**
No. Stats are fixed by your identity hash. No progression system exists.

**Q: What if Anthropic changes the algorithm?**
If the salt or hash function changes, all rolls change. You'd need to re-pick with updated parameters.

**Q: Does this work with the npm install?**
Yes. The tool auto-detects Node vs Bun. If you installed via `npm i -g @anthropic-ai/claude-code` and run with Node, it uses FNV-1a automatically.

**Q: What about Bun vs Node runtime?**
Run `bun picker.js` for native binary installs (most users). The tool will warn you if there's a mismatch.

**Q: Will this break my Team Plan?**
No. The tool only modifies `accountUuid` and `companion` in your config. Auth uses OAuth tokens, not the UUID.

## License

MIT

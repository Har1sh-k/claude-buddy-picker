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

## Investigation Log

The following is the complete investigation that led to these findings. This started as "give me a legendary dragon" and turned into a deep dive into Claude Code internals.

### Attempt 1: The GitHub Script (Wrong Hash)

A [script circulating on GitHub](https://github.com/anthropics/claude-code/discussions/2664) claims you can brute-force a `userID` using FNV-1a and write it to `~/.claude.json`:

```bash
node reroll.js dragon 500000
# found: legendary dragon -> c3b62c7835f2f982fd65b9e5599eb36d7b7d93da96847d310645223f41120a60
```

We set the `userID` in `~/.claude.json` and deleted the `companion` field. After restarting and running `/buddy`... we got a **rare ghost** named Baneshift. Not a legendary dragon.

**Why it failed:** The script uses FNV-1a, but the native Claude Code binary uses Bun.hash (Wyhash). Same ID, completely different hash, completely different buddy.

### Attempt 2: Discovering the accountUuid Priority

We dug into the Claude Code source (`cli.js`, deobfuscated from the npm package) and found:

```javascript
function ch1() {
  let q = w8();
  return q.oauthAccount?.accountUuid ?? q.userID ?? "anon";
}
```

The identity resolution order:
1. `oauthAccount.accountUuid` (if logged in with OAuth)
2. `userID` (fallback)
3. `"anon"` (last resort)

Team/Pro plan users have `accountUuid`, which **always wins** over `userID`. Even if you set a perfect `userID`, the buddy system ignores it.

### Attempt 3: Removing accountUuid (Partially Worked)

The key insight: the `??` (nullish coalescing) operator falls through on `undefined`. If `accountUuid` doesn't exist, the expression evaluates to `userID` instead.

We deleted `accountUuid` from the config while keeping the rest of `oauthAccount` intact. The buddy system should have fallen back to `userID`...

But we **still got the wrong buddy**. The FNV-1a brute-forced ID produced "ghost" instead of "dragon" because the hash function was wrong.

### Attempt 4: Verifying the Algorithm

We downloaded the actual Claude Code source via `npm pack @anthropic-ai/claude-code@2.1.89` and compared every piece:

- **PRNG (Mulberry32)**: Identical. Same constant `0x6d2b79f5`.
- **Hash (FNV-1a)**: Identical. Same init `2166136261`, same prime `16777619`.
- **Species array**: Identical order. Decoded from `String.fromCharCode` obfuscation.
- **Rarity weights**: Identical.

Everything matched. Yet the results were wrong. This was deeply confusing.

### Attempt 5: The Bun.hash Breakthrough

Then we noticed the `bun.lock` file in the npm package. And this branch in the hash function:

```javascript
function hashString(s) {
  if (typeof Bun !== "undefined")
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn);  // ← THIS BRANCH
  // FNV-1a below — only used under Node.js
  let h = 2166136261;
  // ...
}
```

The native Claude Code binary (238MB executable) **embeds the Bun runtime**. When the hash function runs inside that binary, `typeof Bun !== "undefined"` is true, so it uses `Bun.hash()` (Wyhash) — a completely different algorithm from FNV-1a.

We installed Bun and tested:

```javascript
// Under Bun:
Bun.hash("c3b62c78...friend-2026-401") → rare ghost     // Matches Baneshift!
Bun.hash("603063fc...friend-2026-401") → common cactus   // Matches Prickle!

// Under Node (FNV-1a):
fnv1a("c3b62c78...friend-2026-401")    → legendary dragon  // WRONG for native binary
```

Every failed attempt suddenly made sense. The FNV-1a IDs we'd been brute-forcing were correct *for Node.js* but completely wrong *for the native binary that everyone actually uses*.

### Attempt 6: The Final Fix

With Bun installed, we brute-forced a UUID using `Bun.hash`:

```bash
bun -e "/* brute-force with Bun.hash */..."
# found: legendary dragon -> 18b852ac-df26-44ed-9a3f-d8992a0760f5
```

Set it as `accountUuid` (not `userID` — because `accountUuid` takes priority and won't be ignored). Deleted `companion` to force a fresh hatch. Restarted Claude Code.

Result: **Kiln the legendary dragon** with a wizard hat. Finally.

### Source Code References

All findings based on the deobfuscated Claude Code source (`@anthropic-ai/claude-code` v2.1.89):

- **Identity resolution**: `companionUserId()` → `oauthAccount?.accountUuid ?? userID ?? "anon"`
- **Hash function**: `hashString()` → `Bun.hash()` (native) or FNV-1a (npm)
- **Bone generation**: `roll()` → `rollFrom()` → `rollRarity()` + `pick(SPECIES)`
- **What's stored**: `StoredCompanion = { name, personality, hatchedAt }`
- **What's regenerated**: `CompanionBones = { rarity, species, eye, hat, shiny, stats }`
- **OAuth write**: `VZ6()` → `R8()` writes `oauthAccount` including `accountUuid`
- **OAuth skip condition**: If `billingType`, `accountCreatedAt`, `subscriptionCreatedAt` are all present, the startup flow skips the profile fetch — preserving our brute-forced UUID

---

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

**Reaction system**: After every Claude response, `fireCompanionObserver` sends your recent transcript (up to 5000 chars) to an API endpoint:

```
POST /api/organizations/{orgId}/claude_code/buddy_react
Body: { name, personality, species, rarity, stats, transcript, reason, recent, addressed }
```

The server returns a short quip that appears in the companion's speech bubble. Your buddy is *not* Claude — it's a separate system with its own API.

**Stats influence personality generation.** At hatch time, the `inspirationSeed` and stats (e.g. `CHAOS:100 DEBUGGING:80`) are sent to an AI model that generates the name and personality text. High CHAOS stats tend to produce chaotic personalities.

**Animation system:**
- Each species has **3 animation frames** (rest, fidget, special effect)
- Tick rate: **500ms**
- Idle loop: `[0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` where `-1` = blink
- When reacting or being petted: cycles through all frames rapidly

**Speech bubble:**
- Appears for **~10 seconds** (20 ticks)
- Last **~3 seconds** fades out (dim text)
- `/buddy pet` triggers **2.5 seconds** of floating hearts

**Addressing by name:** The companion intro is injected into Claude's system prompt:

> *"When the user addresses {name} directly (by name), its bubble will answer. Your job in that moment is to stay out of the way."*

So when you type "Kiln what do you think?", Claude steps back and the buddy's bubble answers via the reaction API.

**Hats**: Only non-common rarities get hats: crown, tophat, propeller, halo, wizard, beanie, tinyduck (a tiny duck sitting on its head).

**Narrow terminals:** If your terminal is under 100 columns, the sprite collapses to a one-line face:

| Species | Collapsed |
|---------|-----------|
| cat | `=·ω·=` |
| dragon | `<·~·>` |
| ghost | `(·o·)` |
| blob | `{·_·}` |

**Feature flag**: The entire system is gated behind `feature('BUDDY')`. Anthropic can disable it server-side at any time.

**April Fools origin:** The rainbow `/buddy` teaser notification only appears during **April 1-7, 2026**. The salt `friend-2026-401` confirms the April 1 launch date. After the teaser window, the command stays live but the startup notification disappears.

---

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
A: No. There is no progression system. Stats are fixed by your identity hash. The buddy reacts to your code contextually (via API), but nothing changes permanently.

**Q: Can I just edit the rarity in `~/.claude.json`?**
A: No. Bones (rarity, species, stats) are regenerated from your identity on every read. The source code explicitly says: *"users can't edit their way to a legendary."*

**Q: Why do I need Bun? Can I use Node?**
A: If you installed Claude Code as the **native binary** (which most people have), it uses Bun.hash internally. Running this tool under Node would use FNV-1a — a different hash function — and produce IDs that give the wrong buddy. Run `bun picker.js` to use the correct hash. If you installed Claude Code via `npm i -g @anthropic-ai/claude-code` and run it with Node, then Node/FNV-1a is correct for you.

**Q: How do I know if I have the native binary or npm install?**
A: Run `bun picker.js --verify`. It auto-detects and shows your install method. Or check: if `~/.local/bin/claude` (or `claude.exe`) exists and is 200MB+, it's the native binary.

**Q: Will this break my Team Plan?**
A: No. The tool only modifies `accountUuid` and `companion` in your config. Auth uses OAuth tokens stored separately — billing, org settings, and everything else are untouched.

**Q: Will this survive Claude Code updates?**
A: The `accountUuid` in your config persists across updates. However, if Anthropic changes the salt (`friend-2026-401`) or the algorithm, all buddy rolls will change. You'd need to re-pick with updated parameters.

**Q: My buddy reverted after re-login. What happened?**
A: The OAuth flow fetched your real `accountUuid` from the server and overwrote the brute-forced one. Set up persistence (option 4 in the picker, or run the platform scripts) to auto-fix this on every launch.

**Q: Will `/buddy pet` do anything special?**
A: It triggers a 2.5-second heart animation and a reaction from the buddy. No permanent effect.

**Q: What if I run on Bun instead of Node for daily Claude Code use?**
A: If you installed Claude Code via npm and run it under Bun yourself, `Bun.hash()` would be used. The picker handles this correctly — just run it under the same runtime as your Claude Code installation.

**Q: How rare is a shiny?**
A: 1% chance, rolled after species and hat. Shiny status is also regenerated from identity (not stored), so you can't fake it.

**Q: Can I get a shiny legendary?**
A: Yes, but it's ~0.01% per roll (1% legendary * 1% shiny). The brute-force would need roughly 10M+ attempts. Increase max attempts: `bun picker.js --quick dragon 20000000`

**Q: What does each stat do?**
A: Stats influence the AI-generated personality at hatch time. High CHAOS tends to produce chaotic names/personalities. High SNARK produces snarky companions. They don't affect gameplay — there is no gameplay.

## License

MIT

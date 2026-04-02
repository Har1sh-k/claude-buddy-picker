#!/usr/bin/env node
// picker.js — Interactive Claude Code buddy picker
// Pick your companion. Don't leave it to chance.
//
// Usage:
//   bun picker.js              # Interactive mode
//   bun picker.js --verify     # Check current buddy
//   bun picker.js --quick cat  # Quick pick: find legendary cat

const readline = require("readline");
const { fullRoll, SPECIES, RARITIES, RARITY_RANK, SPECIES_EMOJI, RARITY_STARS,
        STAT_NAMES, detectRuntime, randomUUID, randomHex } = require("./lib/buddy");
const { readConfig, getActiveIdentity, getCurrentBuddy, applyBuddy,
        getConfigPath, detectInstallMethod } = require("./lib/config");

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const c = {
  reset:     "\x1b[0m",
  bold:      "\x1b[1m",
  dim:       "\x1b[2m",
  red:       "\x1b[31m",
  green:     "\x1b[32m",
  yellow:    "\x1b[33m",
  blue:      "\x1b[34m",
  magenta:   "\x1b[35m",
  cyan:      "\x1b[36m",
  white:     "\x1b[37m",
  gray:      "\x1b[90m",
  bgYellow:  "\x1b[43m",
  bgMagenta: "\x1b[45m",
};

const RARITY_COLOR = {
  common:    c.white,
  uncommon:  c.green,
  rare:      c.blue,
  epic:      c.magenta,
  legendary: c.yellow,
};

function colorRarity(rarity) {
  return `${RARITY_COLOR[rarity]}${c.bold}${rarity}${c.reset}`;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function banner() {
  console.log();
  console.log(`${c.cyan}${c.bold}  ╔════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ║${c.reset}  ${c.yellow}${c.bold}Claude Buddy Picker${c.reset}                           ${c.cyan}${c.bold}║${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ║${c.reset}  ${c.dim}Pick your companion. Don't leave it to chance.${c.reset} ${c.cyan}${c.bold}║${c.reset}`);
  console.log(`${c.cyan}${c.bold}  ╚════════════════════════════════════════════════╝${c.reset}`);
  console.log();
}

function showRuntimeInfo() {
  const rt = detectRuntime();
  const install = detectInstallMethod();
  const hashLabel = rt.runtime === "bun"
    ? `${c.green}Bun.hash (Wyhash)${c.reset}`
    : `${c.yellow}FNV-1a${c.reset}`;
  console.log(`  ${c.dim}Runtime:${c.reset}  ${rt.runtime} ${rt.version}  →  ${hashLabel}`);
  console.log(`  ${c.dim}Install:${c.reset}  ${install.method} ${install.path ? `(${install.path})` : ""}`);
  console.log(`  ${c.dim}Config:${c.reset}   ${getConfigPath()}`);

  // Check runtime/install mismatch
  const mismatch = (install.method === "native" && rt.runtime !== "bun")
    || (install.method === "npm" && rt.runtime === "bun");

  if (mismatch) {
    const isNative = install.method === "native";
    console.log();
    console.log(`  ${c.red}${c.bold} MISMATCH ${c.reset} Your Claude Code is ${isNative ? "the native binary (Bun.hash)" : "an npm install (FNV-1a)"},`);
    console.log(`  but this tool is running under ${c.bold}${rt.runtime}${c.reset} (${isNative ? "FNV-1a" : "Bun.hash"}).`);
    console.log(`  Brute-forced IDs will produce the ${c.red}wrong buddy${c.reset}.`);
    console.log(`  Run with: ${c.cyan}${isNative ? "bun" : "node"} picker.js${c.reset}`);
  }

  return { mismatch };
}

function showCurrentBuddy() {
  const { config, error } = readConfig();
  if (!config) {
    const msg = error === "parse" ? "Config is invalid JSON" : "No config found";
    console.log(`  ${c.dim}Buddy:${c.reset}    ${c.red}${msg}${c.reset}`);
    return;
  }

  const { id, source } = getActiveIdentity(config);
  const buddy = getCurrentBuddy(config);
  const roll = fullRoll(id);

  console.log(`  ${c.dim}Identity:${c.reset} ${id.substring(0, 20)}... ${c.dim}(${source})${c.reset}`);

  if (buddy) {
    const emoji = SPECIES_EMOJI[roll.species] || "?";
    console.log(`  ${c.dim}Buddy:${c.reset}    ${emoji} ${colorRarity(roll.rarity)} ${c.bold}${roll.species}${c.reset} named ${c.cyan}${buddy.name}${c.reset}`);
    console.log(`  ${c.dim}Stars:${c.reset}    ${RARITY_COLOR[roll.rarity]}${RARITY_STARS[roll.rarity]}${c.reset}  ${c.dim}Hat: ${roll.hat} | Eye: ${roll.eye} | Shiny: ${roll.shiny}${c.reset}`);
  } else {
    console.log(`  ${c.dim}Buddy:${c.reset}    ${c.dim}(not hatched yet)${c.reset}`);
    console.log(`  ${c.dim}Roll:${c.reset}     ${SPECIES_EMOJI[roll.species]} ${colorRarity(roll.rarity)} ${roll.species}`);
  }
  console.log();
}

function showSpeciesMenu() {
  console.log(`\n  ${c.bold}Pick a species:${c.reset}\n`);

  const cols = 3;
  const rows = Math.ceil(SPECIES.length / cols);

  for (let row = 0; row < rows; row++) {
    let line = "  ";
    for (let col = 0; col < cols; col++) {
      const idx = col * rows + row;
      if (idx < SPECIES.length) {
        const s = SPECIES[idx];
        const num = String(idx + 1).padStart(2);
        const emoji = SPECIES_EMOJI[s] || " ";
        const name = s.padEnd(10);
        line += `  ${c.dim}${num}.${c.reset} ${emoji} ${name}`;
      }
    }
    console.log(line);
  }
  console.log();
}

function showRollResult(roll, id, mode) {
  const emoji = SPECIES_EMOJI[roll.species] || "?";
  console.log();
  console.log(`  ${c.green}${c.bold}Found!${c.reset}`);
  console.log();
  console.log(`  ${emoji}  ${colorRarity(roll.rarity)} ${c.bold}${roll.species}${c.reset}`);
  console.log(`  ${RARITY_COLOR[roll.rarity]}${RARITY_STARS[roll.rarity]}${c.reset}`);
  console.log();
  console.log(`  ${c.dim}Hat:${c.reset}   ${roll.hat}`);
  console.log(`  ${c.dim}Eye:${c.reset}   ${roll.eye}`);
  console.log(`  ${c.dim}Shiny:${c.reset} ${roll.shiny ? `${c.yellow}${c.bold}YES!${c.reset}` : "no"}`);
  console.log();
  console.log(`  ${c.dim}Stats:${c.reset}`);
  for (const stat of STAT_NAMES) {
    const val = roll.stats[stat];
    const bar = "█".repeat(Math.floor(val / 5)) + "░".repeat(20 - Math.floor(val / 5));
    const color = val >= 80 ? c.green : val >= 50 ? c.yellow : c.red;
    console.log(`    ${stat.padEnd(10)} ${color}${bar}${c.reset} ${c.bold}${val}${c.reset}`);
  }
  console.log();
  console.log(`  ${c.dim}ID (${mode}):${c.reset}`);
  console.log(`  ${c.cyan}${id}${c.reset}`);
  console.log();
}

function showProgress(current, total, found) {
  const pct = Math.floor((current / total) * 100);
  const barLen = 30;
  const filled = Math.floor((current / total) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const foundStr = found ? `  ${c.dim}best: ${colorRarity(found)}${c.reset}` : "";
  process.stdout.write(`\r  ${c.cyan}${bar}${c.reset} ${pct}% (${current.toLocaleString()}/${total.toLocaleString()})${foundStr}  `);
}

// ─── Core search ─────────────────────────────────────────────────────────────

function search(targetSpecies, maxAttempts = 500000) {
  const mode = "uuid"; // UUID mode — sets accountUuid (most reliable)
  const genId = randomUUID;

  let best = { rarity: "common", id: "", roll: null };
  const progressInterval = Math.max(1, Math.floor(maxAttempts / 200));

  for (let i = 0; i < maxAttempts; i++) {
    const id = genId();
    const roll = fullRoll(id);

    if (roll.species === targetSpecies && RARITY_RANK[roll.rarity] > RARITY_RANK[best.rarity]) {
      best = { rarity: roll.rarity, id, roll };

      if (i % progressInterval !== 0) {
        showProgress(i, maxAttempts, best.rarity);
      }

      if (roll.rarity === "legendary") {
        showProgress(i + 1, maxAttempts, best.rarity);
        return { ...best, mode, attempts: i + 1 };
      }
    }

    if (i % progressInterval === 0) {
      showProgress(i, maxAttempts, best.rarity);
    }
  }

  showProgress(maxAttempts, maxAttempts, best.rarity);
  return { ...best, mode, attempts: maxAttempts };
}

// ─── Interactive prompts ─────────────────────────────────────────────────────

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function mainMenu(rl) {
  console.log(`  ${c.bold}What would you like to do?${c.reset}\n`);
  console.log(`  ${c.dim}1.${c.reset} ${c.bold}Pick a new buddy${c.reset}        Find your perfect companion`);
  console.log(`  ${c.dim}2.${c.reset} ${c.bold}Check any ID${c.reset}            See what an ID produces`);
  console.log(`  ${c.dim}3.${c.reset} ${c.bold}View current buddy${c.reset}      Show your active companion`);
  console.log(`  ${c.dim}4.${c.reset} ${c.bold}Setup persistence${c.reset}       Survive re-logins`);
  console.log(`  ${c.dim}5.${c.reset} ${c.bold}Exit${c.reset}`);
  console.log();

  const choice = await ask(rl, `  ${c.cyan}>${c.reset} `);
  return choice.trim();
}

async function pickFlow(rl) {
  showSpeciesMenu();

  const speciesInput = await ask(rl, `  ${c.cyan}Species number or name:${c.reset} `);
  let targetSpecies;

  const num = parseInt(speciesInput);
  if (num >= 1 && num <= SPECIES.length) {
    targetSpecies = SPECIES[num - 1];
  } else {
    targetSpecies = speciesInput.trim().toLowerCase();
  }

  if (!SPECIES.includes(targetSpecies)) {
    console.log(`\n  ${c.red}Unknown species: ${speciesInput}${c.reset}`);
    console.log(`  ${c.dim}Valid: ${SPECIES.join(", ")}${c.reset}`);
    return;
  }

  const emoji = SPECIES_EMOJI[targetSpecies] || "?";
  console.log(`\n  ${c.bold}Target:${c.reset} ${emoji} ${c.yellow}legendary ${targetSpecies}${c.reset}`);

  const maxInput = await ask(rl, `  ${c.dim}Max attempts [500000]:${c.reset} `);
  const maxAttempts = parseInt(maxInput) || 500000;

  console.log();

  const result = search(targetSpecies, maxAttempts);
  console.log(); // clear progress line

  if (!result.roll) {
    console.log(`\n  ${c.red}No ${targetSpecies} found in ${maxAttempts.toLocaleString()} attempts. Try more.${c.reset}`);
    return;
  }

  showRollResult(result.roll, result.id, result.mode);

  if (result.rarity !== "legendary") {
    console.log(`  ${c.yellow}Best found was ${result.rarity}. Try more attempts for legendary.${c.reset}\n`);
  }

  const apply = await ask(rl, `  ${c.cyan}Apply to config? [Y/n]:${c.reset} `);
  if (apply.trim().toLowerCase() !== "n") {
    const res = applyBuddy(result.id, result.mode);
    if (res.success) {
      console.log(`\n  ${c.green}${c.bold}Applied!${c.reset} Restart Claude Code and run ${c.cyan}/buddy${c.reset} to hatch.`);
      if (res.backupPath) {
        console.log(`  ${c.dim}Backup: ${res.backupPath}${c.reset}`);
      }

      const persist = await ask(rl, `\n  ${c.cyan}Setup persistence (survive re-logins)? [Y/n]:${c.reset} `);
      if (persist.trim().toLowerCase() !== "n") {
        showPersistenceInstructions(result.id);
      }
    } else {
      console.log(`\n  ${c.red}Failed: ${res.error}${c.reset}`);
    }
  }
}

async function verifyFlow(rl) {
  const idInput = await ask(rl, `\n  ${c.cyan}Enter ID (or 'auto' for current):${c.reset} `);
  const id = idInput.trim();

  if (id === "auto" || id === "") {
    showCurrentBuddy();
    return;
  }

  const roll = fullRoll(id);
  showRollResult(roll, id, id.includes("-") ? "uuid" : "hex");
}

function showPersistenceInstructions(uuid) {
  const platform = process.platform;

  console.log(`\n  ${c.bold}Persistence Setup${c.reset}\n`);
  console.log(`  ${c.dim}This ensures your buddy survives OAuth re-logins.${c.reset}\n`);

  if (platform === "win32") {
    console.log(`  ${c.bold}PowerShell:${c.reset}`);
    console.log(`  ${c.cyan}powershell -ExecutionPolicy Bypass -File platforms\\windows\\persist.ps1 ${uuid}${c.reset}\n`);
    console.log(`  ${c.bold}Git Bash:${c.reset}`);
    console.log(`  ${c.cyan}bash platforms/windows/persist-bash.sh ${uuid}${c.reset}\n`);
  } else {
    console.log(`  ${c.bold}Bash/Zsh:${c.reset}`);
    console.log(`  ${c.cyan}bash platforms/unix/persist.sh ${uuid}${c.reset}\n`);
  }

  console.log(`  ${c.dim}Or manually add to your shell config — see README.md${c.reset}`);
}

// ─── Quick mode (CLI args) ───────────────────────────────────────────────────

function quickMode() {
  const args = process.argv.slice(2);

  if (args.includes("--verify")) {
    banner();
    const id = args[args.indexOf("--verify") + 1];
    if (id && id !== "auto") {
      const roll = fullRoll(id);
      showRollResult(roll, id, id.includes("-") ? "uuid" : "hex");
    } else {
      showRuntimeInfo();
      showCurrentBuddy();
    }
    return true;
  }

  if (args.includes("--quick")) {
    const species = args[args.indexOf("--quick") + 1];
    if (!species || !SPECIES.includes(species)) {
      console.log(`Usage: bun picker.js --quick <species>`);
      console.log(`Species: ${SPECIES.join(", ")}`);
      return true;
    }
    banner();
    const { mismatch } = showRuntimeInfo();
    console.log();

    if (mismatch) {
      console.log(`  ${c.red}Refusing to proceed — runtime does not match Claude install.${c.reset}\n`);
      process.exit(1);
    }

    const max = parseInt(args[args.indexOf("--quick") + 2]) || 500000;
    console.log(`  ${c.bold}Quick pick:${c.reset} ${SPECIES_EMOJI[species]} legendary ${species}\n`);

    const result = search(species, max);
    console.log();

    if (result.roll) {
      showRollResult(result.roll, result.id, result.mode);
      console.log(`  ${c.dim}To apply: bun picker.js → option 1 → choose species${c.reset}`);
    }
    return true;
  }

  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (quickMode()) return;

  banner();
  const { mismatch } = showRuntimeInfo();
  showCurrentBuddy();

  if (mismatch) {
    console.log(`  ${c.red}Refusing to proceed — runtime does not match Claude install.${c.reset}`);
    console.log(`  ${c.dim}Fix the mismatch above and re-run.${c.reset}\n`);
    process.exit(1);
  }

  const rl = createRL();

  try {
    let running = true;
    while (running) {
      const choice = await mainMenu(rl);

      switch (choice) {
        case "1":
          await pickFlow(rl);
          console.log();
          break;
        case "2":
          await verifyFlow(rl);
          console.log();
          break;
        case "3":
          showCurrentBuddy();
          break;
        case "4": {
          const { config: cfg } = readConfig();
          if (cfg) {
            const { id, source } = getActiveIdentity(cfg);
            if (source === "accountUuid") {
              showPersistenceInstructions(id);
            } else {
              console.log(`\n  ${c.dim}No accountUuid set. Persistence not needed unless you re-login.${c.reset}\n`);
            }
          }
          break;
        }
        case "5":
        case "q":
        case "":
          running = false;
          break;
        default:
          console.log(`  ${c.dim}Invalid choice${c.reset}`);
      }
    }
  } finally {
    rl.close();
  }

  console.log(`\n  ${c.dim}Bye! May your rolls be legendary.${c.reset}\n`);
}

main().catch(console.error);

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// Path to the Claude Code config file
const CONFIG_FILENAME = ".claude.json";

/**
 * Returns the absolute path to ~/.claude.json.
 */
function getConfigPath() {
  return path.join(os.homedir(), CONFIG_FILENAME);
}

/**
 * Reads and parses ~/.claude.json.
 * Returns { config, error }.
 *   - File missing:   { config: null, error: 'missing' }
 *   - Parse failure:  { config: null, error: 'parse', raw: <string> }
 *   - Success:        { config: <object>, error: null }
 */
function readConfig() {
  const configPath = getConfigPath();
  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    return { config: null, error: "missing" };
  }
  try {
    return { config: JSON.parse(raw), error: null };
  } catch {
    return { config: null, error: "parse", raw };
  }
}

/**
 * Determines the active identity from a config object.
 * Priority: oauthAccount.accountUuid > userID > anonymous.
 */
function getActiveIdentity(config) {
  if (config?.oauthAccount?.accountUuid) {
    return { id: config.oauthAccount.accountUuid, source: "accountUuid" };
  }
  if (config?.userID) {
    return { id: config.userID, source: "userID" };
  }
  return { id: "anon", source: "anon" };
}

/**
 * Returns the stored companion info ({ name, personality, hatchedAt }) or null.
 */
function getCurrentBuddy(config) {
  if (!config?.companion) return null;
  const { name, personality, hatchedAt } = config.companion;
  return { name, personality, hatchedAt };
}

/**
 * Creates a timestamped backup of ~/.claude.json.
 *
 * @returns {string|null} Backup path, or null if no config exists.
 */
function backupConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = configPath + ".backup-" + ts;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

/**
 * Applies a brute-forced ID to the config and writes it back to disk.
 * Creates a backup before writing. Refuses to write if the config is
 * malformed JSON (returns an error instead of silently overwriting).
 *
 * @param {string} id    - The ID value to write.
 * @param {'uuid'|'hex'} mode - Where to place the ID.
 *   'uuid' → set as oauthAccount.accountUuid
 *   'hex'  → set as userID, remove accountUuid
 * Both modes delete config.companion to force a re-hatch.
 */
function applyBuddy(id, mode) {
  try {
    const configPath = getConfigPath();
    const { config, error, raw } = readConfig();

    if (error === "parse") {
      return {
        success: false,
        error: "~/.claude.json exists but contains invalid JSON. "
             + "Fix it manually or delete it and re-login. "
             + "Refusing to overwrite to avoid destroying your config.",
      };
    }

    const cfg = config || {};

    // Backup before any writes
    const backupPath = backupConfig();

    if (mode === "uuid") {
      // Ensure oauthAccount exists, then set accountUuid
      if (!cfg.oauthAccount) cfg.oauthAccount = {};
      cfg.oauthAccount.accountUuid = id;
    } else if (mode === "hex") {
      // Set userID and strip accountUuid
      cfg.userID = id;
      if (cfg.oauthAccount) {
        delete cfg.oauthAccount.accountUuid;
      }
    }

    // Force companion re-hatch
    delete cfg.companion;

    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
    return { success: true, backupPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Checks whether a file at the given path is a native binary (large file)
 * as opposed to a shell script or symlink to an npm package.
 */
function isNativeBinary(filePath) {
  try {
    const resolved = fs.realpathSync(filePath);
    const stat = fs.statSync(resolved);
    // Native binaries are 100MB+; npm shims are tiny scripts
    return stat.size > 50 * 1024 * 1024;
  } catch {
    return false;
  }
}

/**
 * Detects how Claude Code was installed (native binary vs npm).
 *
 * Resolution order:
 *   1. Resolve `claude` on PATH via `which`/`where` and classify that binary.
 *   2. Fall back to well-known native binary paths.
 *   3. Fall back to npm global install check.
 *
 * Returns { method, hashType, path }.
 *   native binary → Bun/Wyhash
 *   npm global    → Node/FNV-1a
 */
function detectInstallMethod() {
  const home = os.homedir();

  // 1. Resolve the actual `claude` the user would run
  try {
    const whichCmd = process.platform === "win32" ? "where claude" : "which claude";
    const resolved = execSync(whichCmd, { encoding: "utf-8" }).trim().split("\n")[0];
    if (resolved) {
      if (isNativeBinary(resolved)) {
        return { method: "native", hashType: "wyhash", path: resolved };
      }
      // Small file / script — likely an npm shim
      return { method: "npm", hashType: "fnv1a", path: resolved };
    }
  } catch {
    // `claude` not on PATH — fall through to heuristics
  }

  // 2. Check well-known native binary paths
  const nativePaths = [
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".claude", "bin", "claude"),
  ];
  if (process.platform === "win32") {
    nativePaths.push(path.join(home, ".local", "bin", "claude.exe"));
  }
  for (const p of nativePaths) {
    if (fs.existsSync(p) && isNativeBinary(p)) {
      return { method: "native", hashType: "wyhash", path: p };
    }
  }

  // 3. Check npm global install
  try {
    const npmRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const npmPkg = path.join(npmRoot, "@anthropic-ai", "claude-code");
    if (fs.existsSync(npmPkg)) {
      return { method: "npm", hashType: "fnv1a", path: npmPkg };
    }
  } catch {
    // npm not available or command failed — fall through
  }

  return { method: "unknown", hashType: "unknown", path: null };
}

module.exports = {
  getConfigPath,
  readConfig,
  backupConfig,
  getActiveIdentity,
  getCurrentBuddy,
  applyBuddy,
  detectInstallMethod,
};

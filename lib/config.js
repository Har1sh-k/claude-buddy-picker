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
 * Returns the parsed object, or null if the file is missing or invalid.
 */
function readConfig() {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
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
 * Applies a brute-forced ID to the config and writes it back to disk.
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
    const config = readConfig() || {};

    if (mode === "uuid") {
      // Ensure oauthAccount exists, then set accountUuid
      if (!config.oauthAccount) config.oauthAccount = {};
      config.oauthAccount.accountUuid = id;
    } else if (mode === "hex") {
      // Set userID and strip accountUuid
      config.userID = id;
      if (config.oauthAccount) {
        delete config.oauthAccount.accountUuid;
      }
    }

    // Force companion re-hatch
    delete config.companion;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Detects how Claude Code was installed (native binary vs npm).
 * Returns { method, hashType, path }.
 *   native binary → Bun/Wyhash
 *   npm global    → Node/FNV-1a
 */
function detectInstallMethod() {
  const home = os.homedir();

  // Candidate paths for the native binary
  const nativePaths = [
    path.join(home, ".local", "bin", "claude"),
    path.join(home, ".claude", "bin", "claude"),
  ];
  // Windows also checks for a .exe variant
  if (process.platform === "win32") {
    nativePaths.push(path.join(home, ".local", "bin", "claude.exe"));
  }

  // Check native binary paths
  for (const p of nativePaths) {
    if (fs.existsSync(p)) {
      return { method: "native", hashType: "wyhash", path: p };
    }
  }

  // Check npm global install
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
  getActiveIdentity,
  getCurrentBuddy,
  applyBuddy,
  detectInstallMethod,
};

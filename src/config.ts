/**
 * Configuration loader for the debate-reviewer-mcp server
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Config } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration
const DEFAULT_CONFIG: Config = {
  agents: {
    codex: {
      path: "/opt/homebrew/bin/codex",
      args: ["--print", "--prompt"],
      timeout_seconds: 120,
    },
    claude: {
      path: "/opt/homebrew/bin/claude",
      args: ["--print", "--dangerously-skip-permissions", "-p"],
      timeout_seconds: 120,
    },
  },
  debate: {
    include_critique_round: true,
    max_output_length: 10000,
  },
  git: {
    include_staged: false,
    max_diff_lines: 1000,
  },
};

let cachedConfig: Config | null = null;

/**
 * Load configuration from config.json or use defaults
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Try to find config.json in multiple locations
  const possiblePaths = [
    join(__dirname, "..", "config.json"), // dist/../config.json
    join(__dirname, "..", "..", "config.json"), // dist/../../config.json (when running from src)
    join(process.cwd(), "config.json"), // Current working directory
  ];

  for (const configPath of possiblePaths) {
    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, "utf-8");
        const userConfig = JSON.parse(configContent) as Partial<Config>;
        cachedConfig = mergeConfig(DEFAULT_CONFIG, userConfig);
        return cachedConfig;
      } catch (error) {
        console.error(`Error loading config from ${configPath}:`, error);
      }
    }
  }

  // Use default config if no config file found
  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

/**
 * Deep merge user config with default config
 */
function mergeConfig(defaults: Config, user: Partial<Config>): Config {
  return {
    agents: {
      codex: { ...defaults.agents.codex, ...user.agents?.codex },
      claude: { ...defaults.agents.claude, ...user.agents?.claude },
    },
    debate: { ...defaults.debate, ...user.debate },
    git: { ...defaults.git, ...user.git },
  };
}

/**
 * Get agent configuration by type
 */
export function getAgentConfig(agent: "codex" | "claude") {
  const config = loadConfig();
  return config.agents[agent];
}

/**
 * Get debate configuration
 */
export function getDebateConfig() {
  const config = loadConfig();
  return config.debate;
}

/**
 * Get git configuration
 */
export function getGitConfig() {
  const config = loadConfig();
  return config.git;
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache() {
  cachedConfig = null;
}

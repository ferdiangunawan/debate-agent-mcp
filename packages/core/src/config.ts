/**
 * Configuration loader for the debate-agent core
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Config, AgentConfig, DebateConfig, ReviewConfig, GitConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration
const DEFAULT_CONFIG: Config = {
    agents: {
        codex: {
            name: "codex",
            path: "/opt/homebrew/bin/codex",
            args: ["exec", "--skip-git-repo-check"],
            timeout_seconds: 180,
        },
        claude: {
            name: "claude",
            path: "/opt/homebrew/bin/claude",
            args: ["--print", "--dangerously-skip-permissions"],
            timeout_seconds: 180,
        },
    },
    debate: {
        default_agents: ["codex", "claude"],
        include_critique_round: true,
        max_output_length: 10000,
        default_mode: "adversarial",
    },
    review: {
        severity_enabled: true,
        platforms: ["flutter", "android", "ios", "backend", "general"],
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

    const possiblePaths = [
        join(__dirname, "..", "config.json"),
        join(__dirname, "..", "..", "config.json"),
        join(__dirname, "..", "..", "..", "config.json"),
        join(process.cwd(), "config.json"),
        join(process.cwd(), "debate-agent.config.json"),
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

    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
}

/**
 * Deep merge user config with default config
 */
function mergeConfig(defaults: Config, user: Partial<Config>): Config {
    const mergedAgents: Record<string, AgentConfig> = { ...defaults.agents };

    if (user.agents) {
        for (const [agentName, config] of Object.entries(user.agents)) {
            mergedAgents[agentName] = {
                ...defaults.agents[agentName],
                ...config,
                name: agentName,
            };
        }
    }

    return {
        agents: mergedAgents,
        debate: { ...defaults.debate, ...user.debate },
        review: { ...defaults.review, ...user.review },
        git: { ...defaults.git, ...user.git },
    };
}

/**
 * Get agent configuration by name
 */
export function getAgentConfig(agentName: string): AgentConfig {
    const config = loadConfig();
    const agent = config.agents[agentName];
    if (!agent) {
        throw new Error(`Agent "${agentName}" not found in configuration. Available: ${Object.keys(config.agents).join(", ")}`);
    }
    return agent;
}

/**
 * Get all configured agent names
 */
export function getAgentNames(): string[] {
    const config = loadConfig();
    return Object.keys(config.agents);
}

/**
 * Get all agent configurations
 */
export function getAllAgents(): Record<string, AgentConfig> {
    const config = loadConfig();
    return config.agents;
}

/**
 * Get debate configuration
 */
export function getDebateConfig(): DebateConfig {
    const config = loadConfig();
    return config.debate;
}

/**
 * Get review configuration
 */
export function getReviewConfig(): ReviewConfig {
    const config = loadConfig();
    return config.review;
}

/**
 * Get git configuration
 */
export function getGitConfig(): GitConfig {
    const config = loadConfig();
    return config.git;
}

/**
 * Get default agents for debate
 */
export function getDefaultAgents(): string[] {
    const config = loadConfig();
    return config.debate.default_agents;
}

/**
 * Validate that agents exist in configuration
 */
export function validateAgents(agentNames: string[]): void {
    const config = loadConfig();
    const available = Object.keys(config.agents);

    for (const name of agentNames) {
        if (!config.agents[name]) {
            throw new Error(`Agent "${name}" not configured. Available agents: ${available.join(", ")}`);
        }
    }
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache(): void {
    cachedConfig = null;
}

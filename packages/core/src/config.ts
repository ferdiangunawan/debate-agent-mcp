/**
 * Configuration loader for the debate-agent core
 */

import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";
import type { Config, AgentConfig, DebateConfig, ReviewConfig, GitConfig, AgentHealthResult } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration with increased timeouts for reliability
const DEFAULT_CONFIG: Config = {
    agents: {
        codex: {
            name: "codex",
            path: "/opt/homebrew/bin/codex",
            args: ["exec", "--skip-git-repo-check"],
            timeout_seconds: 300, // 5 minutes (increased from 3)
        },
        claude: {
            name: "claude",
            path: "/opt/homebrew/bin/claude",
            args: ["--print", "--dangerously-skip-permissions"],
            timeout_seconds: 300, // 5 minutes (increased from 3)
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

/**
 * Check if an agent is healthy and responsive
 *
 * Uses spawnSync with shell:false for cross-platform compatibility and security.
 * Treats execution failures (ENOENT, EACCES, etc.) as unhealthy.
 */
export function checkAgentHealth(agentName: string): AgentHealthResult {
    const startTime = Date.now();

    try {
        const config = getAgentConfig(agentName);

        // Check if binary exists only when a path is explicitly provided.
        // For PATH-based commands (e.g., "codex"), let spawnSync resolve it.
        const hasPathSeparator = config.path.includes("/") || config.path.includes("\\");
        if ((hasPathSeparator || isAbsolute(config.path)) && !existsSync(config.path)) {
            return {
                agent: agentName,
                healthy: false,
                error: `Binary not found: ${config.path}`,
                latency_ms: Date.now() - startTime,
            };
        }

        // Try --version first (most common), then --help as fallback
        // Using spawnSync with shell:false for security and cross-platform support
        const versionResult = spawnSync(config.path, ["--version"], {
            timeout: 10000, // 10 second timeout for health check
            stdio: "pipe",
            shell: false,
        });

        // Check if the binary executed successfully
        if (versionResult.error) {
            // ENOENT = binary not found or not executable
            // EACCES = permission denied
            const errorCode = (versionResult.error as NodeJS.ErrnoException).code;
            if (errorCode === "ENOENT" || errorCode === "EACCES") {
                return {
                    agent: agentName,
                    healthy: false,
                    error: `Cannot execute binary: ${errorCode} - ${config.path}`,
                    latency_ms: Date.now() - startTime,
                };
            }

            // Timeout is also unhealthy
            if (errorCode === "ETIMEDOUT") {
                return {
                    agent: agentName,
                    healthy: false,
                    error: `Health check timed out for ${config.path}`,
                    latency_ms: Date.now() - startTime,
                };
            }

            // Try --help as fallback for other errors (some CLIs don't support --version)
            const helpResult = spawnSync(config.path, ["--help"], {
                timeout: 10000,
                stdio: "pipe",
                shell: false,
            });

            if (helpResult.error) {
                const helpErrorCode = (helpResult.error as NodeJS.ErrnoException).code;
                return {
                    agent: agentName,
                    healthy: false,
                    error: `Cannot execute binary: ${helpErrorCode} - ${config.path}`,
                    latency_ms: Date.now() - startTime,
                };
            }
        }

        // Binary executed (even if it returned non-zero exit code)
        // This means the binary is accessible and runnable
        return {
            agent: agentName,
            healthy: true,
            latency_ms: Date.now() - startTime,
        };
    } catch (error) {
        return {
            agent: agentName,
            healthy: false,
            error: error instanceof Error ? error.message : String(error),
            latency_ms: Date.now() - startTime,
        };
    }
}

/**
 * Check health of all configured agents
 */
export function checkAllAgentsHealth(): AgentHealthResult[] {
    const agentNames = getAgentNames();
    return agentNames.map(checkAgentHealth);
}

/**
 * Get list of healthy agents from the provided list
 */
export function getHealthyAgents(agentNames: string[]): string[] {
    const results = agentNames.map(checkAgentHealth);
    const healthy = results.filter(r => r.healthy).map(r => r.agent);
    const unhealthy = results.filter(r => !r.healthy);

    if (unhealthy.length > 0) {
        console.error(`[Config] Unhealthy agents: ${unhealthy.map(u => `${u.agent} (${u.error})`).join(", ")}`);
    }

    return healthy;
}

/**
 * Validate agents and return only healthy ones, with minimum count check
 */
export function validateAndFilterAgents(
    agentNames: string[],
    minRequired: number = 2
): { agents: string[]; warnings: string[] } {
    const warnings: string[] = [];

    // First validate they exist in config
    const available = getAgentNames();
    const validAgents = agentNames.filter(name => {
        if (!available.includes(name)) {
            warnings.push(`Agent "${name}" not configured, skipping`);
            return false;
        }
        return true;
    });

    // Then check health
    const healthyAgents = getHealthyAgents(validAgents);
    const unhealthyCount = validAgents.length - healthyAgents.length;

    if (unhealthyCount > 0) {
        warnings.push(`${unhealthyCount} agent(s) are unhealthy and will be skipped`);
    }

    if (healthyAgents.length < minRequired) {
        warnings.push(
            `Only ${healthyAgents.length} healthy agent(s) available, ` +
            `minimum ${minRequired} required for debate`
        );
    }

    return { agents: healthyAgents, warnings };
}

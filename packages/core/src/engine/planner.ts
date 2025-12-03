/**
 * Debate planner - creates structured debate plans for multi-agent debates
 */

import { randomUUID } from "crypto";
import type { DebatePlan, DebatePhase, DebateMode, ScoringCriteria } from "../types.js";
import { validateAgents } from "../config.js";

const DEFAULT_SCORING_CRITERIA: ScoringCriteria = {
    p0_weight: 15,
    p1_weight: 8,
    p2_weight: 3,
    false_positive_penalty: -10,
    concrete_fix_weight: 5,
    file_accuracy_weight: 2,
    clarity_max: 10,
};

/**
 * Create a debate plan for the given parameters
 */
export function createDebatePlan(
    topic: string,
    agents: string[],
    mode: DebateMode = "adversarial",
    rounds: number = 2
): DebatePlan {
    validateAgents(agents);

    if (agents.length < 2) {
        throw new Error("At least 2 agents are required for a debate");
    }

    if (rounds < 1 || rounds > 5) {
        throw new Error("Rounds must be between 1 and 5");
    }

    const phases = generatePhases(agents, mode, rounds);

    return {
        plan_id: randomUUID(),
        topic,
        mode,
        rounds,
        agents,
        phases,
        scoring_criteria: DEFAULT_SCORING_CRITERIA,
    };
}

/**
 * Generate debate phases based on mode
 */
function generatePhases(
    agents: string[],
    mode: DebateMode,
    rounds: number
): DebatePhase[] {
    const phases: DebatePhase[] = [];
    let phaseNum = 1;

    // Phase 1: Initial Review
    phases.push({
        phase: phaseNum++,
        name: "Initial Review",
        description: "Each agent independently reviews the code changes and produces findings",
        agent_actions: Object.fromEntries(
            agents.map((agent) => [
                agent,
                "Review the diff and produce P0/P1/P2 findings with concrete fix suggestions",
            ])
        ),
    });

    // Phase 2+: Mode-specific rounds
    for (let round = 1; round <= rounds; round++) {
        switch (mode) {
            case "adversarial":
                phases.push(generateAdversarialPhase(agents, phaseNum++, round));
                break;
            case "consensus":
                phases.push(generateConsensusPhase(agents, phaseNum++, round));
                break;
            case "collaborative":
                phases.push(generateCollaborativePhase(agents, phaseNum++, round));
                break;
        }
    }

    // Final Phase: Synthesis
    phases.push({
        phase: phaseNum,
        name: "Final Synthesis",
        description: "Judge evaluates all findings, scores agents, and produces merged recommendation",
        agent_actions: {
            judge: "Score each agent's output, determine winner, merge unique findings into final recommendation",
        },
    });

    return phases;
}

/**
 * Generate an adversarial phase (agents challenge each other)
 */
function generateAdversarialPhase(
    agents: string[],
    phaseNum: number,
    round: number
): DebatePhase {
    const actions: Record<string, string> = {};

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const targetAgent = agents[(i + 1) % agents.length];
        actions[agent] = `Challenge ${targetAgent}'s review: identify incorrect assessments, missed issues, and false positives`;
    }

    return {
        phase: phaseNum,
        name: `Adversarial Round ${round}`,
        description: "Agents critique and challenge each other's reviews to find weaknesses",
        agent_actions: actions,
    };
}

/**
 * Generate a consensus phase (agents find common ground)
 */
function generateConsensusPhase(
    agents: string[],
    phaseNum: number,
    round: number
): DebatePhase {
    const actions: Record<string, string> = {};

    for (const agent of agents) {
        actions[agent] = "Review other agents' findings and identify points of agreement. Propose consolidated findings.";
    }

    return {
        phase: phaseNum,
        name: `Consensus Round ${round}`,
        description: "Agents work to find common ground and agree on key issues",
        agent_actions: actions,
    };
}

/**
 * Generate a collaborative phase (agents build on each other)
 */
function generateCollaborativePhase(
    agents: string[],
    phaseNum: number,
    round: number
): DebatePhase {
    const actions: Record<string, string> = {};

    for (let i = 0; i < agents.length; i++) {
        const agent = agents[i];
        const prevAgent = agents[(i - 1 + agents.length) % agents.length];
        actions[agent] = `Build on ${prevAgent}'s analysis: add depth to their findings, suggest additional context, and propose improvements`;
    }

    return {
        phase: phaseNum,
        name: `Collaborative Round ${round}`,
        description: "Agents build constructively on each other's ideas",
        agent_actions: actions,
    };
}

/**
 * Get phase instructions for a specific agent
 */
export function getAgentPhaseInstructions(
    plan: DebatePlan,
    agent: string,
    phaseNum: number
): string {
    const phase = plan.phases.find((p) => p.phase === phaseNum);
    if (!phase) {
        throw new Error(`Phase ${phaseNum} not found in plan`);
    }

    const action = phase.agent_actions[agent];
    if (!action) {
        return `No specific action for ${agent} in this phase`;
    }

    return `Phase ${phaseNum}: ${phase.name}\n\nYour task: ${action}`;
}

/**
 * Format debate plan for display
 */
export function formatDebatePlan(plan: DebatePlan): string {
    const lines: string[] = [
        `# Debate Plan: ${plan.plan_id}`,
        "",
        `**Topic:** ${plan.topic}`,
        `**Mode:** ${plan.mode}`,
        `**Rounds:** ${plan.rounds}`,
        `**Agents:** ${plan.agents.join(", ")}`,
        "",
        "## Phases",
        "",
    ];

    for (const phase of plan.phases) {
        lines.push(`### Phase ${phase.phase}: ${phase.name}`);
        lines.push(`*${phase.description}*`);
        lines.push("");
        for (const [agent, action] of Object.entries(phase.agent_actions)) {
            lines.push(`- **${agent}:** ${action}`);
        }
        lines.push("");
    }

    lines.push("## Scoring Criteria");
    lines.push("");
    lines.push("| Criteria | Points |");
    lines.push("|----------|--------|");
    lines.push(`| P0 Finding | +${plan.scoring_criteria.p0_weight} |`);
    lines.push(`| P1 Finding | +${plan.scoring_criteria.p1_weight} |`);
    lines.push(`| P2 Finding | +${plan.scoring_criteria.p2_weight} |`);
    lines.push(`| False Positive | ${plan.scoring_criteria.false_positive_penalty} |`);
    lines.push(`| Concrete Fix | +${plan.scoring_criteria.concrete_fix_weight} |`);
    lines.push(`| File Accuracy | +${plan.scoring_criteria.file_accuracy_weight} |`);
    lines.push(`| Clarity | 0-${plan.scoring_criteria.clarity_max} |`);

    return lines.join("\n");
}

/**
 * Reporter module for 360 debate
 *
 * Generates comprehensive markdown reports to .debate/ directory
 * Supports two modes:
 * - Review mode: review-TIMESTAMP.md (P0/P1/P2 findings)
 * - Plan mode: plan-TIMESTAMP.md (implementation steps)
 */

import * as fs from "fs";
import * as path from "path";
import type {
    Finding,
    Debate360Result,
    Plan360Result,
    PlanStep,
    PlanScoreBreakdown,
    ScoreBreakdown,
} from "../types.js";

interface ReportOptions {
    result: Debate360Result;
    question: string;
    agents: string[];
    outputDir?: string;
}

/**
 * Format a finding for markdown display
 */
function formatFinding(finding: Finding, index?: number): string {
    const lines: string[] = [];
    const prefix = index !== undefined ? `${index + 1}. ` : "- ";
    const fileRef = finding.file ? ` — \`${finding.file}\`` : "";

    lines.push(`${prefix}**[${finding.severity}] ${finding.title}**${fileRef}`);

    if (finding.detail) {
        lines.push(`   ${finding.detail}`);
    }

    if (finding.fix) {
        lines.push(`   *Fix:* ${finding.fix}`);
    }

    return lines.join("\n");
}

/**
 * Format score breakdown as table row
 */
function formatScoreRow(agent: string, score: ScoreBreakdown, isWinner: boolean): string {
    const winnerMark = isWinner ? " **" : "";
    return `| ${agent}${winnerMark} | ${score.p0_findings} | ${score.p1_findings} | ${score.p2_findings} | ${score.false_positives} | ${score.concrete_fixes} | ${score.file_accuracy} | ${score.clarity} | **${score.total}** |`;
}

/**
 * Generate the full markdown report
 */
function generateReportMarkdown(options: ReportOptions): string {
    const { result, question, agents } = options;
    const sections: string[] = [];
    const timestamp = new Date().toISOString();

    // Header
    sections.push("# 360 Debate Review Report");
    sections.push("");
    sections.push("---");
    sections.push("");

    // Summary
    sections.push("## Summary");
    sections.push("");
    sections.push(`| Field | Value |`);
    sections.push(`|-------|-------|`);
    sections.push(`| **Date** | ${timestamp} |`);
    sections.push(`| **Question** | ${question.slice(0, 100)}${question.length > 100 ? "..." : ""} |`);
    sections.push(`| **Agents** | ${agents.join(", ")} |`);
    sections.push(`| **Rounds** | ${result.rounds.length} |`);
    sections.push(`| **Final Confidence** | ${result.confidence}% |`);
    sections.push(`| **Winner** | **${result.winner.toUpperCase()}** |`);
    sections.push(`| **Final Findings** | ${result.finalFindings.length} |`);
    sections.push(`| **Duration** | ${(result.totalDuration_ms / 1000).toFixed(1)}s |`);
    sections.push("");

    // Round-by-round details
    sections.push("---");
    sections.push("");
    sections.push("## Debate Rounds");
    sections.push("");

    for (const round of result.rounds) {
        sections.push(`### Round ${round.round}`);
        sections.push("");

        // Reviews
        sections.push("#### Initial Reviews");
        sections.push("");

        for (const review of round.reviews) {
            sections.push(`<details>`);
            sections.push(`<summary><strong>${review.agent.toUpperCase()}</strong> (${review.review.findings.length} findings)</summary>`);
            sections.push("");

            if (review.review.findings.length > 0) {
                for (const finding of review.review.findings) {
                    sections.push(formatFinding(finding));
                }
            } else {
                sections.push("*No findings*");
            }

            if (review.review.residual_risks.length > 0) {
                sections.push("");
                sections.push("**Residual Risks:**");
                for (const risk of review.review.residual_risks) {
                    sections.push(`- ${risk}`);
                }
            }

            sections.push("");
            sections.push("</details>");
            sections.push("");
        }

        // 360 Critiques
        if (round.critiques.length > 0) {
            sections.push("#### 360 Cross-Review");
            sections.push("");

            for (const critique of round.critiques) {
                sections.push(`<details>`);
                sections.push(`<summary><strong>${critique.reviewer.toUpperCase()}</strong> critiques <strong>${critique.target.toUpperCase()}</strong> (${critique.votes.length} votes)</summary>`);
                sections.push("");

                if (critique.votes.length > 0) {
                    sections.push("| Finding | Vote | Reason |");
                    sections.push("|---------|------|--------|");
                    for (const vote of critique.votes) {
                        const emoji = vote.vote === "agree" ? "✅" : vote.vote === "disagree" ? "❌" : "⚪";
                        sections.push(`| ${vote.findingTitle.slice(0, 40)} | ${emoji} ${vote.vote} | ${vote.reason || "-"} |`);
                    }
                }

                sections.push("");
                sections.push(`*Duration: ${critique.duration_ms}ms*`);
                sections.push("");
                sections.push("</details>");
                sections.push("");
            }
        }

        // Scores
        sections.push("#### Round Scores");
        sections.push("");
        sections.push("| Agent | P0 | P1 | P2 | False+ | Fixes | Accuracy | Clarity | Total |");
        sections.push("|-------|----|----|----|----|-----|----------|---------|-------|");

        const sortedAgents = Object.entries(round.scores)
            .sort(([, a], [, b]) => b.total - a.total);

        for (const [agent, score] of sortedAgents) {
            const isWinner = agent === result.winner;
            sections.push(formatScoreRow(agent, score, isWinner));
        }

        sections.push("");
        sections.push(`**Confidence: ${round.confidence}%**`);
        sections.push("");

        // Agreement matrix
        if (Object.keys(round.agreementMatrix).length > 0) {
            sections.push("#### Agreement Matrix");
            sections.push("");

            const agentList = Object.keys(round.agreementMatrix);
            const headerRow = ["Agent", ...agentList].join(" | ");
            const separatorRow = agentList.map(() => "---").concat(["---"]).join(" | ");

            sections.push(`| ${headerRow} |`);
            sections.push(`| ${separatorRow} |`);

            for (const agentA of agentList) {
                const row = [agentA];
                for (const agentB of agentList) {
                    const agreement = round.agreementMatrix[agentA]?.[agentB] ?? 0;
                    row.push(`${agreement}%`);
                }
                sections.push(`| ${row.join(" | ")} |`);
            }

            sections.push("");
        }

        sections.push("---");
        sections.push("");
    }

    // Composition phase
    sections.push("## Winner Composition");
    sections.push("");
    sections.push(`**Composer:** ${result.composed.composer.toUpperCase()}`);
    sections.push("");

    if (result.composed.proposedFindings.length > 0) {
        sections.push("### Proposed Findings");
        sections.push("");
        for (let i = 0; i < result.composed.proposedFindings.length; i++) {
            sections.push(formatFinding(result.composed.proposedFindings[i], i));
        }
        sections.push("");
    }

    if (result.composed.eliminatedFindings.length > 0) {
        sections.push("### Eliminated Findings");
        sections.push("");
        sections.push("| Finding | Reason |");
        sections.push("|---------|--------|");
        for (const finding of result.composed.eliminatedFindings) {
            const sig = finding.title.slice(0, 40);
            const reason = result.composed.eliminationReasons[sig] || finding.detail || "No reason";
            sections.push(`| ${finding.title} | ${reason} |`);
        }
        sections.push("");
    }

    // Validation phase
    sections.push("---");
    sections.push("");
    sections.push("## Validation");
    sections.push("");

    if (result.validation.votes.length > 0) {
        // Group votes by finding
        const votesByFinding = new Map<string, { approve: string[]; reject: string[] }>();

        for (const vote of result.validation.votes) {
            if (!votesByFinding.has(vote.findingId)) {
                votesByFinding.set(vote.findingId, { approve: [], reject: [] });
            }
            const entry = votesByFinding.get(vote.findingId)!;
            if (vote.vote === "approve") {
                entry.approve.push(vote.agent);
            } else {
                entry.reject.push(vote.agent);
            }
        }

        sections.push("| Finding | Approves | Rejects | Result |");
        sections.push("|---------|----------|---------|--------|");

        for (const [id, votes] of votesByFinding) {
            const indexMatch = id.match(/finding_(\d+)/);
            const index = indexMatch ? parseInt(indexMatch[1], 10) : -1;
            const finding = result.composed.proposedFindings[index];
            const title = finding?.title?.slice(0, 30) || id;
            const result_status = votes.approve.length >= votes.reject.length ? "✅ Approved" : "❌ Rejected";
            sections.push(`| ${title} | ${votes.approve.join(", ")} | ${votes.reject.join(", ")} | ${result_status} |`);
        }
        sections.push("");
    }

    // Final result
    sections.push("---");
    sections.push("");
    sections.push("## Final Result");
    sections.push("");

    if (result.finalFindings.length > 0) {
        // Group by severity
        const p0 = result.finalFindings.filter(f => f.severity === "P0");
        const p1 = result.finalFindings.filter(f => f.severity === "P1");
        const p2 = result.finalFindings.filter(f => f.severity === "P2");

        if (p0.length > 0) {
            sections.push("### P0 - Critical Issues");
            sections.push("");
            for (const finding of p0) {
                sections.push(formatFinding(finding));
            }
            sections.push("");
        }

        if (p1.length > 0) {
            sections.push("### P1 - Likely Bugs");
            sections.push("");
            for (const finding of p1) {
                sections.push(formatFinding(finding));
            }
            sections.push("");
        }

        if (p2.length > 0) {
            sections.push("### P2 - Minor Issues");
            sections.push("");
            for (const finding of p2) {
                sections.push(formatFinding(finding));
            }
            sections.push("");
        }
    } else {
        sections.push("*No issues found*");
        sections.push("");
    }

    // Residual risks
    if (result.finalResidualRisks.length > 0) {
        sections.push("### Residual Risks");
        sections.push("");
        for (const risk of result.finalResidualRisks) {
            sections.push(`- ${risk}`);
        }
        sections.push("");
    }

    // Open questions
    if (result.finalOpenQuestions.length > 0) {
        sections.push("### Open Questions");
        sections.push("");
        for (const question of result.finalOpenQuestions) {
            sections.push(`- ${question}`);
        }
        sections.push("");
    }

    // Footer
    sections.push("---");
    sections.push("");
    sections.push("*Generated by [Debate Agent MCP](https://github.com/ferdiangunawan/debate-agent-mcp)*");
    sections.push("");

    return sections.join("\n");
}

/**
 * Write debate report to .debate/ directory
 */
export function writeDebateReport(options: ReportOptions): string {
    const outputDir = options.outputDir || ".debate";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `debate-${timestamp}.md`;
    const filepath = path.join(outputDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate markdown content
    const content = generateReportMarkdown(options);

    // Write file
    fs.writeFileSync(filepath, content, "utf-8");

    console.error(`[360 Debate] Report written to ${filepath}`);

    return filepath;
}

/**
 * Get absolute path for report
 */
export function getReportPath(basePath: string, outputDir: string = ".debate"): string {
    return path.resolve(basePath, outputDir);
}

// ============================================
// PLAN MODE REPORTER
// ============================================

interface PlanReportOptions {
    result: Plan360Result;
    question: string;
    agents: string[];
    outputDir?: string;
}

/**
 * Format a plan step for markdown display
 */
function formatPlanStep(step: PlanStep, index?: number): string {
    const lines: string[] = [];
    const prefix = index !== undefined ? `${index + 1}. ` : "- ";

    lines.push(`${prefix}**${step.title}** (Phase ${step.phase})`);

    if (step.description) {
        lines.push(`   ${step.description}`);
    }

    if (step.files && step.files.length > 0) {
        lines.push(`   *Files:* \`${step.files.join("`, `")}\``);
    }

    if (step.dependencies && step.dependencies.length > 0) {
        lines.push(`   *Dependencies:* ${step.dependencies.join(", ")}`);
    }

    if (step.consensus > 0) {
        lines.push(`   *Consensus:* ${step.consensus}%`);
    }

    return lines.join("\n");
}

/**
 * Format plan score breakdown as table row
 */
function formatPlanScoreRow(agent: string, score: PlanScoreBreakdown, isWinner: boolean): string {
    const winnerMark = isWinner ? " **" : "";
    return `| ${agent}${winnerMark} | ${score.clarity} | ${score.completeness} | ${score.feasibility} | ${score.consensus} | **${score.total}** |`;
}

/**
 * Generate the full markdown report for plan mode
 */
function generatePlanReportMarkdown(options: PlanReportOptions): string {
    const { result, question, agents } = options;
    const sections: string[] = [];
    const timestamp = new Date().toISOString();

    // Header
    sections.push("# 360 Implementation Plan Report");
    sections.push("");
    sections.push("---");
    sections.push("");

    // Summary
    sections.push("## Summary");
    sections.push("");
    sections.push(`| Field | Value |`);
    sections.push(`|-------|-------|`);
    sections.push(`| **Mode** | Plan |`);
    sections.push(`| **Date** | ${timestamp} |`);
    sections.push(`| **Question** | ${question.slice(0, 100)}${question.length > 100 ? "..." : ""} |`);
    sections.push(`| **Agents** | ${agents.join(", ")} |`);
    sections.push(`| **Rounds** | ${result.rounds.length} |`);
    sections.push(`| **Final Confidence** | ${result.confidence}% |`);
    sections.push(`| **Winner** | **${result.winner.toUpperCase()}** |`);
    sections.push(`| **Final Steps** | ${result.finalPlan.length} |`);
    sections.push(`| **Duration** | ${(result.totalDuration_ms / 1000).toFixed(1)}s |`);
    sections.push("");

    // Round-by-round details
    sections.push("---");
    sections.push("");
    sections.push("## Debate Rounds");
    sections.push("");

    for (const round of result.rounds) {
        sections.push(`### Round ${round.round}`);
        sections.push("");

        // Plans
        sections.push("#### Agent Plans");
        sections.push("");

        for (const plan of round.plans) {
            sections.push(`<details>`);
            sections.push(`<summary><strong>${plan.agent.toUpperCase()}</strong> (${plan.plan.steps.length} steps)</summary>`);
            sections.push("");

            if (plan.plan.steps.length > 0) {
                for (const step of plan.plan.steps) {
                    sections.push(formatPlanStep(step));
                }
            } else {
                sections.push("*No steps defined*");
            }

            if (plan.plan.summary) {
                sections.push("");
                sections.push(`**Summary:** ${plan.plan.summary}`);
            }

            if (plan.plan.risks.length > 0) {
                sections.push("");
                sections.push("**Risks:**");
                for (const risk of plan.plan.risks) {
                    sections.push(`- ${risk}`);
                }
            }

            sections.push("");
            sections.push("</details>");
            sections.push("");
        }

        // 360 Critiques
        if (round.critiques.length > 0) {
            sections.push("#### 360 Cross-Review");
            sections.push("");

            for (const critique of round.critiques) {
                sections.push(`<details>`);
                sections.push(`<summary><strong>${critique.reviewer.toUpperCase()}</strong> critiques <strong>${critique.target.toUpperCase()}</strong> (${critique.stepVotes.length} votes)</summary>`);
                sections.push("");

                if (critique.stepVotes.length > 0) {
                    sections.push("| Step | Vote | Reason |");
                    sections.push("|------|------|--------|");
                    for (const vote of critique.stepVotes) {
                        const emoji = vote.vote === "agree" ? "✅" : vote.vote === "disagree" ? "❌" : "🔧";
                        sections.push(`| ${vote.stepTitle.slice(0, 40)} | ${emoji} ${vote.vote} | ${vote.reason || "-"} |`);
                    }
                }

                sections.push("");
                sections.push(`*Duration: ${critique.duration_ms}ms*`);
                sections.push("");
                sections.push("</details>");
                sections.push("");
            }
        }

        // Scores
        sections.push("#### Round Scores");
        sections.push("");
        sections.push("| Agent | Clarity | Completeness | Feasibility | Consensus | Total |");
        sections.push("|-------|---------|--------------|-------------|-----------|-------|");

        const sortedAgents = Object.entries(round.scores)
            .sort(([, a], [, b]) => b.total - a.total);

        for (const [agent, score] of sortedAgents) {
            const isWinner = agent === result.winner;
            sections.push(formatPlanScoreRow(agent, score, isWinner));
        }

        sections.push("");
        sections.push(`**Confidence: ${round.confidence}%**`);
        sections.push("");

        // Agreement matrix
        if (Object.keys(round.agreementMatrix).length > 0) {
            sections.push("#### Agreement Matrix");
            sections.push("");

            const agentList = Object.keys(round.agreementMatrix);
            const headerRow = ["Agent", ...agentList].join(" | ");
            const separatorRow = agentList.map(() => "---").concat(["---"]).join(" | ");

            sections.push(`| ${headerRow} |`);
            sections.push(`| ${separatorRow} |`);

            for (const agentA of agentList) {
                const row = [agentA];
                for (const agentB of agentList) {
                    const agreement = round.agreementMatrix[agentA]?.[agentB] ?? 0;
                    row.push(`${agreement}%`);
                }
                sections.push(`| ${row.join(" | ")} |`);
            }

            sections.push("");
        }

        sections.push("---");
        sections.push("");
    }

    // Composition phase
    sections.push("## Winner Composition");
    sections.push("");
    sections.push(`**Composer:** ${result.composed.composer.toUpperCase()}`);
    sections.push("");

    if (result.composed.summary) {
        sections.push(`**Summary:** ${result.composed.summary}`);
        sections.push("");
    }

    if (result.composed.proposedSteps.length > 0) {
        sections.push("### Proposed Steps");
        sections.push("");
        for (let i = 0; i < result.composed.proposedSteps.length; i++) {
            sections.push(formatPlanStep(result.composed.proposedSteps[i], i));
        }
        sections.push("");
    }

    if (result.composed.eliminatedSteps.length > 0) {
        sections.push("### Eliminated Steps");
        sections.push("");
        sections.push("| Step | Reason |");
        sections.push("|------|--------|");
        for (const step of result.composed.eliminatedSteps) {
            const reason = result.composed.eliminationReasons[step.title] || step.description || "No reason";
            sections.push(`| ${step.title} | ${reason} |`);
        }
        sections.push("");
    }

    // Validation phase
    sections.push("---");
    sections.push("");
    sections.push("## Validation");
    sections.push("");

    if (result.validation.votes.length > 0) {
        // Group votes by step
        const votesByStep = new Map<string, { approve: string[]; reject: string[] }>();

        for (const vote of result.validation.votes) {
            if (!votesByStep.has(vote.stepTitle)) {
                votesByStep.set(vote.stepTitle, { approve: [], reject: [] });
            }
            const entry = votesByStep.get(vote.stepTitle)!;
            if (vote.vote === "approve") {
                entry.approve.push(vote.agent);
            } else {
                entry.reject.push(vote.agent);
            }
        }

        sections.push("| Step | Approves | Rejects | Result |");
        sections.push("|------|----------|---------|--------|");

        for (const [stepTitle, votes] of votesByStep) {
            const title = stepTitle.slice(0, 30);
            const result_status = votes.approve.length >= votes.reject.length ? "✅ Approved" : "❌ Rejected";
            sections.push(`| ${title} | ${votes.approve.join(", ")} | ${votes.reject.join(", ")} | ${result_status} |`);
        }
        sections.push("");
    }

    // Final result
    sections.push("---");
    sections.push("");
    sections.push("## Final Implementation Plan");
    sections.push("");

    if (result.finalPlan.length > 0) {
        // Group by phase
        const phaseMap = new Map<number, PlanStep[]>();
        for (const step of result.finalPlan) {
            if (!phaseMap.has(step.phase)) {
                phaseMap.set(step.phase, []);
            }
            phaseMap.get(step.phase)!.push(step);
        }

        const sortedPhases = [...phaseMap.keys()].sort((a, b) => a - b);

        for (const phase of sortedPhases) {
            const steps = phaseMap.get(phase)!;
            sections.push(`### Phase ${phase}`);
            sections.push("");
            for (let i = 0; i < steps.length; i++) {
                sections.push(formatPlanStep(steps[i], i));
            }
            sections.push("");
        }
    } else {
        sections.push("*No implementation steps finalized*");
        sections.push("");
    }

    // Residual risks
    if (result.finalResidualRisks.length > 0) {
        sections.push("### Risks");
        sections.push("");
        for (const risk of result.finalResidualRisks) {
            sections.push(`- ${risk}`);
        }
        sections.push("");
    }

    // Open questions
    if (result.finalOpenQuestions.length > 0) {
        sections.push("### Open Questions");
        sections.push("");
        for (const question of result.finalOpenQuestions) {
            sections.push(`- ${question}`);
        }
        sections.push("");
    }

    // Footer
    sections.push("---");
    sections.push("");
    sections.push("*Generated by [Debate Agent MCP](https://github.com/ferdiangunawan/debate-agent-mcp)*");
    sections.push("");

    return sections.join("\n");
}

/**
 * Write plan report to .debate/ directory
 */
export function writePlanReport(options: PlanReportOptions): string {
    const outputDir = options.outputDir || ".debate";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `plan-${timestamp}.md`;
    const filepath = path.join(outputDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate markdown content
    const content = generatePlanReportMarkdown(options);

    // Write file
    fs.writeFileSync(filepath, content, "utf-8");

    console.error(`[360 Plan] Report written to ${filepath}`);

    return filepath;
}

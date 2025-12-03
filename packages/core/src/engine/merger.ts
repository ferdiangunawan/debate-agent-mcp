/**
 * Recommendation merger - combines insights from N agents into a final recommendation
 */

import type { Finding, AgentDebateOutput, Severity } from "../types.js";

interface MergerInput {
    agentOutputs: AgentDebateOutput[];
    winner: string;
    diffFiles: string[];
}

interface MergerResult {
    mergedFindings: Finding[];
    residualRisks: string[];
    openQuestions: string[];
    recommendation: string;
}

/**
 * Generate a merged recommendation from all agent outputs
 * Prioritizes the winner's output but includes unique insights from all
 */
export function generateMergedRecommendation(input: MergerInput): MergerResult {
    const { agentOutputs, winner, diffFiles } = input;

    // Sort agents by score (winner first)
    const sortedOutputs = [...agentOutputs].sort((a, b) => b.score.total - a.score.total);

    // Merge findings from all agents
    const mergedFindings = mergeFindings(sortedOutputs);

    // Merge residual risks
    const residualRisks = mergeStringArrays(
        sortedOutputs.map((o) => o.review.residual_risks)
    );

    // Merge open questions
    const openQuestions = mergeStringArrays(
        sortedOutputs.map((o) => o.review.open_questions)
    );

    // Build recommendation document
    const recommendation = buildRecommendation({
        agentOutputs: sortedOutputs,
        winner,
        diffFiles,
        mergedFindings,
        residualRisks,
        openQuestions,
    });

    return {
        mergedFindings,
        residualRisks,
        openQuestions,
        recommendation,
    };
}

/**
 * Merge findings from all agents, removing duplicates and ordering by severity
 */
function mergeFindings(agentOutputs: AgentDebateOutput[]): Finding[] {
    const allFindings: (Finding & { source: string })[] = [];

    for (const output of agentOutputs) {
        for (const finding of output.review.findings) {
            allFindings.push({ ...finding, source: output.agent });
        }
    }

    // Deduplicate by similarity
    const uniqueFindings: Finding[] = [];
    const seenSignatures = new Set<string>();

    for (const finding of allFindings) {
        const signature = createFindingSignature(finding);
        if (!seenSignatures.has(signature)) {
            seenSignatures.add(signature);
            uniqueFindings.push(finding);
        }
    }

    // Sort by severity (P0 > P1 > P2)
    const severityOrder: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };
    uniqueFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return uniqueFindings;
}

/**
 * Create a signature for deduplication
 */
function createFindingSignature(finding: Finding): string {
    const normalized = [
        finding.severity,
        finding.title.toLowerCase().replace(/[^\w\s]/g, ""),
        finding.file?.split(":")[0] || "",
    ].join("|");

    return normalized;
}

/**
 * Merge multiple string arrays, removing duplicates
 */
function mergeStringArrays(arrays: string[][]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const arr of arrays) {
        for (const item of arr) {
            const normalized = item.toLowerCase().trim();
            if (!seen.has(normalized) && item.trim()) {
                seen.add(normalized);
                result.push(item.trim());
            }
        }
    }

    return result;
}

interface RecommendationBuildInput {
    agentOutputs: AgentDebateOutput[];
    winner: string;
    diffFiles: string[];
    mergedFindings: Finding[];
    residualRisks: string[];
    openQuestions: string[];
}

/**
 * Build the final recommendation document
 */
function buildRecommendation(input: RecommendationBuildInput): string {
    const {
        agentOutputs,
        winner,
        diffFiles,
        mergedFindings,
        residualRisks,
        openQuestions,
    } = input;

    const sections: string[] = [];

    // Header
    sections.push("# Merged Code Review Recommendation");
    sections.push("");
    sections.push(`*Based on debate between ${agentOutputs.length} agents: ${agentOutputs.map((o) => o.agent).join(", ")}*`);
    sections.push(`*Winner: ${winner.toUpperCase()}*`);
    sections.push("");

    // Files changed
    if (diffFiles.length > 0) {
        sections.push("## Files Changed");
        sections.push(diffFiles.map((f) => `- \`${f}\``).join("\n"));
        sections.push("");
    }

    // Findings by severity
    if (mergedFindings.length > 0) {
        sections.push("## Findings");
        sections.push("");

        const p0Findings = mergedFindings.filter((f) => f.severity === "P0");
        const p1Findings = mergedFindings.filter((f) => f.severity === "P1");
        const p2Findings = mergedFindings.filter((f) => f.severity === "P2");

        if (p0Findings.length > 0) {
            sections.push("### P0 - Critical Issues");
            for (const finding of p0Findings) {
                sections.push(formatFinding(finding));
            }
            sections.push("");
        }

        if (p1Findings.length > 0) {
            sections.push("### P1 - Likely Bugs/Regressions");
            for (const finding of p1Findings) {
                sections.push(formatFinding(finding));
            }
            sections.push("");
        }

        if (p2Findings.length > 0) {
            sections.push("### P2 - Minor Issues");
            for (const finding of p2Findings) {
                sections.push(formatFinding(finding));
            }
            sections.push("");
        }
    } else {
        sections.push("## Findings");
        sections.push("No issues found.");
        sections.push("");
    }

    // Residual risks
    if (residualRisks.length > 0) {
        sections.push("## Residual Risks / Testing Gaps");
        sections.push(residualRisks.map((r) => `- ${r}`).join("\n"));
        sections.push("");
    }

    // Open questions
    if (openQuestions.length > 0) {
        sections.push("## Open Questions");
        sections.push(openQuestions.map((q) => `- ${q}`).join("\n"));
        sections.push("");
    }

    // Scoring summary
    sections.push("## Agent Scores");
    sections.push("");
    sections.push("| Agent | P0 | P1 | P2 | False+ | Fixes | Accuracy | Clarity | Total |");
    sections.push("|-------|----|----|----|----|-----|----------|---------|-------|");

    for (const output of agentOutputs) {
        const s = output.score;
        const isWinner = output.agent === winner ? " **" : "";
        sections.push(
            `| ${output.agent}${isWinner} | ${s.p0_findings} | ${s.p1_findings} | ${s.p2_findings} | ${s.false_positives} | ${s.concrete_fixes} | ${s.file_accuracy} | ${s.clarity} | ${s.total} |`
        );
    }
    sections.push("");

    return sections.join("\n");
}

/**
 * Format a single finding for display
 */
function formatFinding(finding: Finding): string {
    const lines: string[] = [];
    const fileRef = finding.file ? ` — \`${finding.file}\`` : "";
    lines.push(`- **[${finding.severity}] ${finding.title}**${fileRef}`);

    if (finding.detail) {
        lines.push(`  ${finding.detail}`);
    }

    if (finding.fix) {
        lines.push(`  *Fix:* ${finding.fix}`);
    }

    return lines.join("\n");
}

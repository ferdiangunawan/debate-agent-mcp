/**
 * Confidence scoring module for 360 debate
 *
 * Calculates confidence based on agent agreement on findings.
 * Confidence = (findings with majority agreement / total unique findings) * 100
 */

import type {
    Finding,
    AgentDebateOutput,
    CritiqueResult,
    ConfidenceResult,
} from "../types.js";

/**
 * Create a unique signature for a finding (for deduplication and matching)
 */
export function createFindingSignature(finding: Finding): string {
    const normalized = [
        finding.severity,
        finding.title.toLowerCase().replace(/[^\w\s]/g, "").trim(),
        finding.file?.split(":")[0]?.toLowerCase() || "",
    ].join("|");
    return normalized;
}

/**
 * Match two findings by similarity
 * Returns true if findings are likely the same issue
 */
export function findingsMatch(a: Finding, b: Finding): boolean {
    // Same severity and similar title
    if (a.severity !== b.severity) return false;

    const titleA = a.title.toLowerCase().replace(/[^\w\s]/g, "").trim();
    const titleB = b.title.toLowerCase().replace(/[^\w\s]/g, "").trim();

    // Exact match
    if (titleA === titleB) return true;

    // Check for significant word overlap
    const wordsA = new Set(titleA.split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(titleB.split(/\s+/).filter(w => w.length > 3));

    if (wordsA.size === 0 || wordsB.size === 0) return false;

    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);

    // Jaccard similarity > 0.5
    const similarity = intersection.length / union.size;
    if (similarity > 0.5) return true;

    // Same file reference
    if (a.file && b.file) {
        const fileA = a.file.split(":")[0];
        const fileB = b.file.split(":")[0];
        if (fileA === fileB && similarity > 0.3) return true;
    }

    return false;
}

/**
 * Collect all unique findings from all agents
 */
export function collectAllFindings(
    agentOutputs: AgentDebateOutput[]
): { finding: Finding; source: string; signature: string }[] {
    const allFindings: { finding: Finding; source: string; signature: string }[] = [];
    const seenSignatures = new Set<string>();

    for (const output of agentOutputs) {
        for (const finding of output.review.findings) {
            const signature = createFindingSignature(finding);

            // Check if we've seen a similar finding
            let isDuplicate = false;
            for (const existing of allFindings) {
                if (findingsMatch(finding, existing.finding)) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate && !seenSignatures.has(signature)) {
                seenSignatures.add(signature);
                allFindings.push({ finding, source: output.agent, signature });
            }
        }
    }

    return allFindings;
}

/**
 * Count how many agents agree on a specific finding
 */
export function countAgreements(
    finding: Finding,
    agentOutputs: AgentDebateOutput[],
    critiques: CritiqueResult[]
): { agrees: string[]; disagrees: string[]; abstains: string[] } {
    const agrees: string[] = [];
    const disagrees: string[] = [];
    const abstains: string[] = [];

    const allAgents = new Set(agentOutputs.map(o => o.agent));

    for (const agent of allAgents) {
        // Check if this agent found the same issue in their review
        const agentOutput = agentOutputs.find(o => o.agent === agent);
        if (!agentOutput) {
            abstains.push(agent);
            continue;
        }

        // Did this agent independently find the same issue?
        const foundSimilar = agentOutput.review.findings.some(f => findingsMatch(f, finding));
        if (foundSimilar) {
            agrees.push(agent);
            continue;
        }

        // Check critiques - did this agent explicitly vote on this finding?
        const agentCritiques = critiques.filter(c => c.reviewer === agent);
        let votedAgree = false;
        let votedDisagree = false;

        for (const critique of agentCritiques) {
            for (const vote of critique.votes) {
                // Try to match the vote to this finding
                if (
                    vote.findingTitle.toLowerCase().includes(finding.title.toLowerCase().slice(0, 20)) ||
                    finding.title.toLowerCase().includes(vote.findingTitle.toLowerCase().slice(0, 20))
                ) {
                    if (vote.vote === "agree") {
                        votedAgree = true;
                    } else if (vote.vote === "disagree") {
                        votedDisagree = true;
                    }
                }
            }
        }

        if (votedAgree && !votedDisagree) {
            agrees.push(agent);
        } else if (votedDisagree && !votedAgree) {
            disagrees.push(agent);
        } else {
            abstains.push(agent);
        }
    }

    return { agrees, disagrees, abstains };
}

/**
 * Build agreement matrix showing how much each pair of agents agrees
 */
export function buildAgreementMatrix(
    agentOutputs: AgentDebateOutput[],
    _critiques: CritiqueResult[]
): Record<string, Record<string, number>> {
    const agents = agentOutputs.map(o => o.agent);
    const matrix: Record<string, Record<string, number>> = {};

    for (const agentA of agents) {
        matrix[agentA] = {};
        const findingsA = agentOutputs.find(o => o.agent === agentA)?.review.findings || [];

        for (const agentB of agents) {
            if (agentA === agentB) {
                matrix[agentA][agentB] = 100; // Self-agreement is always 100%
                continue;
            }

            const findingsB = agentOutputs.find(o => o.agent === agentB)?.review.findings || [];

            if (findingsA.length === 0 && findingsB.length === 0) {
                matrix[agentA][agentB] = 100; // Both found nothing
                continue;
            }

            // Count how many findings from A are also in B (and vice versa)
            let matchingFindings = 0;
            const totalUniqueFindings = new Set<string>();

            for (const finding of findingsA) {
                totalUniqueFindings.add(createFindingSignature(finding));
                if (findingsB.some(f => findingsMatch(finding, f))) {
                    matchingFindings++;
                }
            }

            for (const finding of findingsB) {
                totalUniqueFindings.add(createFindingSignature(finding));
            }

            // Agreement = matching / total unique
            const agreement = totalUniqueFindings.size > 0
                ? Math.round((matchingFindings * 2 / totalUniqueFindings.size) * 100)
                : 100;

            matrix[agentA][agentB] = Math.min(agreement, 100);
        }
    }

    return matrix;
}

/**
 * Calculate overall confidence score
 *
 * Confidence is based on:
 * 1. What percentage of findings have majority agreement
 * 2. Average pairwise agreement between agents
 */
export function calculateConfidence(
    agentOutputs: AgentDebateOutput[],
    critiques: CritiqueResult[],
    threshold: number = 80
): ConfidenceResult {
    const allFindings = collectAllFindings(agentOutputs);
    const totalAgents = agentOutputs.length;
    const majorityThreshold = Math.ceil(totalAgents / 2);

    let agreedFindings = 0;

    for (const { finding } of allFindings) {
        const { agrees } = countAgreements(finding, agentOutputs, critiques);
        if (agrees.length >= majorityThreshold) {
            agreedFindings++;
        }
    }

    // Calculate agreement-based confidence
    const agreementConfidence = allFindings.length > 0
        ? Math.round((agreedFindings / allFindings.length) * 100)
        : 100;

    // Build agreement matrix
    const agreementMatrix = buildAgreementMatrix(agentOutputs, critiques);

    // Calculate average pairwise agreement
    const agents = Object.keys(agreementMatrix);
    let totalPairwiseAgreement = 0;
    let pairCount = 0;

    for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
            totalPairwiseAgreement += agreementMatrix[agents[i]][agents[j]];
            pairCount++;
        }
    }

    const avgPairwiseAgreement = pairCount > 0
        ? Math.round(totalPairwiseAgreement / pairCount)
        : 100;

    // Final confidence = weighted average of agreement confidence and pairwise agreement
    // Weight agreement confidence higher (60%) vs pairwise (40%)
    const finalConfidence = Math.round(agreementConfidence * 0.6 + avgPairwiseAgreement * 0.4);

    return {
        score: finalConfidence,
        converged: finalConfidence >= threshold,
        agreementMatrix,
        agreedFindings,
        totalFindings: allFindings.length,
    };
}

/**
 * Get findings that have majority agreement
 */
export function getAgreedFindings(
    agentOutputs: AgentDebateOutput[],
    critiques: CritiqueResult[]
): Finding[] {
    const allFindings = collectAllFindings(agentOutputs);
    const totalAgents = agentOutputs.length;
    const majorityThreshold = Math.ceil(totalAgents / 2);
    const agreed: Finding[] = [];

    for (const { finding } of allFindings) {
        const { agrees } = countAgreements(finding, agentOutputs, critiques);
        if (agrees.length >= majorityThreshold) {
            agreed.push(finding);
        }
    }

    // Sort by severity (P0 > P1 > P2)
    const severityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
    agreed.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return agreed;
}

/**
 * Get findings that are disputed (no majority agreement)
 */
export function getDisputedFindings(
    agentOutputs: AgentDebateOutput[],
    critiques: CritiqueResult[]
): { finding: Finding; agrees: string[]; disagrees: string[] }[] {
    const allFindings = collectAllFindings(agentOutputs);
    const totalAgents = agentOutputs.length;
    const majorityThreshold = Math.ceil(totalAgents / 2);
    const disputed: { finding: Finding; agrees: string[]; disagrees: string[] }[] = [];

    for (const { finding } of allFindings) {
        const { agrees, disagrees } = countAgreements(finding, agentOutputs, critiques);
        if (agrees.length < majorityThreshold) {
            disputed.push({ finding, agrees, disagrees });
        }
    }

    return disputed;
}

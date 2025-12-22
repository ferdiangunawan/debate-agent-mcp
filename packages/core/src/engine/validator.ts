/**
 * Validator module for 360 debate
 *
 * Handles:
 * 1. Winner agent composing the final merged result
 * 2. Other agents validating (approve/reject) each finding
 */

import type {
    Finding,
    ValidationVote,
    ValidationResult,
    ComposedResult,
    DebateRound,
} from "../types.js";
import { runAgent } from "../tools/run-agent.js";
import { createFindingSignature } from "./confidence.js";

/**
 * Build prompt for winner to compose final result
 */
function buildCompositionPrompt(
    rounds: DebateRound[],
    diff: string
): string {
    // Collect all findings from all rounds
    const allFindings: { finding: Finding; sources: string[] }[] = [];
    const findingMap = new Map<string, { finding: Finding; sources: string[] }>();

    for (const round of rounds) {
        for (const review of round.reviews) {
            for (const finding of review.review.findings) {
                const sig = createFindingSignature(finding);
                if (findingMap.has(sig)) {
                    findingMap.get(sig)!.sources.push(review.agent);
                } else {
                    findingMap.set(sig, { finding, sources: [review.agent] });
                }
            }
        }
    }

    allFindings.push(...findingMap.values());

    const findingsJson = JSON.stringify(
        allFindings.map(f => ({
            ...f.finding,
            found_by: f.sources,
            id: createFindingSignature(f.finding),
        })),
        null,
        2
    );

    // Collect critiques summary
    const critiquesSummary: string[] = [];
    for (const round of rounds) {
        for (const critique of round.critiques) {
            const summary = `${critique.reviewer} critiqued ${critique.target}: ${critique.votes.length} votes cast`;
            critiquesSummary.push(summary);
        }
    }

    return `You are the WINNER of a multi-agent code review debate. Your task is to compose the final merged result by deciding which findings to INCLUDE and which to ELIMINATE.

## Context
- You won the debate with the highest score
- ${rounds.length} rounds of 360-degree review were conducted
- Final confidence: ${rounds[rounds.length - 1]?.confidence || 0}%

## All Findings From All Agents
${findingsJson}

## Critiques Summary
${critiquesSummary.join("\n")}

## Git Diff (for reference)
\`\`\`diff
${diff.slice(0, 5000)}${diff.length > 5000 ? "\n... (truncated)" : ""}
\`\`\`

## Your Task
Compose the final result by:
1. INCLUDE findings that are valid and agreed upon by majority
2. ELIMINATE findings that are false positives, duplicates, or disputed
3. Provide justification for each elimination

Respond with JSON only:
{
  "proposed_findings": [
    {
      "severity": "P0|P1|P2",
      "title": "Issue title",
      "file": "path:line",
      "detail": "Description",
      "fix": "Suggestion"
    }
  ],
  "eliminated_findings": [
    {
      "id": "finding signature",
      "title": "Issue title",
      "reason": "Why this was eliminated"
    }
  ],
  "residual_risks": ["Any remaining risks"],
  "open_questions": ["Any remaining questions"]
}

Be thorough but fair. Include valid findings even if you didn't find them yourself.`;
}

/**
 * Build prompt for validator to approve/reject findings
 */
function buildValidationPrompt(
    composedFindings: Finding[],
    composer: string,
    diff: string
): string {
    const findingsJson = JSON.stringify(
        composedFindings.map((f, i) => ({
            id: `finding_${i}`,
            ...f,
        })),
        null,
        2
    );

    return `You are validating the final code review composed by ${composer.toUpperCase()}.

For each finding, vote APPROVE if it's valid or REJECT if it's incorrect/false positive.

## Proposed Findings
${findingsJson}

## Git Diff (for reference)
\`\`\`diff
${diff.slice(0, 5000)}${diff.length > 5000 ? "\n... (truncated)" : ""}
\`\`\`

## Your Task
Review each finding and vote. Respond with JSON only:

{
  "votes": [
    {
      "id": "finding_0",
      "vote": "approve|reject",
      "reason": "Brief reason for your vote"
    }
  ]
}

Be objective. Approve valid findings even if you disagree with minor details.
Reject only if the finding is clearly incorrect or a false positive.`;
}

/**
 * Parse composed result from agent output
 */
function parseComposedResult(
    output: string,
    composer: string
): ComposedResult {
    const defaultResult: ComposedResult = {
        composer,
        proposedFindings: [],
        eliminatedFindings: [],
        eliminationReasons: {},
        residualRisks: [],
        openQuestions: [],
        rawOutput: output,
    };

    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return defaultResult;

        const parsed = JSON.parse(jsonMatch[0]);

        const proposedFindings: Finding[] = (parsed.proposed_findings || []).map(
            (f: Record<string, unknown>) => ({
                severity: String(f.severity || "P2").toUpperCase() as "P0" | "P1" | "P2",
                title: String(f.title || ""),
                file: f.file ? String(f.file) : undefined,
                line: f.line ? Number(f.line) : undefined,
                detail: String(f.detail || ""),
                fix: String(f.fix || ""),
            })
        );

        const eliminatedFindings: Finding[] = [];
        const eliminationReasons: Record<string, string> = {};

        for (const e of parsed.eliminated_findings || []) {
            const id = String(e.id || e.title || "");
            eliminationReasons[id] = String(e.reason || "No reason provided");
            eliminatedFindings.push({
                severity: "P2",
                title: String(e.title || id),
                detail: String(e.reason || ""),
                fix: "",
            });
        }

        return {
            composer,
            proposedFindings,
            eliminatedFindings,
            eliminationReasons,
            residualRisks: Array.isArray(parsed.residual_risks)
                ? parsed.residual_risks.map(String)
                : [],
            openQuestions: Array.isArray(parsed.open_questions)
                ? parsed.open_questions.map(String)
                : [],
            rawOutput: output,
        };
    } catch {
        return defaultResult;
    }
}

/**
 * Parse validation votes from agent output
 */
function parseValidationVotes(
    output: string,
    agent: string,
    findings: Finding[]
): ValidationVote[] {
    const votes: ValidationVote[] = [];

    try {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return votes;

        const parsed = JSON.parse(jsonMatch[0]);

        for (const v of parsed.votes || []) {
            const id = String(v.id || "");
            const indexMatch = id.match(/finding_(\d+)/);
            const index = indexMatch ? parseInt(indexMatch[1], 10) : -1;

            if (index >= 0 && index < findings.length) {
                votes.push({
                    findingId: id,
                    finding: findings[index],
                    agent,
                    vote: v.vote === "reject" ? "reject" : "approve",
                    reason: v.reason ? String(v.reason) : undefined,
                });
            }
        }
    } catch {
        // If parsing fails, assume approval for all
        for (let i = 0; i < findings.length; i++) {
            votes.push({
                findingId: `finding_${i}`,
                finding: findings[i],
                agent,
                vote: "approve",
                reason: "Default approval (parsing failed)",
            });
        }
    }

    return votes;
}

/**
 * Run winner agent to compose final result
 */
export async function runWinnerComposition(
    winner: string,
    rounds: DebateRound[],
    diff: string
): Promise<ComposedResult> {
    const prompt = buildCompositionPrompt(rounds, diff);

    const result = await runAgent({
        agent: winner,
        prompt,
    });

    return parseComposedResult(result.output, winner);
}

/**
 * Run validation by other agents
 */
export async function runValidation(
    composedFindings: Finding[],
    validators: string[],
    composer: string,
    diff: string
): Promise<ValidationResult> {
    const allVotes: ValidationVote[] = [];

    // Run validators in parallel
    const validationPromises = validators.map(async (validator) => {
        const prompt = buildValidationPrompt(composedFindings, composer, diff);

        try {
            const result = await runAgent({
                agent: validator,
                prompt,
            });

            return parseValidationVotes(result.output, validator, composedFindings);
        } catch (error) {
            console.error(`[Validator] ${validator} failed:`, error);
            // Default to approval on error
            return composedFindings.map((finding, i) => ({
                findingId: `finding_${i}`,
                finding,
                agent: validator,
                vote: "approve" as const,
                reason: "Default approval (validator error)",
            }));
        }
    });

    const voteResults = await Promise.all(validationPromises);
    for (const votes of voteResults) {
        allVotes.push(...votes);
    }

    // Tally votes for each finding
    const findingVotes = new Map<number, { approves: number; rejects: number }>();

    for (let i = 0; i < composedFindings.length; i++) {
        findingVotes.set(i, { approves: 0, rejects: 0 });
    }

    for (const vote of allVotes) {
        const indexMatch = vote.findingId.match(/finding_(\d+)/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1], 10);
            const tally = findingVotes.get(index);
            if (tally) {
                if (vote.vote === "approve") {
                    tally.approves++;
                } else {
                    tally.rejects++;
                }
            }
        }
    }

    // Categorize findings
    const approvedFindings: Finding[] = [];
    const rejectedFindings: Finding[] = [];
    const tieFindings: Finding[] = [];

    for (let i = 0; i < composedFindings.length; i++) {
        const finding = composedFindings[i];
        const tally = findingVotes.get(i);

        if (!tally || tally.approves >= tally.rejects) {
            // Majority approve or tie (winner breaks tie by default approval)
            if (tally && tally.approves === tally.rejects && tally.approves > 0) {
                tieFindings.push(finding);
            }
            approvedFindings.push(finding);
        } else {
            rejectedFindings.push(finding);
        }
    }

    return {
        votes: allVotes,
        approvedFindings,
        rejectedFindings,
        tieFindings,
    };
}

/**
 * Log progress for validation phase
 */
export function logValidationProgress(
    phase: "composing" | "validating",
    agent: string,
    completed: number,
    total: number
): void {
    if (phase === "composing") {
        console.error(`[360 Debate] Winner ${agent} composing final result...`);
    } else {
        console.error(
            `[360 Debate] Validation: ${agent} (${completed}/${total} validators done)`
        );
    }
}

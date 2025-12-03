/**
 * Enhanced judge scoring system for P0/P1/P2 code review
 *
 * Scoring Rules:
 * - P0 Findings: +15 each (max 45)
 * - P1 Findings: +8 each (max 32)
 * - P2 Findings: +3 each (max 12)
 * - False Positives: -10 each (max penalty -30)
 * - Concrete Fixes: +5 each (max 25)
 * - File Accuracy: +2 each (max 10)
 * - Clarity: 0-10 (formatting quality)
 *
 * Maximum possible score: 134
 * Minimum possible score: -30
 */

import type { ScoreBreakdown, ReviewOutput, Finding } from "../types.js";

const SCORING_WEIGHTS = {
    P0_POINTS: 15,
    P0_MAX: 45,
    P1_POINTS: 8,
    P1_MAX: 32,
    P2_POINTS: 3,
    P2_MAX: 12,
    FALSE_POSITIVE_PENALTY: -10,
    FALSE_POSITIVE_MAX: -30,
    CONCRETE_FIX_POINTS: 5,
    CONCRETE_FIX_MAX: 25,
    FILE_ACCURACY_POINTS: 2,
    FILE_ACCURACY_MAX: 10,
    CLARITY_MAX: 10,
};

/**
 * Score an agent's review output
 */
export function scoreReviewOutput(
    review: ReviewOutput,
    diffFiles: string[]
): ScoreBreakdown {
    const p0Score = calculateSeverityScore(review.findings, "P0", SCORING_WEIGHTS.P0_POINTS, SCORING_WEIGHTS.P0_MAX);
    const p1Score = calculateSeverityScore(review.findings, "P1", SCORING_WEIGHTS.P1_POINTS, SCORING_WEIGHTS.P1_MAX);
    const p2Score = calculateSeverityScore(review.findings, "P2", SCORING_WEIGHTS.P2_POINTS, SCORING_WEIGHTS.P2_MAX);
    const falsePositiveScore = calculateFalsePositiveScore(review.findings, diffFiles);
    const concreteFixScore = calculateConcreteFixScore(review.findings);
    const fileAccuracyScore = calculateFileAccuracyScore(review.findings, diffFiles);
    const clarityScore = calculateClarityScore(review);

    return {
        p0_findings: p0Score,
        p1_findings: p1Score,
        p2_findings: p2Score,
        false_positives: falsePositiveScore,
        concrete_fixes: concreteFixScore,
        file_accuracy: fileAccuracyScore,
        clarity: clarityScore,
        total: p0Score + p1Score + p2Score + falsePositiveScore + concreteFixScore + fileAccuracyScore + clarityScore,
    };
}

/**
 * Calculate score for a specific severity level
 */
function calculateSeverityScore(
    findings: Finding[],
    severity: "P0" | "P1" | "P2",
    points: number,
    max: number
): number {
    const count = findings.filter((f) => f.severity === severity).length;
    return Math.min(count * points, max);
}

/**
 * Calculate false positive penalty
 */
function calculateFalsePositiveScore(findings: Finding[], diffFiles: string[]): number {
    let penalty = 0;

    for (const finding of findings) {
        if (!finding.file) continue;

        const filePath = finding.file.split(":")[0];
        const exists = diffFiles.some((diffFile) => {
            const diffBasename = diffFile.split("/").pop()!;
            const findingBasename = filePath.split("/").pop()!;
            return (
                diffFile === filePath ||
                diffFile.endsWith(filePath) ||
                filePath.endsWith(diffFile) ||
                diffBasename === findingBasename
            );
        });

        if (!exists && !isCommonFileName(filePath)) {
            penalty += SCORING_WEIGHTS.FALSE_POSITIVE_PENALTY;
        }
    }

    return Math.max(penalty, SCORING_WEIGHTS.FALSE_POSITIVE_MAX);
}

/**
 * Check if a filename is a common reference
 */
function isCommonFileName(filename: string): boolean {
    const commonPatterns = [
        "package.json",
        "tsconfig.json",
        "index",
        "main",
        "app",
        "config",
        "README",
        ".gitignore",
        ".env",
        "pubspec.yaml",
        "build.gradle",
        "Podfile",
    ];

    const basename = filename.split("/").pop() || filename;
    return commonPatterns.some((pattern) => basename.includes(pattern));
}

/**
 * Calculate concrete fix score
 */
function calculateConcreteFixScore(findings: Finding[]): number {
    let count = 0;

    for (const finding of findings) {
        if (finding.fix && finding.fix.length > 10) {
            // Has code snippets
            if (finding.fix.includes("`") || finding.fix.includes("```")) {
                count += 2;
            }
            // Has specific method/function references
            else if (/\w+\(/.test(finding.fix) || /\.\w+/.test(finding.fix)) {
                count += 1;
            }
            // Has general fix suggestion
            else {
                count += 0.5;
            }
        }
    }

    return Math.min(Math.floor(count * SCORING_WEIGHTS.CONCRETE_FIX_POINTS), SCORING_WEIGHTS.CONCRETE_FIX_MAX);
}

/**
 * Calculate file accuracy score
 */
function calculateFileAccuracyScore(findings: Finding[], diffFiles: string[]): number {
    let count = 0;

    for (const finding of findings) {
        if (!finding.file) continue;

        const [filePath, lineNum] = finding.file.split(":");
        const exists = diffFiles.some((diffFile) => {
            const diffBasename = diffFile.split("/").pop()!;
            const findingBasename = filePath.split("/").pop()!;
            return (
                diffFile === filePath ||
                diffFile.endsWith(filePath) ||
                filePath.endsWith(diffFile) ||
                diffBasename === findingBasename
            );
        });

        if (exists) {
            count++;
            // Bonus for line number
            if (lineNum && /^\d+$/.test(lineNum)) {
                count += 0.5;
            }
        }
    }

    return Math.min(Math.floor(count * SCORING_WEIGHTS.FILE_ACCURACY_POINTS), SCORING_WEIGHTS.FILE_ACCURACY_MAX);
}

/**
 * Calculate clarity score based on structure
 */
function calculateClarityScore(review: ReviewOutput): number {
    let score = 0;

    // Has findings properly structured
    if (review.findings.length > 0) {
        score += 3;
    }

    // Has residual risks
    if (review.residual_risks.length > 0) {
        score += 2;
    }

    // Has open questions (shows thoughtfulness)
    if (review.open_questions.length > 0) {
        score += 2;
    }

    // Findings have all required fields
    const wellFormedFindings = review.findings.filter(
        (f) => f.severity && f.title && f.detail && f.fix
    );
    if (wellFormedFindings.length === review.findings.length && review.findings.length > 0) {
        score += 3;
    }

    return Math.min(score, SCORING_WEIGHTS.CLARITY_MAX);
}

/**
 * Parse raw agent output into ReviewOutput structure
 */
export function parseReviewOutput(rawOutput: string): ReviewOutput {
    const defaultOutput: ReviewOutput = {
        findings: [],
        residual_risks: [],
        open_questions: [],
        raw_output: rawOutput,
    };

    try {
        // Try to extract JSON from the output
        const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { ...defaultOutput, ...parseLegacyOutput(rawOutput) };
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            findings: Array.isArray(parsed.findings)
                ? parsed.findings.map(normalizeFinding)
                : [],
            residual_risks: Array.isArray(parsed.residual_risks)
                ? parsed.residual_risks
                : [],
            open_questions: Array.isArray(parsed.open_questions)
                ? parsed.open_questions
                : [],
            raw_output: rawOutput,
        };
    } catch {
        return { ...defaultOutput, ...parseLegacyOutput(rawOutput) };
    }
}

/**
 * Normalize a finding object
 */
function normalizeFinding(raw: Record<string, unknown>): Finding {
    return {
        severity: (raw.severity as string)?.toUpperCase() as "P0" | "P1" | "P2" || "P2",
        title: String(raw.title || "Untitled Issue"),
        file: raw.file ? String(raw.file) : undefined,
        line: raw.line ? Number(raw.line) : undefined,
        detail: String(raw.detail || raw.description || ""),
        fix: String(raw.fix || raw.suggestion || ""),
    };
}

/**
 * Parse legacy non-JSON output format
 */
function parseLegacyOutput(output: string): Partial<ReviewOutput> {
    const findings: Finding[] = [];
    const residual_risks: string[] = [];
    const open_questions: string[] = [];

    // Match P0/P1/P2 patterns
    const severityPattern = /\[P([012])\]\s*(.+?)\s*[-—]\s*(.+?)(?:\n|$)/gi;
    let match;

    while ((match = severityPattern.exec(output)) !== null) {
        const severity = `P${match[1]}` as "P0" | "P1" | "P2";
        const title = match[2].trim();
        const fileRef = match[3].trim();

        findings.push({
            severity,
            title,
            file: fileRef,
            detail: "",
            fix: "",
        });
    }

    // Extract residual risks
    const risksMatch = output.match(/residual risks?[:\s]*([\s\S]*?)(?=open questions?|$)/i);
    if (risksMatch) {
        const riskLines = risksMatch[1].match(/^[-*]\s*(.+)$/gm) || [];
        residual_risks.push(...riskLines.map((l) => l.replace(/^[-*]\s*/, "").trim()));
    }

    // Extract open questions
    const questionsMatch = output.match(/open questions?[:\s]*([\s\S]*?)$/i);
    if (questionsMatch) {
        const questionLines = questionsMatch[1].match(/^[-*]\s*(.+)$/gm) || [];
        open_questions.push(...questionLines.map((l) => l.replace(/^[-*]\s*/, "").trim()));
    }

    return { findings, residual_risks, open_questions };
}

/**
 * Generate a human-readable explanation of the scoring
 */
export function generateScoringReason(evaluations: { agent: string; score: ScoreBreakdown }[]): string {
    const reasons: string[] = [];

    // Sort by total score
    const sorted = [...evaluations].sort((a, b) => b.score.total - a.score.total);
    const winner = sorted[0];

    // Compare scores
    for (const { agent, score } of sorted) {
        const parts: string[] = [];
        if (score.p0_findings > 0) parts.push(`${score.p0_findings / 15} P0 findings`);
        if (score.p1_findings > 0) parts.push(`${score.p1_findings / 8} P1 findings`);
        if (score.p2_findings > 0) parts.push(`${score.p2_findings / 3} P2 findings`);
        if (score.false_positives < 0) parts.push(`${Math.abs(score.false_positives / 10)} false positives`);

        reasons.push(`${agent}: ${score.total} points (${parts.join(", ") || "no findings"})`);
    }

    // Winner declaration
    if (sorted.length > 1) {
        const margin = winner.score.total - sorted[1].score.total;
        if (margin === 0) {
            reasons.push("Result: Tie between agents");
        } else {
            reasons.push(`Winner: ${winner.agent} by ${margin} points`);
        }
    }

    return reasons.join(". ");
}

// Legacy export for backward compatibility
export function scoreOutput(output: string, diffFiles: string[]): ScoreBreakdown {
    const review = parseReviewOutput(output);
    return scoreReviewOutput(review, diffFiles);
}

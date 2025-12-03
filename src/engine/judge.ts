/**
 * Deterministic judge scoring system for evaluating agent outputs
 *
 * Scoring Rules:
 * - Clarity: +2 per indicator (numbered lists, headings, bullet points) - max 10
 * - Concrete suggestions: +3 per suggestion (code snippets, line refs, file paths) - max 15
 * - Hallucination: -5 per hallucination (mentions non-existent files) - max penalty -25
 * - Reproducible steps: +4 per step (commands, step markers) - max 20
 *
 * Maximum possible score: 45
 * Minimum possible score: -25
 */

import type { ScoreBreakdown } from "../types.js";

/**
 * Score an agent's output using deterministic rules
 */
export function scoreOutput(output: string, diffFiles: string[]): ScoreBreakdown {
  const clarityScore = calculateClarityScore(output);
  const concreteScore = calculateConcreteScore(output);
  const hallucinationScore = calculateHallucinationScore(output, diffFiles);
  const reproducibleScore = calculateReproducibleScore(output);

  return {
    clarity: clarityScore,
    concrete: concreteScore,
    hallucination: hallucinationScore,
    reproducible: reproducibleScore,
    total: clarityScore + concreteScore + hallucinationScore + reproducibleScore,
  };
}

/**
 * Calculate clarity score based on formatting indicators
 * +2 per indicator, max 10
 */
function calculateClarityScore(output: string): number {
  const patterns = [
    /^\d+\.\s/gm,           // Numbered lists (1. 2. 3.)
    /^#{1,3}\s/gm,          // Markdown headings (# ## ###)
    /^[-*]\s/gm,            // Bullet points (- *)
    /^>\s/gm,               // Blockquotes
    /\*\*[^*]+\*\*/g,       // Bold text
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = output.match(pattern);
    count += matches?.length ?? 0;
  }

  return Math.min(count * 2, 10);
}

/**
 * Calculate concrete suggestions score
 * +3 per concrete reference, max 15
 */
function calculateConcreteScore(output: string): number {
  const patterns = [
    /`[^`]+`/g,                                      // Inline code snippets
    /```[\s\S]*?```/g,                               // Code blocks
    /(?:line|L|ln)\s*\d+/gi,                         // Line references
    /[a-zA-Z_][\w\-\/]*\.(ts|js|tsx|jsx|py|dart|php|go|rs|java|kt|swift)/g,  // File paths
    /:\d+(?::\d+)?/g,                                // Line:column references
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = output.match(pattern);
    count += matches?.length ?? 0;
  }

  return Math.min(count * 3, 15);
}

/**
 * Calculate hallucination penalty
 * -5 per hallucinated file reference, max penalty -25
 */
function calculateHallucinationScore(output: string, diffFiles: string[]): number {
  // Extract file references from output
  const filePattern = /[a-zA-Z_][\w\-\/]*\.(ts|js|tsx|jsx|py|dart|php|go|rs|java|kt|swift)/g;
  const mentionedFiles = output.match(filePattern) ?? [];

  // Deduplicate mentioned files
  const uniqueMentioned = [...new Set(mentionedFiles)];

  let penalty = 0;
  for (const file of uniqueMentioned) {
    const basename = file.split("/").pop()!;

    // Check if the file or its basename exists in the diff files
    const exists = diffFiles.some((diffFile) => {
      const diffBasename = diffFile.split("/").pop()!;
      return (
        diffFile === file ||
        diffFile.endsWith(file) ||
        diffBasename === basename ||
        file.endsWith(diffBasename)
      );
    });

    if (!exists && !isCommonFileName(basename)) {
      penalty -= 5;
    }
  }

  // Cap penalty at -25
  return Math.max(penalty, -25);
}

/**
 * Check if a filename is a common reference that shouldn't be penalized
 */
function isCommonFileName(filename: string): boolean {
  const commonFiles = [
    "package.json",
    "tsconfig.json",
    "index.ts",
    "index.js",
    "main.ts",
    "main.js",
    "app.ts",
    "app.js",
    "config.ts",
    "config.js",
    "README.md",
    ".gitignore",
    ".env",
  ];

  return commonFiles.some((common) =>
    filename === common || filename.endsWith(common)
  );
}

/**
 * Calculate reproducible steps score
 * +4 per step indicator, max 20
 */
function calculateReproducibleScore(output: string): number {
  const patterns = [
    /(?:run|execute|type|enter|install|npm|yarn|pnpm|git)\s*[`"]/gi,  // Command instructions
    /(?:step|first|then|next|finally|lastly)\s*\d*:?/gi,              // Step markers
    /^\s*\$\s/gm,                                                      // Shell prompt indicators
    /(?:follow|following)\s+(?:steps?|instructions?)/gi,               // Instruction references
    /```(?:bash|sh|shell|cmd|powershell)/gi,                          // Shell code blocks
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = output.match(pattern);
    count += matches?.length ?? 0;
  }

  return Math.min(count * 4, 20);
}

/**
 * Generate a human-readable explanation of the scoring
 */
export function generateScoringReason(
  codexScore: ScoreBreakdown,
  claudeScore: ScoreBreakdown
): string {
  const reasons: string[] = [];

  // Compare clarity
  if (codexScore.clarity > claudeScore.clarity) {
    reasons.push(`Codex had better formatting clarity (+${codexScore.clarity} vs +${claudeScore.clarity})`);
  } else if (claudeScore.clarity > codexScore.clarity) {
    reasons.push(`Claude had better formatting clarity (+${claudeScore.clarity} vs +${codexScore.clarity})`);
  }

  // Compare concrete suggestions
  if (codexScore.concrete > claudeScore.concrete) {
    reasons.push(`Codex provided more concrete suggestions (+${codexScore.concrete} vs +${claudeScore.concrete})`);
  } else if (claudeScore.concrete > codexScore.concrete) {
    reasons.push(`Claude provided more concrete suggestions (+${claudeScore.concrete} vs +${codexScore.concrete})`);
  }

  // Check hallucinations
  if (codexScore.hallucination < 0) {
    reasons.push(`Codex had hallucination penalties (${codexScore.hallucination})`);
  }
  if (claudeScore.hallucination < 0) {
    reasons.push(`Claude had hallucination penalties (${claudeScore.hallucination})`);
  }

  // Compare reproducible steps
  if (codexScore.reproducible > claudeScore.reproducible) {
    reasons.push(`Codex included more reproducible steps (+${codexScore.reproducible} vs +${claudeScore.reproducible})`);
  } else if (claudeScore.reproducible > codexScore.reproducible) {
    reasons.push(`Claude included more reproducible steps (+${claudeScore.reproducible} vs +${codexScore.reproducible})`);
  }

  // Final verdict
  const winner = codexScore.total > claudeScore.total ? "Codex" : "Claude";
  const margin = Math.abs(codexScore.total - claudeScore.total);

  if (margin === 0) {
    reasons.push("Both agents scored equally");
  } else {
    reasons.push(`${winner} wins by ${margin} points (${codexScore.total} vs ${claudeScore.total})`);
  }

  return reasons.join(". ");
}

/**
 * Recommendation merger - combines insights from both agents into a final recommendation
 */

import type { AgentType, ScoreBreakdown } from "../types.js";

interface MergerInput {
  codexOutput: string;
  claudeOutput: string;
  codexScore: ScoreBreakdown;
  claudeScore: ScoreBreakdown;
  winner: AgentType;
  diffFiles: string[];
}

/**
 * Generate a merged recommendation from both agent outputs
 * Prioritizes the winner's output but includes unique insights from both
 */
export function generateMergedRecommendation(input: MergerInput): string {
  const { codexOutput, claudeOutput, winner, codexScore, claudeScore, diffFiles } = input;

  // Extract key sections from both outputs
  const codexSections = extractSections(codexOutput);
  const claudeSections = extractSections(claudeOutput);

  // Build merged recommendation
  const sections: string[] = [];

  // Header
  sections.push("# Merged Code Review Recommendation\n");
  sections.push(`*Based on debate between Codex and Claude. Winner: ${winner.toUpperCase()}*\n`);

  // Files changed
  if (diffFiles.length > 0) {
    sections.push("## Files Changed");
    sections.push(diffFiles.map((f) => `- ${f}`).join("\n"));
    sections.push("");
  }

  // Summary - prefer winner's summary
  const winnerSections = winner === "codex" ? codexSections : claudeSections;
  const loserSections = winner === "codex" ? claudeSections : codexSections;

  if (winnerSections.summary || loserSections.summary) {
    sections.push("## Summary");
    sections.push(winnerSections.summary || loserSections.summary || "");
    sections.push("");
  }

  // Issues found - merge unique issues from both
  const allIssues = mergeUniqueItems(
    winnerSections.issues,
    loserSections.issues
  );
  if (allIssues.length > 0) {
    sections.push("## Issues Identified");
    sections.push(allIssues.map((issue) => `- ${issue}`).join("\n"));
    sections.push("");
  }

  // Suggestions - merge unique suggestions
  const allSuggestions = mergeUniqueItems(
    winnerSections.suggestions,
    loserSections.suggestions
  );
  if (allSuggestions.length > 0) {
    sections.push("## Suggestions for Improvement");
    sections.push(allSuggestions.map((s) => `- ${s}`).join("\n"));
    sections.push("");
  }

  // Code snippets - include all unique code snippets
  const allCodeSnippets = mergeCodeSnippets(
    winnerSections.codeSnippets,
    loserSections.codeSnippets
  );
  if (allCodeSnippets.length > 0) {
    sections.push("## Recommended Code Changes");
    sections.push(allCodeSnippets.join("\n\n"));
    sections.push("");
  }

  // Steps to fix - prefer winner's steps, add unique steps from loser
  const allSteps = mergeSteps(winnerSections.steps, loserSections.steps);
  if (allSteps.length > 0) {
    sections.push("## Steps to Address");
    sections.push(allSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    sections.push("");
  }

  // Scoring summary
  sections.push("## Evaluation Summary");
  sections.push(`- **Codex Score**: ${codexScore.total} (clarity: ${codexScore.clarity}, concrete: ${codexScore.concrete}, hallucination: ${codexScore.hallucination}, reproducible: ${codexScore.reproducible})`);
  sections.push(`- **Claude Score**: ${claudeScore.total} (clarity: ${claudeScore.clarity}, concrete: ${claudeScore.concrete}, hallucination: ${claudeScore.hallucination}, reproducible: ${claudeScore.reproducible})`);
  sections.push(`- **Winner**: ${winner.toUpperCase()}`);

  return sections.join("\n");
}

interface ExtractedSections {
  summary: string;
  issues: string[];
  suggestions: string[];
  codeSnippets: string[];
  steps: string[];
}

/**
 * Extract structured sections from agent output
 */
function extractSections(output: string): ExtractedSections {
  const sections: ExtractedSections = {
    summary: "",
    issues: [],
    suggestions: [],
    codeSnippets: [],
    steps: [],
  };

  // Extract summary (first paragraph or section)
  const summaryMatch = output.match(/(?:^|\n)(?:#+\s*)?(?:summary|overview)[:\s]*\n?([\s\S]*?)(?=\n#|\n\n\n|$)/i);
  if (summaryMatch) {
    sections.summary = summaryMatch[1].trim();
  } else {
    // Use first paragraph as summary
    const firstPara = output.split(/\n\n/)[0];
    if (firstPara && firstPara.length < 500) {
      sections.summary = firstPara.trim();
    }
  }

  // Extract bullet points as issues/suggestions
  const bulletPoints = output.match(/^[-*]\s+.+$/gm) ?? [];
  for (const point of bulletPoints) {
    const text = point.replace(/^[-*]\s+/, "").trim();

    // Categorize based on keywords
    if (/(?:issue|bug|problem|error|wrong|incorrect|missing)/i.test(text)) {
      sections.issues.push(text);
    } else if (/(?:suggest|recommend|should|could|consider|improve)/i.test(text)) {
      sections.suggestions.push(text);
    } else {
      sections.suggestions.push(text);
    }
  }

  // Extract numbered items as steps
  const numberedItems = output.match(/^\d+\.\s+.+$/gm) ?? [];
  for (const item of numberedItems) {
    const text = item.replace(/^\d+\.\s+/, "").trim();
    sections.steps.push(text);
  }

  // Extract code snippets
  const codeBlocks = output.match(/```[\s\S]*?```/g) ?? [];
  sections.codeSnippets = codeBlocks;

  return sections;
}

/**
 * Merge unique items from two arrays, avoiding duplicates
 */
function mergeUniqueItems(primary: string[], secondary: string[]): string[] {
  const result = [...primary];
  const normalizedPrimary = new Set(primary.map(normalizeText));

  for (const item of secondary) {
    const normalized = normalizeText(item);
    if (!normalizedPrimary.has(normalized)) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Merge code snippets, avoiding exact duplicates
 */
function mergeCodeSnippets(primary: string[], secondary: string[]): string[] {
  const seen = new Set(primary.map((s) => s.trim()));
  const result = [...primary];

  for (const snippet of secondary) {
    if (!seen.has(snippet.trim())) {
      result.push(snippet);
      seen.add(snippet.trim());
    }
  }

  return result;
}

/**
 * Merge steps, adding unique steps from secondary list
 */
function mergeSteps(primary: string[], secondary: string[]): string[] {
  const result = [...primary];
  const normalizedPrimary = new Set(primary.map(normalizeText));

  for (const step of secondary) {
    const normalized = normalizeText(step);
    // Only add if it's significantly different
    let isDuplicate = false;
    for (const existing of normalizedPrimary) {
      if (stringSimilarity(normalized, existing) > 0.7) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(step);
      normalizedPrimary.add(normalized);
    }
  }

  return result;
}

/**
 * Simple string similarity check (Jaccard similarity on words)
 */
function stringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));

  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

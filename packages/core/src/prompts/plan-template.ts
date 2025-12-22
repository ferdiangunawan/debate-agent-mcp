/**
 * Plan prompt templates for implementation planning mode
 *
 * Unlike review mode (P0/P1/P2 severity), plan mode focuses on:
 * - Implementation steps and phases
 * - File changes needed
 * - Dependencies between steps
 * - Consensus building through 360 review
 */

import type { Platform } from "../types.js";
import { getPlatformRules } from "./platform-rules.js";

export const PLAN_SYSTEM_PROMPT = `You are an implementation planner. Your task is to create a structured, actionable implementation plan.

## Output Format

You MUST respond with valid JSON only. No markdown, no explanation outside JSON.

{
  "steps": [
    {
      "phase": 1,
      "title": "Step title",
      "description": "What needs to be done and why",
      "files": ["path/to/file.ts"],
      "dependencies": []
    }
  ],
  "summary": "Overall approach summary (2-3 sentences)",
  "risks": ["Potential risks or challenges"],
  "open_questions": ["Questions needing clarification"]
}

## Rules
- Order steps by dependency (what must be done first)
- Group related steps into phases (1, 2, 3...)
- Include specific file paths where changes are needed
- Be specific and actionable in descriptions
- List dependencies by step title
- Focus on the diff/changes context provided
- No severity levels (P0/P1/P2) - this is planning, not reviewing`;

export function buildPlanPrompt(
    question: string,
    context: string,
    platform: Platform = "general"
): string {
    const platformRules = getPlatformRules(platform);

    // Check if context is a diff or PRD/requirements
    const hasCodeContext = context.includes("diff --git") || context.includes("@@") || context.includes("+++");

    const contextSection = hasCodeContext
        ? `## Current Code Context (Git Diff)\n\`\`\`diff\n${context}\n\`\`\``
        : `## Requirements / PRD\n${context}`;

    return `${PLAN_SYSTEM_PROMPT}

## Platform Considerations
${platformRules}

## Planning Request
${question}

${contextSection}

Analyze the context and create an implementation plan. Respond with JSON only.`;
}

export function buildPlanCritiquePrompt(
    otherAgentName: string,
    otherAgentPlan: string,
    context: string,
    platform: Platform = "general"
): string {
    const platformRules = getPlatformRules(platform);

    // Check if context is a diff or PRD/requirements
    const hasCodeContext = context.includes("diff --git") || context.includes("@@") || context.includes("+++");

    const contextSection = hasCodeContext
        ? `## Current Code Context (Git Diff)\n\`\`\`diff\n${context}\n\`\`\``
        : `## Requirements / PRD\n${context}`;

    return `You are reviewing another AI agent's implementation plan. Evaluate the plan for clarity, completeness, and feasibility.

## Platform Considerations
${platformRules}

${contextSection}

## ${otherAgentName.toUpperCase()}'s Plan
${otherAgentPlan}

## Your Task
Evaluate each step and provide feedback. Respond with JSON:

{
  "step_reviews": [
    {
      "step_title": "Title from the plan",
      "phase": 1,
      "vote": "agree|disagree|modify",
      "reason": "Why you agree, disagree, or suggest modification",
      "suggestion": "If vote is 'modify', what change do you suggest"
    }
  ],
  "missing_steps": [
    {
      "phase": 1,
      "title": "Missing step title",
      "description": "What should be added",
      "files": ["path/to/file.ts"],
      "dependencies": []
    }
  ],
  "overall_assessment": "Brief assessment of plan quality (clarity, completeness, feasibility)"
}

Respond with JSON only.`;
}

export function buildPlanComposePrompt(
    allPlans: { agent: string; plan: string }[],
    diff: string
): string {
    const plansSection = allPlans
        .map(p => `### ${p.agent.toUpperCase()}'s Plan\n${p.plan}`)
        .join("\n\n");

    return `You are the WINNER of a multi-agent planning debate. Your task is to compose the final merged implementation plan.

## Context
- You won the debate with the highest consensus score
- Multiple agents proposed different implementation approaches
- Your job is to merge the best ideas into a cohesive plan

## All Agent Plans
${plansSection}

## Code Context (Git Diff)
\`\`\`diff
${diff.slice(0, 5000)}${diff.length > 5000 ? "\n... (truncated)" : ""}
\`\`\`

## Your Task
Compose the final merged plan by:
1. INCLUDE steps that have consensus (agreed by multiple agents)
2. MERGE similar steps from different agents
3. ELIMINATE redundant or conflicting steps
4. ORDER steps by proper dependencies
5. Provide justification for eliminations

Respond with JSON only:

{
  "proposed_steps": [
    {
      "phase": 1,
      "title": "Step title",
      "description": "What needs to be done",
      "files": ["path/to/file.ts"],
      "dependencies": [],
      "sources": ["agent1", "agent2"]
    }
  ],
  "eliminated_steps": [
    {
      "title": "Eliminated step title",
      "reason": "Why this step was eliminated"
    }
  ],
  "summary": "Overall approach summary",
  "risks": ["Remaining risks"],
  "open_questions": ["Remaining questions"]
}

Be thorough but fair. Include good ideas even if you didn't propose them.`;
}

export function buildPlanValidationPrompt(
    composedSteps: { phase: number; title: string; description: string; files?: string[] }[],
    composer: string,
    diff: string
): string {
    const stepsJson = JSON.stringify(
        composedSteps.map((s, i) => ({
            id: `step_${i}`,
            ...s,
        })),
        null,
        2
    );

    return `You are validating the final implementation plan composed by ${composer.toUpperCase()}.

For each step, vote APPROVE if it's valid and clear, or REJECT if it's problematic.

## Proposed Steps
${stepsJson}

## Code Context (Git Diff)
\`\`\`diff
${diff.slice(0, 5000)}${diff.length > 5000 ? "\n... (truncated)" : ""}
\`\`\`

## Your Task
Review each step and vote. Respond with JSON only:

{
  "votes": [
    {
      "id": "step_0",
      "vote": "approve|reject",
      "reason": "Brief reason for your vote"
    }
  ]
}

Be objective. Approve valid steps even if you would have done them differently.
Reject only if the step is clearly incorrect, infeasible, or missing critical details.`;
}

/**
 * Git diff tool - reads uncommitted changes from a git repository
 */

import { exec } from "child_process";
import { promisify } from "util";
import type { ReadDiffInput, DiffResult } from "../types.js";
import { getGitConfig } from "../config.js";

const execAsync = promisify(exec);

/**
 * Execute git diff command and return results
 */
export async function readDiff(input: ReadDiffInput): Promise<DiffResult> {
  const config = getGitConfig();
  const workDir = input.path || process.cwd();

  // Determine which diff command to run
  const diffCommand = input.staged ?? config.include_staged
    ? "git diff --cached"
    : "git diff";

  try {
    // Get the diff content
    const { stdout: diffOutput } = await execAsync(diffCommand, {
      cwd: workDir,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Get list of changed files
    const filesCommand = input.staged ?? config.include_staged
      ? "git diff --cached --name-only"
      : "git diff --name-only";

    const { stdout: filesOutput } = await execAsync(filesCommand, {
      cwd: workDir,
    });

    const files = filesOutput
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);

    // Truncate diff if too long
    let diff = diffOutput;
    const lines = diff.split("\n");
    if (lines.length > config.max_diff_lines) {
      diff =
        lines.slice(0, config.max_diff_lines).join("\n") +
        `\n\n... (truncated, ${lines.length - config.max_diff_lines} more lines)`;
    }

    return {
      diff,
      file_count: files.length,
      files,
    };
  } catch (error) {
    // Check if we're in a git repository
    try {
      await execAsync("git rev-parse --is-inside-work-tree", { cwd: workDir });
    } catch {
      throw new Error(`Not a git repository: ${workDir}`);
    }

    // Re-throw original error
    throw error;
  }
}

/**
 * Handle MCP tool call for read_diff
 */
export async function handleReadDiff(args: Record<string, unknown>) {
  const input: ReadDiffInput = {
    staged: args.staged as boolean | undefined,
    path: args.path as string | undefined,
  };

  const result = await readDiff(input);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Formatting utilities for PR changes
 */

import type { PRFile } from "./pr-validators.js";

// Token usage guardrails
const MAX_DIFF_LINES = 500; // Max lines per diff
const MAX_TOTAL_DIFF_SIZE = 500000; // Max total diff size (500KB)

/**
 * Escapes markdown special characters in category names
 */
const escapeMarkdown = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

/**
 * Categorizes a file based on its path
 */
const categorizeFile = (filename: string): string => {
  if (filename.startsWith("app/javascript/react/components/")) {
    return "React Components";
  }
  if (filename.startsWith("app/javascript/react/pages/")) {
    return "React Pages";
  }
  if (filename.startsWith("app/javascript/react/hooks/")) {
    return "React Hooks";
  }
  if (filename.startsWith("app/javascript/")) {
    return "Frontend (JavaScript/TypeScript)";
  }
  if (filename.startsWith("app/controllers/")) {
    return "Rails Controllers (API)";
  }
  if (filename.startsWith("app/models/")) {
    return "Rails Models (Database)";
  }
  if (filename.startsWith("app/services/")) {
    return "Rails Services (Business Logic)";
  }
  if (filename.startsWith("app/views/")) {
    return "Rails Views";
  }
  if (filename.startsWith("spec/")) {
    return "RSpec Tests (Backend)";
  }
  if (filename.startsWith("playwright/")) {
    return "Playwright Tests (E2E)";
  }
  if (filename.startsWith("db/migrate/")) {
    return "Database Migrations";
  }
  const configFilePattern = /\.(md|txt|yml|yaml|json)$/;
  if (configFilePattern.exec(filename)) {
    return "Configuration & Documentation";
  }
  return "Other";
};

/**
 * Truncates a diff if it exceeds maximum lines
 */
const truncateDiff = (patch: string, maxLines: number): string => {
  const lines = patch.split("\n");
  if (lines.length <= maxLines) {
    return patch;
  }

  const truncatedLines = lines.slice(0, maxLines);
  const remainingLines = lines.length - maxLines;
  truncatedLines.push(
    `\n... (truncated ${remainingLines} lines for token efficiency)`,
  );

  return truncatedLines.join("\n");
};

/**
 * Formats a single file's changes with optional diff
 */
const formatFileChange = (
  file: PRFile,
  shouldIncludeDiff: boolean,
  totalDiffSize: number,
): {
  output: string;
  diffSize: number;
  isDiffIncluded: boolean;
  isDiffSkipped: boolean;
} => {
  let output = `#### \`${file.filename}\` (${file.status})\n`;
  output += `- Changes: +${file.additions} -${file.deletions}\n`;

  let diffSize = 0;
  let isDiffIncluded = false;
  let isDiffSkipped = false;

  if (shouldIncludeDiff && file.patch) {
    // Check total diff size to prevent excessive token usage
    if (totalDiffSize + file.patch.length > MAX_TOTAL_DIFF_SIZE) {
      console.warn(
        `⚠️  Skipping diff for ${file.filename} - total diff size limit reached`,
      );
      output += `\n_Diff omitted: total diff size limit reached (${Math.round(MAX_TOTAL_DIFF_SIZE / 1024)}KB)_\n`;
      isDiffSkipped = true;
    } else {
      const truncatedPatch = truncateDiff(file.patch, MAX_DIFF_LINES);
      output += "\n**Diff:**\n```diff\n";
      output += truncatedPatch;
      output += "\n```\n";
      diffSize = truncatedPatch.length;
      isDiffIncluded = true;
    }
  }

  output += "\n";
  return { output, diffSize, isDiffIncluded, isDiffSkipped };
};

/**
 * Groups files by category
 */
const groupFilesByCategory = (files: PRFile[]): Record<string, PRFile[]> => {
  const groupedFiles: Record<string, PRFile[]> = {};

  for (const file of files) {
    if (!file || !file.filename) {
      console.warn("⚠️  Skipping invalid file in formatting");
      continue;
    }

    const category = categorizeFile(file.filename);
    if (!groupedFiles[category]) {
      groupedFiles[category] = [];
    }
    groupedFiles[category].push(file);
  }

  return groupedFiles;
};

/**
 * Formats summary section
 */
const formatSummary = (files: PRFile[]): string => {
  let output = "# Pull Request Changes\n\n";
  output += `## Summary\n`;
  output += `- **Total files changed**: ${files.length}\n`;
  output += `- **Added**: ${files.filter(f => f.status === "added").length}\n`;
  output += `- **Modified**: ${files.filter(f => f.status === "modified").length}\n`;
  output += `- **Deleted**: ${files.filter(f => f.status === "removed").length}\n`;
  output += `- **Renamed**: ${files.filter(f => f.status === "renamed").length}\n\n`;
  output += "## Changed Files\n\n";
  return output;
};

/**
 * Formats PR file changes into markdown
 */
export const formatFileChanges = (
  files: PRFile[],
  shouldIncludeDiff: boolean,
): string => {
  if (!Array.isArray(files)) {
    throw new Error("formatFileChanges: files must be an array");
  }

  let output = formatSummary(files);
  const groupedFiles = groupFilesByCategory(files);

  let totalDiffSize = 0;
  let diffsIncluded = 0;
  let diffsSkipped = 0;

  for (const [category, categoryFiles] of Object.entries(groupedFiles)) {
    const safeCategory = escapeMarkdown(category);
    output += `### ${safeCategory}\n\n`;

    for (const file of categoryFiles) {
      const result = formatFileChange(file, shouldIncludeDiff, totalDiffSize);
      output += result.output;
      totalDiffSize += result.diffSize;
      if (result.isDiffIncluded) diffsIncluded++;
      if (result.isDiffSkipped) diffsSkipped++;
    }
  }

  // Add summary of diff inclusion if diffs were requested
  if (shouldIncludeDiff && diffsSkipped > 0) {
    console.warn(
      `\n📊 Diff Summary: Included ${diffsIncluded}, Skipped ${diffsSkipped} (size limit)`,
    );
  }

  return output;
};

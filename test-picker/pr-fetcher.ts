/**
 * PR Changes Fetcher - Fetches changed files from a GitHub Pull Request
 *
 * This script fetches the list of changed files in a PR using the GitHub API
 * and formats them for analysis by the Claude Agent.
 * Requires BUILDKITE_PULL_REQUEST to be set.
 */

import fs from "fs";
import { validatePRNumber, validateRepo } from "./pr-validators.js";
import { formatFileChanges } from "./pr-formatters.js";
import { fetchPRChangesViaAPI } from "./pr-api.js";

interface PRChangesConfig {
  outputFile: string;
  prNumber?: string;
  repo?: string;
  shouldIncludeDiff?: boolean;
  token?: string;
}

export const fetchPRChanges = async (
  config: PRChangesConfig,
): Promise<void> => {
  const {
    prNumber: prNumberStr,
    token,
    repo,
    outputFile,
    shouldIncludeDiff = false,
  } = config;

  const prNumber = validatePRNumber(prNumberStr || "");

  if (!token || token.trim() === "") {
    throw new Error(
      "❌ GitHub token is required (GITHUB_TOKEN or PR_FILES_TOKEN)",
    );
  }

  if (!repo) {
    throw new Error(
      "❌ Repository is required (REPO_LOCATION or BUILDKITE_REPO)",
    );
  }
  validateRepo(repo);

  const files = await fetchPRChangesViaAPI(
    prNumber.toString(),
    token,
    repo,
    shouldIncludeDiff,
  );

  if (!Array.isArray(files)) {
    throw new Error("❌ Invalid response: files is not an array");
  }

  if (files.length === 0) {
    console.warn("⚠️  Warning: No files found in PR");
  }

  const formattedOutput = formatFileChanges(files, shouldIncludeDiff);

  if (!formattedOutput || formattedOutput.length === 0) {
    throw new Error("❌ Failed to format PR changes output");
  }

  // Guardrails for token usage
  const maxOutputSize = 10485760; // 10MB (reduced from 50MB)
  const warnOutputSize = 5242880; // 5MB warning threshold
  const outputSizeMB = (formattedOutput.length / 1048576).toFixed(2);

  if (formattedOutput.length > maxOutputSize) {
    throw new Error(
      `❌ Output file too large: ${outputSizeMB}MB (max: 10MB)\n` +
        `   This will result in excessive token usage.\n` +
        `   Suggestions:\n` +
        `   - Set INCLUDE_DIFF=false\n` +
        `   - Split PR into smaller PRs\n` +
        `   - Skip test picker and run all tests`,
    );
  }

  if (formattedOutput.length > warnOutputSize) {
    console.warn(
      `⚠️  Large output file: ${outputSizeMB}MB - this may result in high token usage`,
    );
  }

  const outputDir = outputFile.substring(0, outputFile.lastIndexOf("/"));
  if (outputDir && !fs.existsSync(outputDir)) {
    console.warn(`📁 Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    fs.writeFileSync(outputFile, formattedOutput, "utf-8");
    console.warn(`\n✅ PR changes written to: ${outputFile}`);
    console.warn(`📊 Total files analyzed: ${files.length}\n`);
  } catch (error) {
    throw new Error(
      `❌ Failed to write output file: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const isMainModule =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMainModule) {
  const config: PRChangesConfig = {
    prNumber: process.env.BUILDKITE_PULL_REQUEST,
    token: process.env.GITHUB_TOKEN || process.env.PR_FILES_TOKEN,
    repo:
      process.env.REPO_LOCATION ||
      process.env.BUILDKITE_REPO?.replace("git@github.com:", "").replace(
        ".git",
        "",
      ),
    outputFile: process.env.OUTPUT_FILE || "tmp/pr-changes.md",
    shouldIncludeDiff: process.env.INCLUDE_DIFF === "true",
  };

  fetchPRChanges(config)
    .then(() => {
      console.warn("✨ PR changes fetched successfully!");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n💥 Error:", (error as Error).message);
      process.exit(1);
    });
}

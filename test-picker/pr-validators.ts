/**
 * Validation utilities for PR changes fetcher
 */

import type { RestEndpointMethodTypes } from "@octokit/rest";

type GitHubFile =
  RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"][number];

export interface PRFile {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  patch?: string;
  status: "added" | "removed" | "modified" | "renamed";
}

/**
 * Sanitizes filename to prevent markdown injection and ensure safe output
 */
export const sanitizeFilename = (filename: string): string => {
  if (!filename || typeof filename !== "string") {
    return "[invalid-filename]";
  }

  const sanitized = filename.replace(/[^a-zA-Z0-9/_.-]/g, "_");

  if (sanitized.includes("..") || sanitized.startsWith("/")) {
    console.warn(`⚠️  Suspicious filename pattern detected: ${filename}`);
    return sanitized.replace(/\.\./g, "__").replace(/^\/+/, "");
  }

  const maxLength = 500;
  if (sanitized.length > maxLength) {
    console.warn(
      `⚠️  Filename too long (${sanitized.length} chars), truncating: ${filename}`,
    );
    return sanitized.substring(0, maxLength) + "...";
  }

  return sanitized;
};

/**
 * Validates status field from GitHub API
 */
export const validateStatus = (
  status: string | undefined,
): PRFile["status"] => {
  const validStatuses: PRFile["status"][] = [
    "added",
    "removed",
    "modified",
    "renamed",
  ];
  return validStatuses.includes(status as PRFile["status"])
    ? (status as PRFile["status"])
    : "modified";
};

/**
 * Validates and truncates patch data
 */
export const validatePatch = (
  patch: string | undefined,
): string | undefined => {
  if (!patch || typeof patch !== "string") {
    return undefined;
  }

  // Reduced from 100KB to 50KB to control token usage
  const maxPatchSize = 50000; // 50KB per file
  const warnPatchSize = 20000; // Warn at 20KB

  if (patch.length > maxPatchSize) {
    console.warn(
      `⚠️  Patch too large (${Math.round(patch.length / 1024)}KB), truncating to ${Math.round(maxPatchSize / 1024)}KB`,
    );
    return (
      patch.substring(0, maxPatchSize) +
      "\n... (truncated for token efficiency)"
    );
  }

  if (patch.length > warnPatchSize) {
    console.warn(
      `⚠️  Large patch detected (${Math.round(patch.length / 1024)}KB) for file`,
    );
  }

  return patch;
};

/**
 * Validates and sanitizes file data from GitHub API
 */
export const validateFileData = (file: GitHubFile): PRFile | null => {
  if (!file?.filename || typeof file.filename !== "string") {
    console.warn("⚠️  File missing filename, skipping");
    return null;
  }

  const sanitizedFilename = sanitizeFilename(file.filename);

  const additions =
    Number.isInteger(file.additions) && file.additions >= 0
      ? file.additions
      : 0;
  const deletions =
    Number.isInteger(file.deletions) && file.deletions >= 0
      ? file.deletions
      : 0;
  const changes =
    Number.isInteger(file.changes) && file.changes >= 0
      ? file.changes
      : additions + deletions;

  return {
    filename: sanitizedFilename,
    status: validateStatus(file.status),
    additions,
    deletions,
    changes,
    patch: validatePatch(file.patch),
  };
};

/**
 * Validates PR number is a positive integer
 */
export const validatePRNumber = (prNumber: string): number => {
  if (!prNumber || prNumber === "false" || prNumber.trim() === "") {
    throw new Error(
      "❌ BUILDKITE_PULL_REQUEST is required but not provided or is 'false'",
    );
  }

  const prNumberInt = parseInt(prNumber, 10);

  if (isNaN(prNumberInt)) {
    throw new Error(`❌ Invalid PR number: '${prNumber}' is not a number`);
  }

  if (prNumberInt <= 0) {
    throw new Error(
      `❌ Invalid PR number: ${prNumberInt} must be a positive integer`,
    );
  }

  if (prNumber.includes(".") || prNumber.includes("e")) {
    throw new Error(`❌ Invalid PR number: '${prNumber}' must be an integer`);
  }

  if (prNumberInt > 1000000000) {
    throw new Error(
      `❌ Invalid PR number: ${prNumberInt} is unreasonably large`,
    );
  }

  return prNumberInt;
};

/**
 * Validates repository format (owner/repo)
 */
export const validateRepo = (repo: string): void => {
  if (!repo || repo.trim() === "") {
    throw new Error(
      "❌ Repository is required (REPO_LOCATION or BUILDKITE_REPO)",
    );
  }

  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `❌ Invalid repository format: '${repo}' (expected: owner/repo)`,
    );
  }

  const validPattern = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
  if (!validPattern.test(repo)) {
    throw new Error(
      `❌ Invalid repository format: '${repo}' contains invalid characters`,
    );
  }
};

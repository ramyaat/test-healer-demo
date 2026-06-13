/**
 * GitHub API utilities for fetching PR changes
 */

import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { PRFile } from "./pr-validators.js";
import { validateFileData } from "./pr-validators.js";

type GitHubFile =
  RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"][number];

/**
 * Handles rate limit warnings
 */
const handleRateLimitWarning = (
  rateLimitRemaining: string | undefined,
  rateLimitReset: string | undefined,
): void => {
  if (!rateLimitRemaining) {
    return;
  }

  console.warn(
    `📊 GitHub API rate limit: ${rateLimitRemaining} requests remaining`,
  );

  if (parseInt(rateLimitRemaining) < 10) {
    const resetTime = rateLimitReset
      ? new Date(parseInt(rateLimitReset) * 1000).toISOString()
      : "unknown";
    console.warn(`⚠️  Low rate limit! Resets at: ${resetTime}`);
  }
};

/**
 * Validates files returned from GitHub API
 */
const validateAndSanitizeFiles = (
  data: GitHubFile[],
  shouldIncludeDiff: boolean,
): PRFile[] => {
  const validatedFiles: PRFile[] = [];

  for (const file of data) {
    const validatedFile = validateFileData({
      ...file,
      patch: shouldIncludeDiff ? file.patch : undefined,
    });

    if (validatedFile) {
      validatedFiles.push(validatedFile);
    } else {
      console.warn(`⚠️  Skipped invalid file entry`);
    }
  }

  if (validatedFiles.length === 0 && data.length > 0) {
    console.warn("⚠️  Warning: All files were filtered out during validation");
  }

  return validatedFiles;
};

/**
 * Determines if an error is retryable
 */
const isRetryableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const isRateLimit =
    "status" in error && (error.status === 403 || error.status === 429);

  const isNetworkError =
    "code" in error &&
    ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(String(error.code));

  return isRateLimit || isNetworkError;
};

/**
 * Logs retry attempt error
 */
const logRetryError = (
  error: unknown,
  attempt: number,
  maxRetries: number,
): void => {
  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "unknown";

  const isRateLimit =
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error.status === 403 || error.status === 429);

  const isNetworkError =
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(errorCode);

  if (isRateLimit) {
    console.warn(
      `⚠️  Rate limit exceeded or forbidden (attempt ${attempt + 1}/${maxRetries + 1})`,
    );
  } else if (isNetworkError) {
    console.warn(
      `⚠️  Network error: ${errorCode} (attempt ${attempt + 1}/${maxRetries + 1})`,
    );
  } else if (attempt < maxRetries) {
    console.warn(
      `⚠️  Request failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
      error,
    );
  }
};

/**
 * Fetches PR files with exponential backoff retry logic
 */
export const fetchPRChangesViaAPI = async (
  prNumber: string,
  token: string,
  repo: string,
  shouldIncludeDiff: boolean,
): Promise<PRFile[]> => {
  const octokit = new Octokit({ auth: token });
  const [owner, repoName] = repo.split("/");

  console.warn(`📡 Fetching PR #${prNumber} from ${owner}/${repoName}...`);

  const maxRetries = 3;
  const initialDelayMs = 1000;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.warn(`📄 Fetching all files from PR (pagination automatic)...`);

      // Use octokit.paginate to automatically fetch all pages
      const allFiles = await octokit.paginate(octokit.pulls.listFiles, {
        owner,
        repo: repoName,
        pull_number: parseInt(prNumber, 10),
        per_page: 100,
      });

      // Check rate limit after fetching
      const rateLimitInfo = await octokit.rest.rateLimit.get();
      handleRateLimitWarning(
        rateLimitInfo.data.rate.remaining.toString(),
        rateLimitInfo.data.rate.reset.toString(),
      );

      console.warn(`✅ Fetched ${allFiles.length} files from PR`);

      const validatedFiles = validateAndSanitizeFiles(
        allFiles,
        shouldIncludeDiff,
      );

      console.warn(`✅ Validated ${validatedFiles.length} files`);

      return validatedFiles;
    } catch (error: unknown) {
      lastError = error as Error;

      logRetryError(error, attempt, maxRetries);

      if (attempt < maxRetries && isRetryableError(error)) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        console.warn(`⏳ Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error(`❌ All retry attempts exhausted`);
        throw lastError;
      }
    }
  }

  throw lastError || new Error("Unknown error occurred");
};

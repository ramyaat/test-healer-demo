/**
 * Configuration loader for Claude Agent
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MCPServerConfig {
  args?: string[];
  command: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface Config {
  ANTHROPIC_API_KEY: string;
  INPUT: string;
  MAX_ITERATIONS: number;
  MCP_SERVERS: Record<string, MCPServerConfig>;
  OUTPUT_DIR: string;
  OUTPUT_FILE: string;
  prompt: string;
  PROMPT_FILE: string;
  REPORT_TITLE: string;
  WORKSPACE_ROOT: string;
}

function normalizeServerPath(
  pathValue: string,
  workspaceRoot: string,
  serverName: string,
  pathType: string,
): string {
  if (!pathValue.startsWith("/data/circle/current/")) {
    return pathValue;
  }

  const relativePath = pathValue.replace(/^\/data\/circle\/current\//, "");
  const resolved = path.resolve(workspaceRoot, relativePath);

  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error(
      `Invalid ${pathType} path for ${serverName}: must be within workspace`,
    );
  }

  return resolved;
}

function normalizeMCPServer(
  name: string,
  server: MCPServerConfig,
  workspaceRoot: string,
): MCPServerConfig {
  const normalizedServer = { ...server };

  // Normalize command path
  if (server.command) {
    normalizedServer.command = normalizeServerPath(
      server.command,
      workspaceRoot,
      name,
      "command",
    );
  }

  // Normalize args paths
  if (server.args) {
    normalizedServer.args = server.args.map(arg =>
      normalizeServerPath(arg, workspaceRoot, name, "arg"),
    );
  }

  // Normalize cwd path
  if (server.cwd) {
    normalizedServer.cwd = normalizeServerPath(
      server.cwd,
      workspaceRoot,
      name,
      "cwd",
    );
  }

  return normalizedServer;
}

function loadMCPServers(
  mcpConfigPath: string,
  workspaceRoot: string,
): Record<string, MCPServerConfig> {
  if (!fs.existsSync(mcpConfigPath)) {
    return {};
  }

  try {
    const MAX_CONFIG_SIZE = 1024 * 1024; // 1MB
    const stats = fs.statSync(mcpConfigPath);

    if (stats.size > MAX_CONFIG_SIZE) {
      console.warn(
        `Warning: MCP config file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Skipping.`,
      );
      return {};
    }

    const configContent = fs.readFileSync(mcpConfigPath, "utf8");
    const mcpConfig = JSON.parse(configContent) as {
      mcpServers?: Record<string, MCPServerConfig>;
    };

    if (!mcpConfig.mcpServers) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(mcpConfig.mcpServers).map(([name, server]) => [
        name,
        normalizeMCPServer(name, server, workspaceRoot),
      ]),
    );
  } catch (error) {
    console.warn(
      `Warning: Could not read MCP config from ${mcpConfigPath}:`,
      (error as Error).message,
    );
    return {};
  }
}

function loadPromptFile(promptFilePath: string, workspaceRoot: string): string {
  const resolvedPromptFile = path.resolve(promptFilePath);

  if (!resolvedPromptFile.startsWith(workspaceRoot)) {
    console.error(
      `Error: PROMPT_FILE must be within workspace root (${workspaceRoot})`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(resolvedPromptFile)) {
    console.error(`Error: Prompt file not found: ${resolvedPromptFile}`);
    process.exit(1);
  }

  const MAX_PROMPT_SIZE = 1024 * 1024; // 1MB
  const stats = fs.statSync(resolvedPromptFile);

  if (stats.size > MAX_PROMPT_SIZE) {
    console.error(
      `Error: Prompt file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed: ${MAX_PROMPT_SIZE / 1024 / 1024}MB`,
    );
    process.exit(1);
  }

  return fs.readFileSync(resolvedPromptFile, "utf8");
}

function validateOutputPaths(
  outputDir: string,
  outputFile: string,
  workspaceRoot: string,
): { resolvedDir: string; resolvedFile: string } {
  const resolvedDir = path.resolve(outputDir);
  const resolvedFile = path.resolve(outputFile);

  if (!resolvedDir.startsWith(workspaceRoot)) {
    console.error(
      `Error: OUTPUT_DIR must be within workspace root (${workspaceRoot})`,
    );
    process.exit(1);
  }

  if (!resolvedFile.startsWith(workspaceRoot)) {
    console.error(
      `Error: OUTPUT_FILE must be within workspace root (${workspaceRoot})`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  return { resolvedDir, resolvedFile };
}

export function loadConfig(): Config {
  const ANTHROPIC_API_KEY =
    process.env.BUILDKITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required");
    process.exit(1);
  }

  // __dirname is .buildkite/claude_agent/dist after compilation
  // Go up 3 levels to reach workspace root
  const WORKSPACE_ROOT = path.join(__dirname, "..", "..", "..");
  const MCP_CONFIG_PATH =
    process.env.MCP_CONFIG_PATH ||
    path.join(WORKSPACE_ROOT, ".claude", "mcp-config.json");

  console.warn(`📂 Workspace root: ${WORKSPACE_ROOT}`);
  console.warn(`📋 Looking for MCP config: ${MCP_CONFIG_PATH}`);

  const PROMPT_FILE = process.env.PROMPT_FILE;
  if (!PROMPT_FILE) {
    console.error("Error: PROMPT_FILE environment variable is required");
    process.exit(1);
  }

  const INPUT = process.env.INPUT || process.env.TEST_FILE;
  if (!INPUT) {
    console.error("Error: INPUT or TEST_FILE environment variable is required");
    process.exit(1);
  }

  const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(WORKSPACE_ROOT, "log");
  const OUTPUT_FILE =
    process.env.OUTPUT_FILE || path.join(OUTPUT_DIR, "claude-agent-output.md");
  const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS || "30", 10);
  const REPORT_TITLE =
    process.env.REPORT_TITLE || "Claude Agent Execution Report";

  const { resolvedDir, resolvedFile } = validateOutputPaths(
    OUTPUT_DIR,
    OUTPUT_FILE,
    WORKSPACE_ROOT,
  );

  const MCP_SERVERS = loadMCPServers(MCP_CONFIG_PATH, WORKSPACE_ROOT);

  let prompt: string;
  try {
    prompt = loadPromptFile(PROMPT_FILE, WORKSPACE_ROOT);
  } catch (error) {
    console.error(
      `Error reading prompt file from ${PROMPT_FILE}:`,
      (error as Error).message,
    );
    process.exit(1);
  }

  return {
    ANTHROPIC_API_KEY,
    MCP_SERVERS,
    PROMPT_FILE,
    prompt,
    INPUT,
    OUTPUT_DIR: resolvedDir,
    OUTPUT_FILE: resolvedFile,
    MAX_ITERATIONS,
    REPORT_TITLE,
    WORKSPACE_ROOT,
  };
}

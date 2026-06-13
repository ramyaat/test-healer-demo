#!/usr/bin/env node

/**
 * Claude Agent - Automated task execution using Claude Agent SDK
 *
 * A clean, modern implementation leveraging Claude's Agent SDK for
 * intelligent task automation with comprehensive logging.
 *
 * USAGE:
 *   PROMPT_FILE=path/to/prompt.md INPUT=context.txt node .buildkite/claude_agent
 *
 * ENVIRONMENT VARIABLES:
 *   Required:
 *     - ANTHROPIC_API_KEY: Your Anthropic API key
 *     - PROMPT_FILE: Path to the task prompt file
 *     - INPUT: Input context/data for the task
 *
 *   Optional:
 *     - OUTPUT_FILE: Output file path (default: log/claude-agent-output.md)
 *     - OUTPUT_DIR: Output directory (default: log/)
 *     - REPORT_TITLE: HTML report title
 *     - MAX_ITERATIONS: Maximum iterations (default: 20)
 *     - MCP_CONFIG_PATH: Path to MCP config (default: .claude/mcp-config.json)
 *
 * EXAMPLES:
 *   # Playwright test healing
 *   PROMPT_FILE=.agents/skills/test-healer/SKILL.md \
 *   INPUT=tests/posts/create.spec.ts \
 *   node .buildkite/claude_agent
 *
 *   # Custom task with specific output
 *   PROMPT_FILE=my-prompt.md \
 *   INPUT=my-data.json \
 *   OUTPUT_FILE=results/output.md \
 *   node .buildkite/claude_agent
 *
 * OUTPUT:
 *   Generates both markdown and HTML reports with:
 *   - Agent responses and reasoning
 *   - Tool calls and results
 *   - Token usage and cost analysis
 *   - Execution timeline
 */

import { loadConfig } from "./config.js";
import { runAgent } from "./runner.js";

async function main() {
  try {
    const config = loadConfig();
    await runAgent(config);

    const htmlPath = config.OUTPUT_FILE.replace(/\.md$/, ".html");
    console.warn("\n✨ Execution complete!");
    console.warn(`\n📄 Output files:`);
    console.warn(`   Markdown: ${config.OUTPUT_FILE}`);
    console.warn(`   HTML: ${htmlPath}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n💥 Fatal error:", (error as Error).message);
    process.exit(1);
  }
}

void main();

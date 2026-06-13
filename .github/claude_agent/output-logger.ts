/**
 * Output Logger - captures agent iterations and generates reports
 */

import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { generateHtmlReport } from "./html-generator.js";

interface ToolCall {
  input: Record<string, unknown>;
  name: string;
}

interface ToolResult {
  content: string | Record<string, unknown>;
  isError?: boolean;
}

export class OutputLogger {
  private outputPath: string;
  private htmlPath: string;
  private reportTitle: string;
  private startTime: number = Date.now();
  private lastIterationStartTime: number = Date.now();
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private footerWritten = false;

  constructor(
    outputPath: string,
    workspaceRoot: string,
    reportTitle = "Claude Agent Report",
  ) {
    // Validate output path is within workspace
    const resolvedPath = path.resolve(outputPath);
    if (!resolvedPath.startsWith(workspaceRoot)) {
      throw new Error(
        `Output path must be within workspace root (${workspaceRoot})`,
      );
    }

    // Validate HTML path is also within workspace
    const parsedPath = path.parse(resolvedPath);
    const htmlPath = path.join(parsedPath.dir, `${parsedPath.name}.html`);
    if (!htmlPath.startsWith(workspaceRoot)) {
      throw new Error("HTML output path must be within workspace root");
    }

    this.outputPath = resolvedPath;
    this.htmlPath = htmlPath;
    this.reportTitle = reportTitle;

    // Initialize markdown file (truncate if exists)
    fs.writeFileSync(this.outputPath, "", "utf8");
  }

  private async appendToFile(content: string): Promise<void> {
    try {
      await fsPromises.appendFile(this.outputPath, content, "utf8");
    } catch (error) {
      console.error(
        "Error appending to output file:",
        (error as Error).message,
      );
    }
  }

  async writeHeader(
    _systemPrompt: string,
    input: string,
    mcpServers?: Record<string, { command: string; args?: string[] }>,
    promptFilePath?: string,
  ): Promise<void> {
    const chunks: string[] = [];
    chunks.push("## Claude Agent Report\n\n");
    chunks.push("## 🚀 Agent Initialization\n\n");

    if (mcpServers) {
      const serverNames = Object.keys(mcpServers);
      chunks.push(`**MCP Servers:** ${serverNames.length} configured\n\n`);
      if (serverNames.length > 0) {
        for (const name of serverNames) {
          const server = mcpServers[name];
          chunks.push(
            `- \`${name}\`: ${server.command} ${server.args?.join(" ") || ""}\n`,
          );
        }
        chunks.push("\n");
      }
    }

    if (promptFilePath) {
      chunks.push(`**System Prompt File:** \`${promptFilePath}\`\n\n`);
    } else {
      chunks.push(`**System Prompt:** Configured\n\n`);
    }
    chunks.push(`**Input:** ${input}\n\n`);
    chunks.push("---\n\n");
    await this.appendToFile(chunks.join(""));
  }

  async logIteration(iteration: number, message: string): Promise<void> {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();

    const chunks: string[] = [];
    chunks.push(`\n## [Iteration ${iteration}]\n\n`);
    chunks.push(`⏱️ **Timestamp:** ${timestamp}\n\n`);

    if (message.trim()) {
      chunks.push(message);
      chunks.push("\n\n");
    }

    await this.appendToFile(chunks.join(""));

    // Update last iteration start time
    this.lastIterationStartTime = now;
  }

  async logToolCall(toolCall: ToolCall): Promise<void> {
    const chunks: string[] = [];
    chunks.push(`🔧 **Tool Used:** \`${toolCall.name}\`\n\n`);
    chunks.push("**Parameters:**\n\n");
    chunks.push("```json\n");
    chunks.push(JSON.stringify(toolCall.input, null, 2));
    chunks.push("\n```\n\n");
    await this.appendToFile(chunks.join(""));
  }

  async logToolResult(result: ToolResult): Promise<void> {
    const chunks: string[] = [];

    if (result.isError) {
      const errorContent =
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content);
      // Truncate error messages to prevent memory issues
      const MAX_ERROR_LENGTH = 5000;
      const truncatedError =
        errorContent.length > MAX_ERROR_LENGTH
          ? errorContent.substring(0, MAX_ERROR_LENGTH) + "... (truncated)"
          : errorContent;
      chunks.push(`**Response (Error):**\n\n❌ \`${truncatedError}\`\n\n`);
    } else {
      chunks.push("**Response:**\n\n");
      let resultStr =
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content, null, 2);

      // Truncate large results to prevent memory issues
      const MAX_RESULT_LENGTH = 5000;
      if (resultStr.length > MAX_RESULT_LENGTH) {
        resultStr =
          resultStr.substring(0, MAX_RESULT_LENGTH) + "\n\n... (truncated)";
      }

      const codeBlockType =
        typeof result.content === "string" &&
        !result.content.includes("\n") &&
        !result.content.startsWith("{") &&
        !result.content.startsWith("[")
          ? "text"
          : "markdown";

      chunks.push("```" + codeBlockType + "\n");
      chunks.push(resultStr);
      chunks.push("\n```\n\n");
    }

    await this.appendToFile(chunks.join(""));
  }

  async logTokenUsage(
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;

    const now = Date.now();
    const durationMs = now - this.lastIterationStartTime;
    const durationSec = (durationMs / 1000).toFixed(2);

    await this.appendToFile(
      `**Token Usage:** ${inputTokens} input, ${outputTokens} output\n` +
        `**Duration:** ${durationSec}s\n\n` +
        `---\n\n`,
    );
  }

  setTotalCost(costUsd: number): void {
    this.totalCostUsd = costUsd;
  }

  async writeFooter(): Promise<void> {
    if (this.footerWritten) {
      return;
    }
    this.footerWritten = true;

    // Log total execution time
    const totalDurationMs = Date.now() - this.startTime;
    const totalDurationSec = (totalDurationMs / 1000).toFixed(2);
    const totalDurationMin = (totalDurationMs / 60000).toFixed(2);

    const chunks: string[] = [];
    chunks.push(`\n---\n\n`);
    chunks.push(`## ⏱️ Execution Summary\n\n`);
    chunks.push(
      `- **Total Duration:** ${totalDurationMin} minutes (${totalDurationSec}s)\n`,
    );
    chunks.push(
      `- **Total Input Tokens:** ${this.totalInputTokens.toLocaleString()}\n`,
    );
    chunks.push(
      `- **Total Output Tokens:** ${this.totalOutputTokens.toLocaleString()}\n`,
    );
    chunks.push(`- **Completed at:** ${new Date().toISOString()}\n\n`);

    await this.appendToFile(chunks.join(""));
    await this.generateHtmlReport();
  }

  private async generateHtmlReport(): Promise<void> {
    try {
      // Read the markdown file to generate HTML
      const markdown = await fsPromises.readFile(this.outputPath, "utf8");

      const html = generateHtmlReport(
        markdown,
        this.reportTitle,
        this.startTime,
        this.totalInputTokens,
        this.totalOutputTokens,
        this.totalCostUsd,
      );
      await fsPromises.writeFile(this.htmlPath, html, "utf8");
    } catch (error) {
      console.error("Error generating HTML report:", (error as Error).message);
    }
  }

  getTotalTokens(): { input: number; output: number } {
    return {
      input: this.totalInputTokens,
      output: this.totalOutputTokens,
    };
  }
}

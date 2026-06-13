/**
 * Claude Agent Runner - orchestrates agent execution with logging
 * Using Claude Agent SDK
 */

import type { Config } from "./config.js";
import { OutputLogger } from "./output-logger.js";

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface AssistantMessage {
  message: {
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; name: string; input: Record<string, unknown> }
    >;
    usage?: TokenUsage;
  };
  type: "assistant";
}

interface ResultMessage {
  duration_ms: number;
  is_error?: boolean;
  num_turns: number;
  result?: string | Record<string, unknown>;
  subtype: string;
  total_cost_usd: number;
  type: "result";
  usage?: TokenUsage;
}

interface StreamEventMessage {
  type: "stream_event";
}

interface AuthStatusMessage {
  type: "auth_status";
}

type AgentMessage =
  | AssistantMessage
  | ResultMessage
  | StreamEventMessage
  | AuthStatusMessage;

// Type guards for proper type narrowing
function isAssistantMessage(
  message: AgentMessage,
): message is AssistantMessage {
  return message.type === "assistant";
}

function isResultMessage(message: AgentMessage): message is ResultMessage {
  return message.type === "result";
}

async function handleAssistantMessage(
  message: AssistantMessage,
  iteration: number,
  outputLogger: OutputLogger,
): Promise<void> {
  console.warn(`\n[Turn ${iteration}]`);

  for (const block of message.message.content) {
    if (block.type === "text") {
      console.warn(block.text);
      await outputLogger.logIteration(iteration, block.text);
    } else if (block.type === "tool_use") {
      console.warn(`🔧 ${block.name}`);
      await outputLogger.logToolCall({
        name: block.name,
        input: block.input,
      });
    }
  }

  if (message.message.usage) {
    await outputLogger.logTokenUsage(
      message.message.usage.input_tokens || 0,
      message.message.usage.output_tokens || 0,
    );
  }
}

async function handleResultMessage(
  message: ResultMessage,
  outputLogger: OutputLogger,
): Promise<void> {
  console.warn(
    `\n✓ Complete: ${message.num_turns} turns, ${(message.duration_ms / 1000).toFixed(1)}s, $${message.total_cost_usd.toFixed(4)}`,
  );

  // Store the SDK's authoritative cost
  outputLogger.setTotalCost(message.total_cost_usd);

  if (message.subtype === "success" && message.result) {
    await outputLogger.logToolResult({
      content: message.result,
      isError: message.is_error || false,
    });
  }

  if (message.usage) {
    await outputLogger.logTokenUsage(
      message.usage.input_tokens || 0,
      message.usage.output_tokens || 0,
    );
  }
}

async function processAgentMessages(
  agentQuery: AsyncIterable<AgentMessage>,
  outputLogger: OutputLogger,
): Promise<void> {
  let iteration = 0;

  for await (const message of agentQuery) {
    if (isAssistantMessage(message)) {
      iteration++;
      await handleAssistantMessage(message, iteration, outputLogger);
    } else if (isResultMessage(message)) {
      await handleResultMessage(message, outputLogger);
    }
  }
}

export async function runAgent(config: Config): Promise<void> {
  console.warn("\n🤖 Starting Claude Agent");
  console.warn(`📝 Prompt: ${config.PROMPT_FILE}`);
  console.warn(`📥 Input: ${config.INPUT}`);
  console.warn(`📤 Output: ${config.OUTPUT_FILE}`);
  console.warn(`🔄 Max Iterations: ${config.MAX_ITERATIONS}\n`);

  const outputLogger = new OutputLogger(
    config.OUTPUT_FILE,
    config.WORKSPACE_ROOT,
    config.REPORT_TITLE,
  );

  const systemPrompt = `${config.prompt}

**Input Context**: ${config.INPUT}`;

  await outputLogger.writeHeader(
    config.prompt,
    config.INPUT,
    config.MCP_SERVERS,
    config.PROMPT_FILE,
  );

  try {
    const { query } = await import(
      /* webpackChunkName: "claude_agent_sdk" */ "@anthropic-ai/claude-agent-sdk"
    );

    process.env.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
    process.env.BUILDKITE_ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    if (!process.env.PATH?.includes("/usr/local/bin")) {
      process.env.PATH = `/usr/local/bin:${process.env.PATH || ""}`;
    }

    if (process.getuid?.() === 0) {
      throw new Error("Cannot run as root user");
    }

    const pathToClaudeCode = process.env.CLAUDE_CODE_PATH || undefined;

    let agentQuery;
    try {
      agentQuery = query({
        prompt: systemPrompt,
        options: {
          cwd: config.WORKSPACE_ROOT,
          mcpServers: config.MCP_SERVERS,
          model: "claude-sonnet-4-20250514",
          maxTurns: config.MAX_ITERATIONS,
          permissionMode: "bypassPermissions",
          disallowedTools: ["Bash", "BashOutput", "KillBash"],
          pathToClaudeCodeExecutable: pathToClaudeCode,
          stderr: (data: string) => {
            if (data.trim()) {
              console.warn(`[stderr]: ${data.trim()}`);
            }
          },
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: "\n\n" + systemPrompt,
          },
        },
      });
    } catch (error) {
      throw new Error(`SDK initialization failed: ${(error as Error).message}`);
    }

    console.warn("\nStarting conversation...");

    try {
      await processAgentMessages(
        agentQuery as AsyncIterable<AgentMessage>,
        outputLogger,
      );
    } finally {
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }

    await outputLogger.writeFooter();
  } catch (error) {
    await outputLogger.writeFooter();
    throw error;
  }
}

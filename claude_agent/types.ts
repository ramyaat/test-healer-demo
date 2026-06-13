/**
 * Type definitions for Claude Agent SDK
 * These provide better IDE support and type checking
 */

export interface SessionConfig {
  apiKey: string;
  mcpServers?: Record<string, MCPServerConfig>;
  permissionMode?: "auto" | "manual" | "allow_all";
  systemPrompt?: string[];
  workingDirectory: string;
}

export interface MCPServerConfig {
  args?: string[];
  command: string;
  env?: Record<string, string>;
}

export interface SessionResponse {
  content: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
}

export interface ContentBlock {
  input?: Record<string, unknown>;
  name?: string;
  text?: string;
  type: "text" | "tool_use";
}

export interface SessionEvents {
  error: (event: { error?: { message?: string } }) => void;
  "response:content": (event: { type: string; text?: string }) => void;
  "response:start": () => void;
  "response:tool_use": (event: {
    name: string;
    input: Record<string, unknown>;
  }) => void;
  "response:usage": (event: {
    usage?: { input_tokens?: number; output_tokens?: number };
  }) => void;
  "tool:result": (event: { result: unknown; isError?: boolean }) => void;
}

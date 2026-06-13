# Claude Agent

Automated task execution using the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) with comprehensive logging and reporting.

## Quick Start

```bash
# Set required env vars and run (auto-builds if needed)
export ANTHROPIC_API_KEY="sk-ant-..."
export PROMPT_FILE="path/to/prompt.md"
export INPUT="path/to/input.txt"

.buildkite/claude_agent/run.sh
```

## Usage

**⚠️ Important:** Always run from workspace root.

```bash
PROMPT_FILE=path/to/prompt.md \
INPUT=path/to/input.txt \
node .buildkite/claude_agent/dist/index.js
```

### Environment Variables

**Required:**

- `ANTHROPIC_API_KEY` - Your Anthropic API key (or `BUILDKITE_ANTHROPIC_API_KEY`)
- `PROMPT_FILE` - Path to task prompt markdown file
- `INPUT` - Input context/data file path

**Optional:**

- `OUTPUT_FILE` - Output path (default: `log/claude-agent-output.md`)
- `OUTPUT_DIR` - Output directory (default: `log/`)
- `REPORT_TITLE` - HTML report title (default: "Claude Agent Execution Report")
- `MAX_ITERATIONS` - Max iterations (default: 20)
- `MCP_CONFIG_PATH` - MCP config path (default: `.claude/mcp-config.json`)

### Example: Playwright Test Healing

```bash
PROMPT_FILE=.agents/skills/test-healer/SKILL.md \
INPUT=playwright/tests/community/posts.spec.ts \
node .buildkite/claude_agent/dist/index.js
```

## MCP Configuration

Configure MCP servers in `.claude/mcp-config.json`:

```json
{
  "mcpServers": {
    "playwright-test": {
      "command": "npx",
      "args": ["-y", "playwright", "run-test-mcp-server"],
      "env": { "NODE_ENV": "production" }
    }
  }
}
```

## Output

Generates two files:

- **Markdown** (`*.md`) - Complete execution log
- **HTML** (`*.html`) - Styled report with:
  - Collapsible iterations
  - Syntax highlighting
  - Token usage & cost analysis
  - Execution timeline

## Architecture

```
claude_agent/
├── index.ts          # CLI entry point
├── runner.ts         # Agent orchestration
├── config.ts         # Configuration
├── output-logger.ts  # Logging
├── html-generator.ts # HTML reports
└── types.ts          # TypeScript types
```

## Key Features

- ✅ Official Claude Agent SDK integration
- ✅ Event-driven architecture
- ✅ Built-in MCP server support
- ✅ Real-time logging with markdown/HTML output
- ✅ Token usage tracking & cost calculation
- ✅ Clean, modern TypeScript codebase

## Buildkite Integration

```yaml
- label: "🤖 Claude Agent"
  command: |
    cd .buildkite/claude_agent
    npm install && npm run build
    cd ../..

    PROMPT_FILE=prompts/task.md \
    INPUT=data/context.txt \
    OUTPUT_FILE=buildkite-artifacts/report.md \
    node .buildkite/claude_agent/dist/index.js

  artifact_paths:
    - "buildkite-artifacts/report.*"
```

## Troubleshooting

**Module not found:**

```bash
cd .buildkite/claude_agent
rm -rf node_modules package-lock.json
npm install && npm run build
```

**Missing API key:**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Build errors:**

```bash
npm install -D typescript
npm run build
```

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Type check
npx tsc --noEmit
```

---

**Location:** `.buildkite/claude_agent/`  
**Created:** November 27, 2025

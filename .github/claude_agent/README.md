# Claude Agent

A TypeScript runner that drives [Claude Code](https://claude.ai/code) as an autonomous agent via the [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). It reads a prompt file and an input context, runs Claude iteratively until the task is done, and produces a Markdown + HTML execution report.

Used in this repo to power the [Playwright Test Healer](./../scripts/run-playwright-test-healer.sh).

## How it works

```
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions                             │
│                                                                 │
│  PR comment: /fix-playwright-test tests/posts/create.spec.ts   │
│         │                                                       │
│         ▼                                                       │
│  playwright-healer-trigger.yml                                  │
│  ├─ Verify commenter has write access                           │
│  ├─ Parse test file path from comment                           │
│  ├─ Get PR branch name                                          │
│  └─ Dispatch → playwright-healer.yml                           │
│                    │                                            │
│                    ▼                                            │
│  playwright-healer.yml                                          │
│  ├─ Checkout repo on PR branch                                  │
│  ├─ Set up Ruby + Node + Playwright                             │
│  ├─ Start Rails test server                                     │
│  └─ run-playwright-test-healer.sh                              │
│              │                                                  │
│              ▼                                                  │
│      .github/claude_agent (this package)                        │
│      ├─ Load config from env vars                               │
│      ├─ Read SKILL.md prompt file                               │
│      ├─ Run Claude agent loop (up to MAX_ITERATIONS turns)      │
│      │   ├─ Claude reads the failing test                       │
│      │   ├─ Claude runs Playwright to inspect live UI           │
│      │   ├─ Claude edits the test file                          │
│      │   └─ Claude runs the test — repeats until 2× green       │
│      ├─ Write log/claude-agent-output.md                        │
│      └─ Write log/claude-agent-output.html                      │
│              │                                                  │
│              ▼                                                  │
│      Git commit + push fixed test to PR branch                  │
└─────────────────────────────────────────────────────────────────┘
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `PROMPT_FILE` | Yes | — | Path to the skill prompt (e.g. `.agents/skills/test-healer/SKILL.md`) |
| `INPUT` | Yes | — | Task input passed to Claude as context (e.g. a test file path) |
| `MAX_ITERATIONS` | No | `30` | Maximum agent turns before stopping |
| `OUTPUT_DIR` | No | `log/` | Directory for output files |
| `OUTPUT_FILE` | No | `log/claude-agent-output.md` | Markdown report path |
| `REPORT_TITLE` | No | `Claude Agent Execution Report` | Title shown in the HTML report |
| `MCP_CONFIG_PATH` | No | `.claude/mcp-config.json` | Path to MCP server config |

## Source files

| File | Role |
|---|---|
| `index.ts` | Entry point — loads config and calls `runAgent` |
| `config.ts` | Reads and validates all env vars; loads the prompt file and MCP server config |
| `runner.ts` | Calls the Claude Agent SDK `query()`, streams messages, and delegates to the logger |
| `output-logger.ts` | Writes each agent turn, tool call, token usage, and summary to the Markdown report |
| `html-generator.ts` | Converts the Markdown report into a self-contained HTML file |
| `types.ts` | Shared TypeScript interfaces |

## MCP servers

If `.claude/mcp-config.json` exists at the repo root, the agent loads the MCP servers defined there and passes them to Claude. This is how `@playwright/cli` is wired in — Claude uses it to take screenshots and inspect the live UI while healing tests.

Example `.claude/mcp-config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/cli", "mcp"]
    }
  }
}
```

## Output

Each run produces two files in `log/`:

- **`claude-agent-output-<test-name>.md`** — plain Markdown with every agent turn, tool call, token count, and final summary
- **`claude-agent-output-<test-name>.html`** — a self-contained HTML version of the same report, uploaded as a GitHub Actions artifact

## Development

```bash
cd .github/claude_agent
npm install
npm run build       # compiles TypeScript → dist/
npm start           # runs dist/index.js (requires env vars to be set)
```

TypeScript is compiled to `dist/` (git-ignored). The shell script always runs `npm run build` before invoking `node dist/index.js`, so the build is always fresh in CI.

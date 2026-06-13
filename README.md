# Demo Rails Blog — Playwright Test Healer Demo

A minimal Rails blog app used to demonstrate the **Playwright Test Healer** — an AI agent that automatically detects and fixes broken Playwright tests.

## What's in here

| Directory | Purpose |
|-----------|---------|
| `app/` | Rails MVC — Posts resource (title, body, published) |
| `playwright/` | Playwright test suite |
| `.buildkite/run-playwright-test-healer.sh` | The healer script that runs the Claude agent |

## Quick start

```bash
# Install Ruby dependencies
bundle install

# Set up database and seed data
rails db:setup

# Start the Rails server
rails server

# In another terminal — run the tests
cd playwright
npm install
npx playwright test
```

## Running the Test Healer

The healer script (`run-playwright-test-healer.sh`) wraps a Claude Code agent that:

1. Runs the failing test
2. Inspects the live UI with `playwright-cli`
3. Makes a minimal, targeted fix to the test
4. Verifies stability with 2 consecutive passes

```bash
# Heal a single test file
TEST_FILE=tests/posts/list.spec.ts \
ANTHROPIC_API_KEY=your-key \
.buildkite/run-playwright-test-healer.sh

# Heal multiple files
TEST_FILE=tests/posts/list.spec.ts,tests/posts/create.spec.ts \
ANTHROPIC_API_KEY=your-key \
.buildkite/run-playwright-test-healer.sh
```

> **Note:** The healer script is designed for CI (it uses `overmind`, a non-root user, and Buildkite hooks). For local demos, run the Rails server manually and invoke the Claude agent directly — see `playwright/README.md` for the local workflow.

## Tech stack

- Ruby on Rails 8.1 (SQLite, Importmap, Turbo)
- Playwright 1.50+ (TypeScript)
- Claude Code CLI / Anthropic API (the healer agent)

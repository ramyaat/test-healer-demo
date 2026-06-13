# Demo Rails Blog — Playwright Test Healer Demo

A minimal Rails blog app used to demonstrate the **Playwright Test Healer** — an AI agent that automatically detects and fixes broken Playwright tests, both locally and in CI.

## What's in here

| Path | Purpose |
|------|---------|
| `app/` | Rails MVC — Posts resource (title, body, published) |
| `playwright/` | Playwright test suite |
| `claude_agent/` | Claude Agent SDK — runs the AI healer |
| `.agents/skills/test-healer/` | The healer skill prompt (`SKILL.md`) |
| `.github/scripts/run-playwright-test-healer.sh` | Healer entrypoint script |
| `.github/workflows/playwright-healer.yml` | GitHub Actions workflow (manual trigger) |
| `.github/workflows/playwright-healer-trigger.yml` | PR comment trigger (`/fix-playwright-test`) |

## How it works

The healer is a Claude AI agent that follows a fixed workflow to diagnose and fix a failing test with no human intervention.

```
  Failing test file
        │
        ▼
┌───────────────────┐
│  Run test         │  npx playwright test <file>
│  Capture error    │  selector / assertion / timing / backend?
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Inspect live UI  │  playwright-cli snapshot, screenshot,
│  Collect evidence │  console errors, network calls, server logs
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Classify &       │  Identify root cause
│  fix              │  Edit only the broken selector / assertion
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│  Verify: 2×pass   │  Run test twice consecutively
│                   │  Back to inspect if either fails (max 5 attempts)
└────────┬──────────┘
         │
         ▼
    Fixed test ✅
    (auto-committed in CI)
```

**What the healer fixes:**
- Wrong selectors (`data-testid`, role, text)
- Wrong assertion values
- Missing interaction steps (e.g. a required field not filled)

**What the healer does NOT fix:**
- Backend bugs (5xx errors) — it stops and reports these
- Flaky tests that pass on retry — it flags and skips these

---

## Quick start (local)

```bash
# Install Ruby dependencies
bundle install

# Set up database
rails db:setup

# Start the Rails server
rails server
```

```bash
# In another terminal — install and run Playwright tests
cd playwright
npm install
npx playwright install chromium
npx playwright test
```

### Run the healer locally

With the Rails server running, invoke the healer skill from the repo root:

```bash
# Heal a single test file
/test-healer playwright/tests/posts/list.spec.ts

# Heal a specific test by line number
/test-healer playwright/tests/posts/create.spec.ts:14
```

The healer uses `playwright-cli` to open the live app, inspect the DOM, and make a targeted fix before verifying with 2 consecutive passes.

---

## CI usage (GitHub Actions)

### Option 1 — Manual trigger

Go to **Actions → Playwright Test Healer → Run workflow** and enter the test file path:

```
tests/posts/create.spec.ts
```

Or trigger via the GitHub CLI:

```bash
gh workflow run playwright-healer.yml \
  -f test_file=tests/posts/create.spec.ts
```

Multiple files (comma-separated):

```bash
gh workflow run playwright-healer.yml \
  -f test_file=tests/posts/list.spec.ts,tests/posts/create.spec.ts
```

### Option 2 — PR comment trigger

On any pull request, comment:

```
/fix-playwright-test tests/posts/show.spec.ts
```

The `playwright-healer-trigger.yml` workflow:
1. Checks the commenter has write access
2. Parses the test file path from the comment
3. Dispatches `playwright-healer.yml` on the PR branch
4. Posts a status comment linking to the run

### What happens in CI

```
PR comment: /fix-playwright-test <file>
        │
        ▼
playwright-healer-trigger.yml
  • Verify write permissions
  • Parse test file path
  • Dispatch playwright-healer.yml on PR branch
  • Post "healer triggered" comment
        │
        ▼
playwright-healer.yml
  • Checkout + setup Ruby + Node
  • Run run-playwright-test-healer.sh
        │
        ▼
run-playwright-test-healer.sh
  • Validate TEST_FILE exists
  • Build Claude Agent (claude_agent/)
  • For each test file:
      - Run Claude agent with test-healer skill
      - Track modified files
  • If GITHUB_TOKEN set:
      - git add <modified files>
      - git commit "fix: auto-heal failing Playwright tests"
      - git push to PR branch
  • Upload HTML report artifact
```

The fix is pushed as a commit directly to the PR branch. No manual steps required.

---

## Required secrets

| Secret | Description |
|--------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for the Claude agent |
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions — used to push the fix commit |

---

## Tech stack

- Ruby on Rails 8.1 (SQLite, Importmap, Turbo)
- Playwright 1.50+ (TypeScript)
- Claude Agent SDK + Anthropic API
- GitHub Actions

# Playwright Tests

End-to-end tests for the demo Rails blog. These tests are **intentionally broken** to demonstrate the Playwright Test Healer.

## Setup

```bash
npm install
npx playwright install chromium
```

## Running tests

```bash
# Run all tests (expect 3 failures)
npx playwright test

# Run a specific file
npx playwright test tests/posts/list.spec.ts

# Run headed (watch the browser)
npx playwright test --headed

# Open Playwright UI
npx playwright test --ui
```

The Rails server must be running on `http://localhost:3000` before running tests.

## Test files

| File | Tests | Known failing test |
|------|-------|--------------------|
| `tests/posts/list.spec.ts` | Posts index page | "shows the posts list container" — wrong testid |
| `tests/posts/create.spec.ts` | Creating a new post | "creates a post successfully" — wrong button name |
| `tests/posts/show.spec.ts` | Viewing a single post | "displays published status correctly" — wrong expected text |

## Fixing tests with the healer

The Playwright Test Healer (in `.buildkite/run-playwright-test-healer.sh`) uses a Claude Code agent to inspect the live UI and fix broken selectors/assertions automatically.

For local development, you can manually trigger the agent skill:

```
/test-healer playwright/tests/posts/list.spec.ts
```

Or fix the bugs yourself — each bug has a comment explaining what's wrong.

## Configuration

`playwright.config.ts` configures:

- `baseURL`: `http://localhost:3000`
- Single worker (sequential) to avoid DB conflicts
- Chromium project only
- Line reporter for concise output

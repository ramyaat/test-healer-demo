# Playwright Tests

End-to-end tests for the demo Rails blog.

## Setup

```bash
npm install
npx playwright install chromium
```

## Running tests

```bash
# Run all tests
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

| File | Tests |
|------|-------|
| `tests/posts/list.spec.ts` | Posts index page |
| `tests/posts/create.spec.ts` | Creating a new post |
| `tests/posts/show.spec.ts` | Viewing a single post |

## Fixing tests with the healer

The Playwright Test Healer uses a Claude Code agent to inspect the live UI and fix broken selectors/assertions automatically.

Trigger the healer skill from the repo root:

```
/test-healer playwright/tests/posts/list.spec.ts
```

## Configuration

`playwright.config.ts` configures:

- `baseURL`: `http://localhost:3000`
- Single worker (sequential) to avoid DB conflicts
- Chromium project only
- Line reporter for concise output

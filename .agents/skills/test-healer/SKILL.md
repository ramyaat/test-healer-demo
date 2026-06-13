---
name: test-healer
description: Fix failing Playwright tests in Circle. Supports local mode (single test file) and CI mode (Buildkite build URL). Uses playwright-cli to inspect current UI state, makes minimal selector/assertion fixes, and validates with 2 consecutive passes.
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(overmind:*) Bash(curl:*) Bash(lsof:*) mcp__sequential-thinking__sequentialthinking
---

# Test Healer

Fix failing Playwright tests. Use playwright-cli to inspect the live UI, collect diagnostic evidence, make minimal targeted fixes, and verify stability.

**Local mode**: `/test-healer [test-file-path]`
**CI mode**: `/test-healer [buildkite-build-url]`

> **Using CI mode for the first time?** See `guides/setup.md` to configure the Buildkite MCP.

**Examples**:

```
/test-healer playwright/tests/email-hub/broadcast.spec.ts
/test-healer https://buildkite.com/circleco/ci-builds/builds/12345
```

---

## LOCAL MODE

### Step 1 — Run and Read the Failure

```bash
cd playwright && npx playwright test {file} --project=incubatorTestSuite --reporter=line
```

Read the error output carefully. Do NOT touch the code yet.

**Use this decision tree**:

- Selector issue? → `guides/failure-analysis.md`
- Backend API error? → `guides/failure-analyzer-workflow.md`
- Flaky/timing issue? → Check if passed on 5+ retries in CI
- Feature flag off? → Check `guides/feature-flag-detection.md`
- VCR cassette error? → `guides/vcr-healing.md`

### Step 2 — Collect Diagnostic Evidence

#### 2a. Ensure test server is running

```bash
# Check if test server is running (lsof works inside sandbox, curl does not)
if ! lsof -ti:3000 > /dev/null 2>&1; then
  echo "Test server not running — starting with overmind..."
  rm -f .overmind.sock 2>/dev/null
  overmind start -f Procfile_test > /tmp/test-server.log 2>&1 &

  # Wait for webpack (port 3035) and Rails (port 3000)
  echo "Waiting for webpack..."
  for i in $(seq 1 90); do sleep 2; lsof -ti:3035 > /dev/null 2>&1 && break; done
  echo "Waiting for Rails..."
  for i in $(seq 1 60); do sleep 2; lsof -ti:3000 > /dev/null 2>&1 && break; done
  echo "Test server ready."
fi

# Create a test community for inspection
cd playwright && node --import tsx scripts/create-planner-session.ts
# Capture: { email, password, url }
```

#### 2b. Reproduce in browser (if selector/assertion/timing issue)

```bash
playwright-cli -s=healer open {url}/{feature-path}
# Sign in if needed
playwright-cli -s=healer snapshot
# Read playwright/.playwright-cli/{latest}.yml to find correct element refs/roles/names
playwright-cli -s=healer screenshot --filename=$TMPDIR/healer-actual-state.png

# Save auth state for reuse in subsequent heal attempts
playwright-cli -s=healer state-save $TMPDIR/healer-auth-state.json
```

On subsequent heal attempts, skip sign-in by loading saved state:

```bash
playwright-cli -s=healer state-load $TMPDIR/healer-auth-state.json
playwright-cli -s=healer open {url}/{feature-path}
```

#### 2c. Capture console & network (always, after reproducing)

```bash
# Check for JavaScript errors that may explain the failure
playwright-cli -s=healer console error
playwright-cli -s=healer console warning

# Check for failed API calls (4xx/5xx responses, hung requests)
playwright-cli -s=healer network
```

Console errors (e.g., `TypeError: cannot read property 'id' of undefined`) often reveal the root cause immediately. Network monitoring surfaces API failures that prevent UI rendering.

#### 2d. Check Rails server log (if 4xx/5xx or timeout suspected)

```bash
# Check Rails server log for backend errors, stack traces, external HTTP failures
overmind echo web | tail -50 | grep -iE "Error|Exception|500|422|Stripe|Mailgun|Net::HTTP|Faraday|SocketError|connection refused"
```

The test runner shows the HTTP status code, but the Rails log shows the actual stack trace and root cause.

#### 2e. Interactive tracing (for complex multi-step failures)

When the failure is hard to reproduce and a snapshot alone doesn't explain it, wrap the manual reproduction with tracing:

```bash
playwright-cli -s=healer tracing-start
# Reproduce the failing flow step by step
playwright-cli -s=healer open {url}
playwright-cli -s=healer click e5
playwright-cli -s=healer fill e3 "test"
# ... reproduce steps ...
playwright-cli -s=healer tracing-stop
# Read trace output for DOM + network + console at each step
```

#### 2f. Close session

```bash
playwright-cli -s=healer close
```

### Step 2.5 — Environment Check (first failure only)

Before touching any code, verify the test environment is healthy:

1. **Server responding?**

   ```bash
   lsof -ti:3000 > /dev/null 2>&1 && echo "Server UP" || echo "Server DOWN"
   lsof -ti:3035 > /dev/null 2>&1 && echo "Webpack UP" || echo "Webpack DOWN"
   ```

   If down → restart with overmind, re-run test. This does NOT count as a heal attempt.

2. **Feature flags enabled?** (if test uses feature-flagged UI)

   ```bash
   curl -s -X POST "http://localhost:3000/__e2e__/command" -H "Content-Type: application/json" \
     -d '{"name": "eval", "options": {"code": "CommunitySetting.find_by(community_id: {id}).{flag_field}"}}'
   ```

   If flag is off → re-enable, re-run. NOT a heal attempt.

3. **Elasticsearch indexed?** (if test involves search)
   Check if test calls `reindexModel()` — if missing, that's the fix.

4. **Sidekiq mode correct?** (if test triggers background jobs)
   Check if test sets `setSidekiqMode({ mode: "inline" })` before the trigger.

If any environment issue is found → fix it and re-run. Environment fixes do NOT count toward the max attempt limit.

### Step 3 — Classify Failure and Make Minimal Fix

**Sequential-thinking gate** — Before each heal attempt, use `mcp__sequential-thinking__sequentialthinking` to reason through:

1. **Error type**: selector / assertion / timing / backend API / VCR / environment
2. **Evidence collected**: What do console errors, network state, Rails logs, and the snapshot show?
3. **Root cause hypothesis**: What specific thing is wrong? (not "selector broken" but "the button text changed from 'Save' to 'Save changes'")
4. **Minimal fix**: What is the smallest change that fixes this? Which file(s)?
5. **Risk**: Could this fix break other tests? Does the selector/assertion appear elsewhere?

Then read `guides/failure-analysis.md` for the right fix per failure type.

**Rules**:

- Change ONLY what's broken — no refactoring, no style changes
- Only edit files in `playwright/tests/`, `playwright/pages/`, `playwright/testdata/`
- If the failure is a backend bug (5xx, auth error, DB error): STOP. Report to user.
- If you need a new Page Object method: add it to the existing page object (don't rewrite the class)

### Step 4 — Verify Stability (2 consecutive passes)

```bash
cd playwright && npx playwright test {file} --project=incubatorTestSuite --reporter=line
cd playwright && npx playwright test {file} --project=incubatorTestSuite --reporter=line
```

If the second run fails: back to Step 2. Max 5 attempts total.

**On 2nd heal attempt** — run with trace to get full diagnostic evidence:

```bash
cd playwright && npx playwright test {file} --project=incubatorTestSuite --reporter=line --trace on
# Trace saved to test-results/ — inspect for DOM state, network, console at failure point
ls playwright/test-results/*/trace.zip
```

If still failing after 5 attempts: report the issue with full error context to the user.

### Step 5 — Code Review (optional, for multi-file fixes)

If healing touched 3+ files OR added new page object methods:
→ Run `/playwright-code-review` on the modified files
→ Apply CRITICAL findings only
→ Re-run 2x to verify no regressions

---

## CI MODE (Buildkite URL)

### Step 1 — Fetch Failures from Buildkite

```
mcp__buildkite__get_build  →  get build details, list failed jobs
mcp__buildkite__read_logs  →  get error output for each failed job
```

### Step 2 — Group Unique Failures

From the CI logs:

1. Extract test names + error messages + stack traces
2. Group by unique error signature (same error = same root cause = fix once)
3. **Skip flaky tests**: if a test failed but passed on 5+ retries in the same build, mark as flaky and skip

Create a **TaskList** with one task per unique failure group.

### Step 3 — For Each Unique Failure

Mark task `in_progress`.

**a) Identify root cause**:

- Read the failing test file + referenced page objects
- Read the error from Step 1

**b) Inspect UI** (if selector issue):

```bash
cd playwright && node --import tsx scripts/create-planner-session.ts
playwright-cli -s=healer open {url}/{feature-path}
playwright-cli -s=healer snapshot
playwright-cli -s=healer close
```

**c) Fix** (see `guides/failure-analysis.md` — minimal changes only)

**d) Validate locally**:

```bash
cd playwright && npx playwright test {affected-file} --project=incubatorTestSuite --reporter=line
cd playwright && npx playwright test {affected-file} --project=incubatorTestSuite --reporter=line
```

Both must pass. If not: attempt up to 5 times, then report.

Mark task `completed`. Advance to next failure group.

### Step 4 — Summary

After all unique failures are addressed, output:

```
Healed {N}/{total} failures:
✅ Fixed: {list of tests fixed with change description}
⚠️  Skipped (flaky): {list of flaky tests}
❌ Reported (backend/infra): {list of backend bugs found}

Files modified:
- playwright/tests/...
- playwright/pages/...
```

---

## Worked Examples

### Example 1: Flaky Test (Passed on Retries)

**Build**: `https://buildkite.com/circleco/ci-builds/builds/12345`

**Failed test**: `broadcasts/schedule.spec.ts`

**Error** (Run 1):

```
Timeout waiting for "Save" button to be enabled
```

**Subsequent runs**: ✅ ✅ ✅ ✅ ✅ (all passed)

**Analysis**: Button takes 100-200ms to enable; test tried at 50ms. This is flaky, not broken.

**Action**: Mark as flaky. Do NOT fix. Report to team for investigation.

**Output**:

```
⚠️ Skipped (flaky): broadcasts/schedule.spec.ts
Reason: Failed once, then passed on 5 consecutive retries. Timing issue, not selector/code problem.
```

---

### Example 2: Backend API Error (422 Validation)

**Failed test**: `broadcasts/bulk-send.spec.ts:42`

**Error**:

```
POST /broadcasts/bulk → 422
Response: { "errors": { "audience_id": "can't be blank" } }
```

**Root cause analysis**:

- Test code fills name and schedule_time
- Missing: audience selection before submitting
- This is test setup incomplete, not a code bug

**Fix**:

```typescript
// BEFORE:
await page.fill('input[name="name"]', "Bulk Broadcast");
await page.fill('input[name="schedule_time"]', "2025-03-10");
await page.click('button[type="submit"]'); // → 422!

// AFTER:
await page.fill('input[name="name"]', "Bulk Broadcast");
await page.fill('input[name="schedule_time"]', "2025-03-10");
await page.click('button[name="select-audience"]'); // Add this!
await page.getByRole("option", { name: "All Members" }).click();
await page.click('button[type="submit"]'); // → 201 Created
```

**Verify**: Run 2x consecutively → Both pass ✅

---

### Example 3: Backend Bug (500 Server Error)

**Failed test**: `broadcasts/send.spec.ts:30`

**Error**:

```
POST /broadcasts/123/send → 500
Response: {
  "error": "undefined method 'recipients_count' for nil:NilClass",
  "stack_trace": "app/services/broadcast_service.rb:42"
}
```

**Analysis**:

- This is a **backend code bug**, not a test problem
- Server is trying to call `.recipients_count` on a nil object
- Test is set up correctly; app has a logic error

**Action**: DO NOT modify the test.

**Report to backend team**:

```
**Failed Test**: broadcasts/send.spec.ts:30
**Endpoint**: POST /broadcasts/:id/send
**Status**: 500
**Error**: undefined method 'recipients_count' for nil:NilClass
**File**: app/services/broadcast_service.rb:42

Test data was valid. Issue is in the broadcast_service.
Please investigate why recipients_count is called on nil.

To reproduce locally:
cd playwright && node --import tsx scripts/create-planner-session.ts
# Use the output credentials to create a broadcast, then try to send it
```

**Output**:

```
❌ Reported (backend/infra): broadcasts/send.spec.ts
Reason: Server returned 500 error due to undefined method in broadcast_service.rb
```

---

## Hard Rules

- **Never prefix `playwright-cli` with `npx`** — `playwright-cli` is a globally installed binary. `npx playwright-cli` fails under sandbox because npm registry is blocked. Always use `playwright-cli` directly.
- **Minimal changes** — fix exactly the broken piece, nothing else
- **No timeouts** — never add `page.waitForTimeout()`; use `expect(locator).toBeVisible()`
- **No networkidle** — always use `domcontentloaded`
- **No refactoring** — this is not the time to clean up code
- **Only allowed directories**: `playwright/tests/`, `playwright/pages/`, `playwright/testdata/`
- **Backend bugs are not your job** — if the app returns 5xx, report it, don't work around it
- **2 consecutive passes required** — a single pass is not enough to confirm stability
- **Evidence before action** — always collect diagnostic evidence (console, network, Rails log) before attempting a fix
- **Environment first** — verify server, flags, and services before assuming code is broken

## Troubleshooting

For common failure patterns and systematic diagnosis, see [guides/failure-analysis.md](guides/failure-analysis.md), which covers selector timeouts, assertion failures, API errors, and backend issues.

For VCR cassette failures (missing, stale, or poisoned cassettes), see [guides/vcr-healing.md](guides/vcr-healing.md).

**playwright-cli session locked**

- Run `playwright-cli kill-all` to clear orphaned processes

**Test still failing after local fixes**

- Try running the exact same test in CI to check for environment-specific issues (e.g., different viewport, race conditions)

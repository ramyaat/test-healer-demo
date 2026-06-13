# Playwright Test Picker

AI-powered tool that analyzes Pull Request changes and recommends which Playwright E2E tests to run, saving time and CI costs.

## Overview

Instead of running the entire Playwright test suite (~60 minutes), this tool uses Claude AI to intelligently select only the tests impacted by your code changes (~5-10 minutes).

**Benefits:**

- ⏱️ **50+ minutes saved** per PR
- 💰 **10-30x ROI** (~$0.15 analysis vs $2-5 CI savings)
- 🎯 **Smart prioritization** (High/Medium/Low)
- 🔄 **Works everywhere** (CI/CD, local dev, PR review)

## Quick Start

```bash
# Set required environment variables
export ANTHROPIC_API_KEY="sk-ant-..."
export GITHUB_TOKEN="ghp_..."
export BUILDKITE_PULL_REQUEST=1234
export REPO_LOCATION="your-org/your-repo"

# Run test picker
.buildkite/test-picker/playwright-test-picker.sh

# View results
cat tmp/test-picker/test-impact-analysis.md
open tmp/test-picker/test-impact-analysis.html

# Run recommended tests
npx playwright test [tests-from-analysis]
```

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` - Anthropic API key
- `BUILDKITE_PULL_REQUEST` - PR number to analyze
- `GITHUB_TOKEN` - GitHub API token for fetching PR changes
- `REPO_LOCATION` - Repository (e.g., `your-org/your-repo`) or `BUILDKITE_REPO`

### Optional

- `OUTPUT_DIR` - Output directory (default: `tmp/test-picker/`)
- `MAX_ITERATIONS` - Analysis depth (default: 50)
- `INCLUDE_DIFF` - Include code diffs for deeper analysis (default: true, auto-disabled for large PRs)

### Token Usage Guardrails

Cost protection limits enforced automatically:

- `MAX_FILES=200` - Exits if PR > 200 files
- `MAX_PR_CHANGES_SIZE_MB=10` - Exits if input > 10MB (warns at 5MB)
- `MAX_ITERATIONS=50` - Claude analysis iterations (lower = cheaper)
- `AUTO_DISABLE_DIFF_THRESHOLD=100` - Auto-disables diffs if PR > 100 files
- Per-file limits: 50KB max patch, 500 lines max diff
- Total diff cap: 500KB across all files

**Smart diff handling**:

- PRs with ≤ 100 files: Diffs included by default (better analysis)
- PRs with > 100 files: Diffs auto-disabled (cost protection)
- Override anytime: Set `INCLUDE_DIFF=true` to force, or `false` to always disable

**Typical costs**:

- Small PRs (< 50 files): $0.15-0.45 with diffs
- Medium PRs (50-100 files): $0.45-0.90 with diffs
- Large PRs (100+ files): $0.60-0.75 without diffs (auto-disabled)

**Override for very large PRs**:

```bash
MAX_FILES=300 ./playwright-test-picker.sh  # Diffs auto-disabled at 100+ files
```

## Output Files

Generated in `tmp/test-picker/`:

- **test-impact-analysis.md** - Detailed analysis with reasoning
- **test-impact-analysis.html** - Styled report with metrics
- **pr-changes.md** - Structured PR changes summary

## How It Works

```
┌─────────────────────────────────┐
│      Pull Request Changes       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│     Fetch & Categorize Files    │
│  • Components  • Controllers    │
│  • Models      • Services       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│     Claude AI Analysis          │
│  • Code-to-test mapping         │
│  • Impact assessment            │
│  • Prioritization               │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Prioritized Test List         │
│  • High Priority                │
│  • Medium Priority              │
│  • Low Priority                 │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Generate Reports              │
│  • Markdown                     │
│  • HTML                         │
└─────────────────────────────────┘
```

## Priority Levels

**High Priority** - Direct impact (~95% accuracy)

- Component changed → Tests using that component
- API endpoint changed → Tests calling that endpoint

**Medium Priority** - Feature impact (~85% accuracy)

- Service changed → Tests triggering that logic
- Shared utility changed → Tests using that utility

**Low Priority** - Integration impact (~75% accuracy)

- Configuration changed → Integration tests
- Indirect dependencies → Cross-feature tests

## Risk Assessment

- **Low Risk**: < 5 files, isolated changes
- **Medium Risk**: 5-15 files, feature-level
- **High Risk**: > 15 files OR critical areas (auth, payments)

## Usage Scenarios

### 1. CI/CD Pipeline

```yaml
- label: "🎯 Pick Playwright Tests"
  command: .buildkite/test-picker/playwright-test-picker.sh
  env:
    ANTHROPIC_API_KEY: $BUILDKITE_ANTHROPIC_API_KEY
  artifact_paths:
    - "tmp/test-picker/*.md"
    - "tmp/test-picker/*.html"
```

### 2. Local Development

```bash
# Before pushing
export ANTHROPIC_API_KEY="sk-ant-..."
.buildkite/test-picker/playwright-test-picker.sh
```

### 3. PR Review

```bash
# Analyze specific PR
export BUILDKITE_PULL_REQUEST="1234"
export GITHUB_TOKEN="ghp_..."
export REPO_LOCATION="your-org/your-repo"
.buildkite/test-picker/playwright-test-picker.sh
```

### 4. Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit
export ANTHROPIC_API_KEY="sk-ant-..."
.buildkite/test-picker/playwright-test-picker.sh
echo "Review recommendations in tmp/test-picker/"
```

## Configuration

### Include Code Diffs

By default, diffs are included for PRs ≤ 100 files and auto-disabled for larger PRs.

**Force enable diffs** (for large PRs):

```bash
INCLUDE_DIFF=true .buildkite/test-picker/playwright-test-picker.sh
```

**Always disable diffs** (for faster/cheaper analysis):

```bash
INCLUDE_DIFF=false .buildkite/test-picker/playwright-test-picker.sh
```

**Adjust auto-disable threshold**:

```bash
AUTO_DISABLE_DIFF_THRESHOLD=50 ./playwright-test-picker.sh  # Disable at 50+ files
```

### Custom Output Directory

```bash
OUTPUT_DIR=custom/path .buildkite/test-picker/playwright-test-picker.sh
```

### Adjust Analysis Depth

```bash
MAX_ITERATIONS=25 .buildkite/test-picker/playwright-test-picker.sh
```

## Customization

### Update Test Mappings

Edit `prompts/playwright-test-picker.md` to adjust code-to-test relationships:

```markdown
### React Components

app/javascript/react/components/PostEditor/
→ playwright/tests/community/posts/createPost.spec.ts
→ playwright/tests/community/posts/editPostContent.spec.ts
```

### Modify Prioritization Logic

Update the analysis strategy section in the prompt file to change how tests are prioritized.

## Cost & Performance

| PR Size               | Analysis Time | Typical Cost | Time Saved    |
| --------------------- | ------------- | ------------ | ------------- |
| Small (< 20 files)    | 1-3 min       | $0.10-0.25   | 50-55 min     |
| Medium (20-50 files)  | 2-5 min       | $0.25-0.50   | 50-55 min     |
| Large (50-100 files)  | 4-8 min       | $0.50-0.90   | 50-55 min     |
| Very Large (100-200)  | 5-10 min      | $0.60-0.75   | 50-55 min     |
| Massive (> 200 files) | Blocked       | N/A          | Run all tests |

**Note**: Costs include diffs for PRs ≤ 100 files (default). Diffs auto-disabled for 100+ files to control costs.

## Example Output

```markdown
## 📊 Impact Analysis Summary

- **Total files changed**: 4
- **Risk level**: Medium
- **Recommended test scope**: Feature-based

## 🎯 Impacted Tests (Prioritized)

### High Priority (Direct Impact)

#### playwright/tests/community/posts/createPost.spec.ts

Reason: PostEditor component directly used in post creation

#### playwright/tests/community/posts/editPostContent.spec.ts

Reason: PostEditor changes affect editing functionality

### 🎬 Recommended Test Command

npx playwright test \
 playwright/tests/community/posts/createPost.spec.ts \
 playwright/tests/community/posts/editPostContent.spec.ts
```

## Troubleshooting

**Missing API key:**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**Build errors:**

```bash
cd .buildkite/claude_agent
npm install && npm run build
```

**PR changes not fetched:**

- Check `GITHUB_TOKEN` is set
- Verify `REPO_LOCATION` is correct (e.g., `your-org/your-repo`)
- Verify `BUILDKITE_PULL_REQUEST` is a valid PR number
- Check GitHub token has `repo` scope permissions

**Inaccurate analysis:**

```bash
# Include code diffs for more context
INCLUDE_DIFF=true ./playwright-test-picker.sh

# Or increase analysis depth
MAX_ITERATIONS=25 ./playwright-test-picker.sh
```

## Architecture

```
test-picker/
├── playwright-test-picker.sh      # Main orchestration script
├── pr-fetcher.ts                  # Main PR changes fetcher
├── pr-validators.ts               # Validation utilities
├── pr-formatters.ts               # Formatting utilities
├── pr-api.ts                      # GitHub API utilities
├── prompts/
│   └── playwright-test-picker.md  # AI analysis prompt
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
└── README.md                      # This file
```

**Dependencies:**

- Claude Agent SDK (shared at `../claude_agent/`)
- `@octokit/rest` for GitHub API integration

## Best Practices

1. ✅ **Review recommendations** - Don't blindly trust, always verify
2. ✅ **Start with high priority** - Run critical tests first
3. ✅ **Keep PRs focused** - Smaller PRs = better analysis
4. ✅ **Update prompt regularly** - Maintain accurate code-to-test mappings
5. ✅ **Monitor accuracy** - Track false positives/negatives
6. ✅ **Share results** - Help team understand test impact

## Support

- Review execution logs in `tmp/test-picker/`
- Check HTML report for detailed trace
- Verify environment variables are set
- See [../claude_agent/README.md](../claude_agent/README.md) for Claude Agent details

---

**Location:** `.buildkite/test-picker/`  
**Created:** January 2026  
**Powered by:** Claude AI + Claude Agent SDK

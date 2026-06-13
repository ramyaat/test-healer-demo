#!/bin/bash
set -euo pipefail

# Playwright Test Picker
# Analyzes PR changes and identifies which Playwright tests should be run

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CLAUDE_AGENT_DIR="${WORKSPACE_ROOT}/.buildkite/claude_agent"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

source "$(dirname "$0")/../run-playwright-incubator.sh"

# Default values
OUTPUT_DIR="${OUTPUT_DIR:-${WORKSPACE_ROOT}/tmp/test-picker}"
PR_CHANGES_FILE="${OUTPUT_DIR}/pr-changes.md"
ANALYSIS_OUTPUT="${OUTPUT_DIR}/test-impact-analysis.md"
PROMPT_FILE="${SCRIPT_DIR}/prompts/playwright-test-picker.md"
INCLUDE_DIFF="${INCLUDE_DIFF:-true}"

# Token usage guardrails
MAX_FILES="${MAX_FILES:-200}"  # Maximum number of files to process
MAX_PR_CHANGES_SIZE_MB="${MAX_PR_CHANGES_SIZE_MB:-10}"  # Max PR changes file size in MB
WARN_FILES_THRESHOLD="${WARN_FILES_THRESHOLD:-100}"  # Warn if files exceed this
WARN_PR_SIZE_MB="${WARN_PR_SIZE_MB:-5}"  # Warn if PR changes exceed this size
AUTO_DISABLE_DIFF_THRESHOLD="${AUTO_DISABLE_DIFF_THRESHOLD:-100}"  # Auto-disable diffs above this

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🎯 Playwright Test Picker${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check required environment variables
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${BUILDKITE_ANTHROPIC_API_KEY:-}" ]; then
  echo -e "${RED}❌ Error: ANTHROPIC_API_KEY or BUILDKITE_ANTHROPIC_API_KEY is required${NC}"
  exit 1
fi

# Check PR number is provided
if [ -z "${BUILDKITE_PULL_REQUEST:-}" ] || [ "${BUILDKITE_PULL_REQUEST}" = "false" ]; then
  echo -e "${RED}❌ Error: BUILDKITE_PULL_REQUEST is required${NC}"
  echo -e "${YELLOW}   Usage: BUILDKITE_PULL_REQUEST=1234 ./playwright-test-picker.sh${NC}"
  echo -e "${YELLOW}   This tool analyzes GitHub PRs and requires a valid PR number.${NC}"
  exit 1
fi

# Check GitHub token is provided
if [ -z "${GITHUB_TOKEN:-}" ] && [ -z "${PR_FILES_TOKEN:-}" ]; then
  echo -e "${RED}❌ Error: GITHUB_TOKEN or PR_FILES_TOKEN is required${NC}"
  echo -e "${YELLOW}   Set token: export GITHUB_TOKEN='ghp_...'${NC}"
  exit 1
fi

# Check repository location is provided
if [ -z "${REPO_LOCATION:-}" ] && [ -z "${BUILDKITE_REPO:-}" ]; then
  echo -e "${RED}❌ Error: REPO_LOCATION or BUILDKITE_REPO is required${NC}"
  echo -e "${YELLOW}   Set repo: export REPO_LOCATION='your-org/your-repo'${NC}"
  exit 1
fi

# Create output directories
mkdir -p "${OUTPUT_DIR}"
mkdir -p "${WORKSPACE_ROOT}/tmp"

# Step 1: Build the TypeScript code if needed
echo -e "${YELLOW}📦 Checking if build is needed...${NC}"

# Check both claude_agent and playwright-impact for TypeScript files
if [ ! -d "${CLAUDE_AGENT_DIR}/dist" ] || [ ! -f "${CLAUDE_AGENT_DIR}/dist/index.js" ]; then
  echo -e "${YELLOW}🔨 Building Claude Agent TypeScript files...${NC}"
  cd "${CLAUDE_AGENT_DIR}"
  npm install
  npm run build
else
  echo -e "${GREEN}✅ Claude Agent build artifacts found${NC}"
fi

# Build test-picker TypeScript if needed
if [ ! -d "${SCRIPT_DIR}/dist" ] || [ ! -f "${SCRIPT_DIR}/dist/pr-fetcher.js" ]; then
  echo -e "${YELLOW}🔨 Building Test Picker TypeScript files...${NC}"
  cd "${SCRIPT_DIR}"
  
  # Check if package.json exists, if not, use claude_agent's
  if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}   Using Claude Agent's build system...${NC}"
    cd "${CLAUDE_AGENT_DIR}"
    npm run build
    
    # Create symlink for the dist if needed
    if [ ! -d "${SCRIPT_DIR}/dist" ]; then
      # Validate target directory exists and is within workspace
      if [ ! -d "${CLAUDE_AGENT_DIR}/dist" ]; then
        echo -e "${RED}❌ Error: Source directory ${CLAUDE_AGENT_DIR}/dist does not exist${NC}"
        exit 1
      fi
      
      # Ensure target is within workspace (prevent directory traversal)
      REAL_CLAUDE_DIR=$(cd "${CLAUDE_AGENT_DIR}/dist" && pwd -P)
      REAL_WORKSPACE=$(cd "${WORKSPACE_ROOT}" && pwd -P)
      if [[ ! "${REAL_CLAUDE_DIR}" == "${REAL_WORKSPACE}"* ]]; then
        echo -e "${RED}❌ Error: Target directory is outside workspace${NC}"
        exit 1
      fi
      
      echo -e "${BLUE}   Creating symlink: ${SCRIPT_DIR}/dist -> ${CLAUDE_AGENT_DIR}/dist${NC}"
      ln -sf "${CLAUDE_AGENT_DIR}/dist" "${SCRIPT_DIR}/dist"
    fi
  else
    npm install
    npm run build
  fi
else
  echo -e "${GREEN}✅ Test Picker build artifacts found${NC}"
fi

# Step 2: Fetch PR changes
echo ""
echo -e "${YELLOW}📡 Fetching PR changes...${NC}"

cd "${WORKSPACE_ROOT}"

# Use the built pr-fetcher from whichever location it exists
if [ -f "${SCRIPT_DIR}/dist/pr-fetcher.js" ]; then
  PR_FETCHER="${SCRIPT_DIR}/dist/pr-fetcher.js"
else
  PR_FETCHER="${CLAUDE_AGENT_DIR}/dist/pr-fetcher.js"
fi

OUTPUT_FILE="${PR_CHANGES_FILE}" \
INCLUDE_DIFF="${INCLUDE_DIFF}" \
node "${PR_FETCHER}"

if [ ! -f "${PR_CHANGES_FILE}" ]; then
  echo -e "${RED}❌ Error: Failed to fetch PR changes${NC}"
  exit 1
fi

echo -e "${GREEN}✅ PR changes saved to: ${PR_CHANGES_FILE}${NC}"

# Guardrail: Check PR changes file size
PR_CHANGES_SIZE_BYTES=$(stat -f%z "${PR_CHANGES_FILE}" 2>/dev/null || stat -c%s "${PR_CHANGES_FILE}" 2>/dev/null)
PR_CHANGES_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", ${PR_CHANGES_SIZE_BYTES} / 1048576}")

MAX_SIZE_BYTES=$((MAX_PR_CHANGES_SIZE_MB * 1048576))
WARN_SIZE_BYTES=$((WARN_PR_SIZE_MB * 1048576))

if [ "${PR_CHANGES_SIZE_BYTES}" -gt "${MAX_SIZE_BYTES}" ]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ ERROR: PR changes file too large!${NC}"
  echo -e "${RED}   Size: ${PR_CHANGES_SIZE_MB}MB (max: ${MAX_PR_CHANGES_SIZE_MB}MB)${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${YELLOW}💡 Suggestions to reduce token usage:${NC}"
  echo -e "   1. Set INCLUDE_DIFF=false (currently: ${INCLUDE_DIFF})"
  echo -e "   2. Split this PR into smaller PRs"
  echo -e "   3. Increase limit: MAX_PR_CHANGES_SIZE_MB=20"
  echo -e "   4. Skip test picker and run all tests instead"
  echo ""
  exit 1
elif [ "${PR_CHANGES_SIZE_BYTES}" -gt "${WARN_SIZE_BYTES}" ]; then
  echo -e "${YELLOW}⚠️  Warning: Large PR changes file detected${NC}"
  echo -e "${YELLOW}   Size: ${PR_CHANGES_SIZE_MB}MB (warning threshold: ${WARN_PR_SIZE_MB}MB)${NC}"
  echo -e "${YELLOW}   This may result in high token usage. Consider running with INCLUDE_DIFF=false${NC}"
fi

# Step 2.5: Check if changes are playwright-only (no application code changes)
echo ""
echo -e "${YELLOW}🔍 Analyzing change scope...${NC}"

# Extract file paths from the PR changes markdown file
# Look for lines with #### followed by file paths
# Using more restrictive pattern and process substitution for safety
CHANGED_FILES=""

# Define regex pattern as a variable to avoid escaping issues with backticks
# Pattern matches: #### `filename` (status)
FILENAME_PATTERN='^####[[:space:]]+`([^`]+)`[[:space:]]*\([^)]+\)$'

while IFS= read -r line; do
  # Match lines starting with #### followed by backtick-quoted paths
  if [[ "$line" =~ $FILENAME_PATTERN ]]; then
    filename="${BASH_REMATCH[1]}"
    
    # Validate filename: only allow safe characters (alphanumeric, /, _, -, .)
    # This prevents injection of shell metacharacters
    if [[ "$filename" =~ ^[a-zA-Z0-9/_.-]+$ ]]; then
      CHANGED_FILES="${CHANGED_FILES}${filename}"$'\n'
    else
      echo -e "${YELLOW}⚠️  Skipping file with unsafe characters: ${filename}${NC}"
    fi
  fi
done < "${PR_CHANGES_FILE}"

# Remove trailing newline
CHANGED_FILES="${CHANGED_FILES%$'\n'}"

if [ -z "${CHANGED_FILES}" ]; then
  echo -e "${RED}❌ Error: No changed files found in PR changes${NC}"
  exit 1
fi

# Guardrail: Check number of changed files
FILE_COUNT=$(echo "${CHANGED_FILES}" | wc -l | tr -d ' ')

if [ "${FILE_COUNT}" -gt "${MAX_FILES}" ]; then
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ ERROR: Too many changed files!${NC}"
  echo -e "${RED}   Files changed: ${FILE_COUNT} (max: ${MAX_FILES})${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${YELLOW}💡 Suggestions:${NC}"
  echo -e "   1. Split this PR into smaller PRs"
  echo -e "   2. Increase limit: MAX_FILES=300"
  echo -e "   3. Skip test picker and run all Playwright tests instead"
  echo ""
  exit 1
elif [ "${FILE_COUNT}" -gt "${AUTO_DISABLE_DIFF_THRESHOLD}" ]; then
  if [ "${INCLUDE_DIFF}" = "true" ]; then
    echo -e "${YELLOW}⚠️  Large PR detected (${FILE_COUNT} files)${NC}"
    echo -e "${YELLOW}   Automatically disabling INCLUDE_DIFF to control token usage${NC}"
    INCLUDE_DIFF="false"
  fi
  echo -e "${YELLOW}⚠️  Warning: Large number of files changed (${FILE_COUNT})${NC}"
elif [ "${FILE_COUNT}" -gt "${WARN_FILES_THRESHOLD}" ]; then
  echo -e "${YELLOW}⚠️  Warning: Large number of files changed (${FILE_COUNT})${NC}"
  echo -e "${YELLOW}   This may result in high token usage${NC}"
fi

# Check if ALL changed files are in the playwright folder
PLAYWRIGHT_ONLY=true
NON_PLAYWRIGHT_FILES=""

while IFS= read -r file; do
  # Skip empty lines
  [ -z "$file" ] && continue
  
  if [[ ! "$file" =~ ^playwright/ ]]; then
    PLAYWRIGHT_ONLY=false
    NON_PLAYWRIGHT_FILES="${NON_PLAYWRIGHT_FILES}${file}"$'\n'
  fi
done <<< "${CHANGED_FILES}"

PLAYWRIGHT_ONLY_INSTRUCTION=""

if [ "${PLAYWRIGHT_ONLY}" = true ]; then
  echo -e "${GREEN}✅ Detected playwright-only changes (no application code modified)${NC}"
  echo -e "${BLUE}   This PR only modifies tests and/or page objects${NC}"
  
  # Create special instruction for Claude Agent
  PLAYWRIGHT_ONLY_INSTRUCTION=$(cat <<'EOF'

---
## ⚡ SPECIAL INSTRUCTION: Playwright-Only Changes Detected

**IMPORTANT:** All changes in this PR are within the `playwright/` folder. This means:
- NO application code (Rails/React) has been modified
- Only test files and/or page objects have changed

**Simplified Analysis Required:**

1. **Identify modified page objects** from the PR changes
2. **Find all tests that import/use those page objects** using Grep to search for imports
3. **Include all modified test files** directly from the PR changes
4. **Skip application code analysis** - no need to search app/, spec/, etc.

**Your Task:**
- List all modified `.spec.ts` test files from PR changes
- For each modified page object (`.ts` files in `playwright/pages/`):
  - Use Grep to find tests importing that page object
  - Add those tests to the impact list
- Provide the complete structured output as usual

This should be a quick analysis since no application code changed.

---

EOF
)
  
  # Append the instruction to the PR changes file
  TEMP_PR_CHANGES="${OUTPUT_DIR}/pr-changes-with-instruction.md"
  cat "${PR_CHANGES_FILE}" > "${TEMP_PR_CHANGES}"
  echo "${PLAYWRIGHT_ONLY_INSTRUCTION}" >> "${TEMP_PR_CHANGES}"
  PR_CHANGES_FILE="${TEMP_PR_CHANGES}"
  
  echo -e "${BLUE}   Added special instruction for efficient analysis${NC}"
else
  echo -e "${BLUE}📋 Detected application code changes - full analysis required${NC}"
  echo -e "${YELLOW}   Non-playwright files changed:${NC}"
  echo "${NON_PLAYWRIGHT_FILES}" | head -5
  if [ $(echo "${NON_PLAYWRIGHT_FILES}" | wc -l) -gt 5 ]; then
    echo -e "${YELLOW}   ... and more${NC}"
  fi
fi

# Step 3: Run Claude Agent to analyze impact
echo ""
echo -e "${YELLOW}🤖 Running Claude Agent to analyze test impact...${NC}"

cd "${WORKSPACE_ROOT}"

ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-${BUILDKITE_ANTHROPIC_API_KEY}}" \
PROMPT_FILE="${PROMPT_FILE}" \
INPUT="${PR_CHANGES_FILE}" \
OUTPUT_FILE="${ANALYSIS_OUTPUT}" \
OUTPUT_DIR="${OUTPUT_DIR}" \
REPORT_TITLE="Playwright Test Impact Analysis" \
MAX_ITERATIONS="${MAX_ITERATIONS:-50}" \
node "${CLAUDE_AGENT_DIR}/dist/index.js"

if [ ! -f "${ANALYSIS_OUTPUT}" ]; then
  echo -e "${RED}❌ Error: Failed to generate test impact analysis${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ Test Impact Analysis Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📄 Output files:${NC}"
echo -e "   • Markdown: ${ANALYSIS_OUTPUT}"
echo -e "   • HTML: ${ANALYSIS_OUTPUT/.md/.html}"
echo -e "   • Selected Tests: ${WORKSPACE_ROOT}/tmp/selected_tests.txt"
echo ""

# Step 4: Extract test files to selected_tests.txt
echo -e "${YELLOW}📝 Extracting selected tests...${NC}"

SELECTED_TESTS_FILE="${WORKSPACE_ROOT}/tmp/selected_tests.txt"

# Parse the analysis output to extract test file paths from Machine-Readable Test List
if [ -f "${ANALYSIS_OUTPUT}" ]; then
  # Extract the JSON block from "Machine-Readable Test List" section
  # This section contains a JSON object with a "tests" array

  # Find the line number where "Machine-Readable Test List" appears
  # Match with or without emoji and with single or double # to handle encoding differences
  # and markdown heading level variations across environments
  # Use tail -1 to get the last occurrence, then ensure we only get a single line number
  START_LINE=$(grep -n "^#\+ .*Machine-Readable Test List" "${ANALYSIS_OUTPUT}" | tail -1 | cut -d: -f1 | head -1 | tr -d '\n' || true)
  
  # Validate that START_LINE is a valid number
  if [ -n "${START_LINE}" ] && ! [[ "${START_LINE}" =~ ^[0-9]+$ ]]; then
    echo -e "${YELLOW}⚠️  Warning: Invalid line number detected: '${START_LINE}'${NC}"
    START_LINE=""
  fi

  if [ -n "${START_LINE}" ]; then
    # Extract from that line onwards and find the JSON block
    # Look for the "tests" array specifically and extract its values
    # Create empty file first, then populate it (grep/pipeline won't fail due to || true)
    touch "${SELECTED_TESTS_FILE}"
    tail -n +"${START_LINE}" "${ANALYSIS_OUTPUT}" | \
      sed -n '/```json/,/```/p' | \
      sed -n '/"tests":/,/"page_objects":/p' | \
      grep -oE '"playwright/[^"]*\.spec\.ts"' | \
      sed 's/^"//;s/"$//' > "${SELECTED_TESTS_FILE}" || true

    # Check if file was created (even if empty)
    if [ -f "${SELECTED_TESTS_FILE}" ]; then
      if [ -s "${SELECTED_TESTS_FILE}" ]; then
        TEST_COUNT=$(wc -l < "${SELECTED_TESTS_FILE}" | tr -d ' ')
        echo -e "${GREEN}✅ Extracted ${TEST_COUNT} test files to: ${SELECTED_TESTS_FILE}${NC}"
      else
        # File exists but is empty - tests array was empty
        echo -e "${BLUE}ℹ️  Tests array is empty - no tests need to run (created empty file)${NC}"
      fi
    else
      # File wasn't created for some reason
      echo -e "${YELLOW}⚠️  Could not create selected tests file - creating empty file${NC}"
      touch "${SELECTED_TESTS_FILE}"
    fi
  else
    # Machine-Readable Test List section not found - this should never happen
    echo -e "${RED}❌ Error: Machine-Readable Test List section not found in analysis output${NC}"
    echo -e "${RED}   The Claude Agent did not follow the expected output format${NC}"
    echo -e "${YELLOW}   Falling back to running all Playwright tests as a safety measure${NC}"
    echo -e "${YELLOW}   Check the uploaded test-impact-analysis.md artifact for details${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ Error: Analysis output not found, cannot extract tests${NC}"
  echo -e "${YELLOW}   Falling back to running all Playwright tests as a safety measure${NC}"
  exit 1
fi

echo ""

# Display summary if available
if command -v head &> /dev/null && [ -f "${ANALYSIS_OUTPUT}" ]; then
  echo -e "${BLUE}📊 Analysis Preview:${NC}"
  echo ""
  head -n 50 "${ANALYSIS_OUTPUT}"
  echo ""
  echo -e "${YELLOW}... (see full report in ${ANALYSIS_OUTPUT})${NC}"
  echo ""
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"


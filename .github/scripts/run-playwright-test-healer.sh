#!/bin/bash
set -euo pipefail

################################################################################
# Playwright Test Healer Script
################################################################################
#
# Description:
#   Runs the Claude Agent to automatically analyze and fix failing Playwright
#   tests. Invokes Claude via the Agent SDK using the test-healer skill.
#
# Usage:
#   TEST_FILE=<test-file-path> ./run-playwright-test-healer.sh
#   TEST_FILE=<file1>,<file2> ./run-playwright-test-healer.sh
#
# Required Environment Variables:
#   ANTHROPIC_API_KEY    - API key for Anthropic's Claude AI service
#   TEST_FILE            - Path(s) to the Playwright test file(s) to heal
#
# Optional Environment Variables:
#   GITHUB_TOKEN         - GitHub token for auto-committing fixes
#   PROMPT_FILE          - Path to skill prompt (default: .agents/skills/test-healer/SKILL.md)
#   MAX_ITERATIONS       - Max Claude agent iterations (default: 50)
################################################################################

# Get test file(s) from environment (required)
if [ -z "${TEST_FILE:-}" ]; then
  echo "Error: TEST_FILE environment variable is required"
  exit 1
fi

TEST_FILES="$TEST_FILE"

# Convert comma-separated string to array
IFS=',' read -ra TEST_FILE_ARRAY <<< "$TEST_FILES"

# Normalize and validate all test files
VALIDATED_FILES=()
for file in "${TEST_FILE_ARRAY[@]}"; do
  file=$(echo "$file" | xargs)

  # Strip line/column numbers for file existence check
  file_path_only=$(echo "$file" | sed 's/:[0-9]*:[0-9]*$//' | sed 's/:[0-9]*$//')

  # Normalize to playwright/ prefix
  if [[ "$file_path_only" != playwright/* ]]; then
    file_path_only="playwright/$file_path_only"
  fi

  if [ ! -f "$file_path_only" ]; then
    echo "Error: Test file '$file_path_only' not found"
    exit 1
  fi

  if [[ "$file" != playwright/* ]]; then
    file="playwright/$file"
  fi

  VALIDATED_FILES+=("$file")
done

echo "Found ${#VALIDATED_FILES[@]} test file(s) to heal:"
for file in "${VALIDATED_FILES[@]}"; do
  echo "  - $file"
done

# Create artifact directories
mkdir -p log playwright/test-results

# Validate required env vars
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Error: ANTHROPIC_API_KEY environment variable is required"
  exit 1
fi

export PROMPT_FILE="${PROMPT_FILE:-.agents/skills/test-healer/SKILL.md}"
export MAX_ITERATIONS="${MAX_ITERATIONS:-50}"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: Prompt file '$PROMPT_FILE' not found"
  exit 1
fi

# Build Claude Agent
echo "Building Claude Agent..."
cd .github/claude_agent

npm install --silent
npm run build

cd ../..

# Initialize git config for committing fixes
git config user.name "Playwright Healer Bot"
git config user.email "github-actions@github.com"

mkdir -p tmp/healer-runs

# Iterate through each test file
TEST_FILE_INDEX=1
for CURRENT_TEST_FILE in "${VALIDATED_FILES[@]}"; do
  echo ""
  echo "Healing test ${TEST_FILE_INDEX}/${#VALIDATED_FILES[@]}: $CURRENT_TEST_FILE"

  export INPUT="${CURRENT_TEST_FILE#playwright/}"

  INITIAL_MODIFIED=$(git ls-files -m | sort)

  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  PROMPT_FILE="$PROMPT_FILE" \
  INPUT="$INPUT" \
  MAX_ITERATIONS="$MAX_ITERATIONS" \
  node .github/claude_agent/dist/index.js

  FINAL_MODIFIED=$(git ls-files -m | sort)
  comm -13 <(echo "$INITIAL_MODIFIED") <(echo "$FINAL_MODIFIED") > tmp/.healer-modified-files.txt

  if [ -s "tmp/.healer-modified-files.txt" ]; then
    echo "Files modified by agent:"
    cat tmp/.healer-modified-files.txt
    cp "tmp/.healer-modified-files.txt" "tmp/healer-runs/modified-files-${TEST_FILE_INDEX}.txt"
  else
    echo "No files modified by agent"
  fi

  # Rename HTML report with unique name per test file
  SAFE_FILENAME=$(echo "$INPUT" | sed 's/[\/\.]/-/g')
  if [ -f "log/claude-agent-output.html" ]; then
    mv "log/claude-agent-output.html" "log/claude-agent-output-${SAFE_FILENAME}.html"
  fi

  TEST_FILE_INDEX=$((TEST_FILE_INDEX + 1))
done

echo ""
echo "Completed healing ${#VALIDATED_FILES[@]} test file(s)"

# Auto-commit and push fixes if GITHUB_TOKEN is set
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "Committing fixes..."

  if [ -d "tmp/healer-runs" ] && ls tmp/healer-runs/modified-files-*.txt > /dev/null 2>&1; then
    cat tmp/healer-runs/modified-files-*.txt | sort -u > tmp/.healer-modified-files.txt

    if [ ! -s "tmp/.healer-modified-files.txt" ]; then
      echo "No files were modified - all tests were already passing"
    else
      echo "Modified files:"
      cat tmp/.healer-modified-files.txt

      BRANCH="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-main}}"
      git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"

      mapfile -t FILES_TO_STAGE < tmp/.healer-modified-files.txt
      git add "${FILES_TO_STAGE[@]}"
      git commit -m "fix: auto-heal failing Playwright tests

Fixed by Playwright Healer Bot via Claude Agent.

Co-Authored-By: Claude <noreply@anthropic.com>"
      git push origin HEAD:"$BRANCH"
      echo "✅ Fixes pushed to branch: $BRANCH"
    fi

    rm -f tmp/.healer-modified-files.txt
    rm -rf tmp/healer-runs
  else
    echo "No modified files - skipping git commit"
  fi
else
  echo "⚠️  GITHUB_TOKEN not set - skipping auto-commit"
fi

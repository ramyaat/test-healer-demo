#!/bin/bash

# Simple runner for Claude Agent
# This script can be run from anywhere and will handle navigation automatically

set -e

# Check required environment variables
MISSING_VARS=()
[[ -z "${ANTHROPIC_API_KEY}" && -z "${BUILDKITE_ANTHROPIC_API_KEY}" ]] && MISSING_VARS+=("ANTHROPIC_API_KEY")
[[ -z "${PROMPT_FILE}" ]] && MISSING_VARS+=("PROMPT_FILE")
[[ -z "${INPUT}" && -z "${TEST_FILE}" ]] && MISSING_VARS+=("INPUT")

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "❌ Missing required environment variables: ${MISSING_VARS[*]}"
  echo ""
  echo "Usage:"
  echo "  Required:"
  echo "    export ANTHROPIC_API_KEY=\"sk-ant-...\""
  echo "    export PROMPT_FILE=\"path/to/prompt.md\""
  echo "    export INPUT=\"path/to/input.txt\""
  echo ""
  echo "  Optional:"
  echo "    export OUTPUT_FILE=\"log/output.md\"      # default: log/claude-agent-output.md"
  echo "    export OUTPUT_DIR=\"log/\"                # default: log/"
  echo "    export REPORT_TITLE=\"My Report\"         # default: Claude Agent Execution Report"
  echo "    export MAX_ITERATIONS=\"20\"              # default: 20"
  echo ""
  echo "  ./run.sh"
  exit 1
fi

# Navigate to workspace root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

echo "📍 Workspace: $WORKSPACE_ROOT"
cd "$WORKSPACE_ROOT"

# Check if built
if [ ! -d ".buildkite/claude_agent/dist" ]; then
  echo "⚠️  Agent not built yet. Building now..."
  cd .buildkite/claude_agent
  npm install
  npm run build
  cd "$WORKSPACE_ROOT"
fi

# Run from workspace root
echo "🚀 Running Claude Agent..."
node .buildkite/claude_agent/dist/index.js

echo ""
echo "✨ Done! Check output files:"
echo "   - ${OUTPUT_FILE:-log/claude-agent-output.md}"
echo "   - ${OUTPUT_FILE:-log/claude-agent-output.html}"


#!/bin/bash
# Quick test script for vision models with saved LinkedIn captures

set -e

CAPTURE_DIR="${1:-}"
MODEL="${2:-llama3.2-vision:latest}"

if [ -z "$CAPTURE_DIR" ]; then
    echo "Usage: ./scripts/test-models.sh <capture-dir> [model-name]"
    echo ""
    echo "Example:"
    echo "  ./scripts/test-models.sh storage/ai-analysis/linkedin-*"
    echo "  ./scripts/test-models.sh storage/ai-analysis/linkedin-* llama3.2-vision:11b"
    echo ""
    echo "Available captures:"
    ls -1d storage/ai-analysis/linkedin-* 2>/dev/null || echo "  (none found)"
    exit 1
fi

# Find the most recent capture if wildcard is used
if [[ "$CAPTURE_DIR" == *"*"* ]]; then
    CAPTURE_DIR=$(ls -1dt storage/ai-analysis/linkedin-* 2>/dev/null | head -1)
    echo "📁 Using most recent capture: $CAPTURE_DIR"
fi

if [ ! -d "$CAPTURE_DIR" ]; then
    echo "❌ Error: Directory not found: $CAPTURE_DIR"
    exit 1
fi

echo "🚀 Testing vision model with saved capture"
echo "📁 Directory: $CAPTURE_DIR"
echo "🤖 Model: $MODEL"
echo ""

npx tsx scripts/test-vision-models.ts "$CAPTURE_DIR" "$MODEL"

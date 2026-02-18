#!/usr/bin/env bash
#
# Start both backend and extension watcher for local development.
# Usage: ./scripts/dev.sh   (or `make dev` from repo root)
#

set -euo pipefail

# Resolve the repo root relative to this script's location.
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# ── Pre-flight checks ──────────────────────────────────────────

if ! command -v pnpm &>/dev/null; then
  echo -e "${RED}Error: pnpm is not installed${NC}"
  echo "Install with: npm install -g pnpm"
  exit 1
fi

if ! command -v ruby &>/dev/null || [[ "$(ruby -e 'puts RUBY_VERSION')" < "3.0" ]]; then
  echo -e "${RED}Error: Ruby 3.x is required${NC}"
  echo "See backend/README.md for setup instructions"
  exit 1
fi

# ── Cleanup on exit ─────────────────────────────────────────────

cleanup() {
  echo ""
  echo "Stopping servers..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
}

trap cleanup SIGINT SIGTERM EXIT

# ── Start services ──────────────────────────────────────────────

echo -e "${BLUE}[Backend]${NC} Starting Rails server on http://localhost:3000"
(cd "$ROOT_DIR/backend" && bin/rails server -p 3000) &

sleep 2

echo -e "${GREEN}[Extension]${NC} Starting Vite watcher (output -> extension/dist/)"
(cd "$ROOT_DIR/extension" && pnpm dev)

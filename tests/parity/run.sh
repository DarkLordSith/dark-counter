#!/usr/bin/env bash
# Parity check: reference build (any git ref) vs candidate.
#
#   tests/parity/run.sh [base-ref] [candidate-url]
#
#   base-ref       git ref of the reference behaviour, default: main
#   candidate-url  URL of the build under test; default: the working tree
#                  served on http://localhost:$PORT_B/
#
# Env: RUNS (12), STEPS (250), PORT_A (8711), PORT_B (8712), CHROME (path).
set -euo pipefail
cd "$(dirname "$0")"

BASE_REF=${1:-main}
CANDIDATE_URL=${2:-}
RUNS=${RUNS:-12}
STEPS=${STEPS:-250}
PORT_A=${PORT_A:-8711}
PORT_B=${PORT_B:-8712}
REPO=$(git rev-parse --show-toplevel)

BASE_DIR=$(mktemp -d)
PIDS=""
cleanup() {
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    wait $PIDS 2>/dev/null || true
  fi
  rm -rf -- "${BASE_DIR:?}"
}
trap cleanup EXIT

echo "== эталон: $BASE_REF ($(git -C "$REPO" rev-parse --short "$BASE_REF"))"
git -C "$REPO" archive "$BASE_REF" | tar -x -C "$BASE_DIR"
python3 -m http.server "$PORT_A" --directory "$BASE_DIR" >/dev/null 2>&1 &
PIDS="$!"
BASE_URL="http://localhost:$PORT_A/"

if [ -z "$CANDIDATE_URL" ]; then
  python3 -m http.server "$PORT_B" --directory "$REPO" >/dev/null 2>&1 &
  PIDS="$PIDS $!"
  CANDIDATE_URL="http://localhost:$PORT_B/"
fi
echo "== кандидат: $CANDIDATE_URL"
sleep 1

[ -d node_modules ] || npm install --silent

status=0
echo "== 1/4 дифф-тест поведения ($RUNS × $STEPS шагов)"
node diff.mjs "$BASE_URL" "$CANDIDATE_URL" "$RUNS" "$STEPS" || status=1
echo "== 2/4 перенос сейва"
node savecompat.mjs "$BASE_URL" "$CANDIDATE_URL" || status=1
echo "== 3/4 аудио"
node audiotest.mjs "$BASE_URL" "$CANDIDATE_URL" || status=1
echo "== 4/4 смоук: мобильный экран, офлайн"
node smoke.mjs "$CANDIDATE_URL" || status=1

[ "$status" -eq 0 ] && echo "== ПАРИТЕТ: OK" || echo "== ПАРИТЕТ: ЕСТЬ РАСХОЖДЕНИЯ"
exit "$status"

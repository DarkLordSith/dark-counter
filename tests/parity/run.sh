#!/usr/bin/env bash
# Parity check: reference build (any git ref) vs candidate.
#
#   tests/parity/run.sh [base-ref] [candidate-url]
#
#   base-ref       git ref of the reference behaviour, default: main
#   candidate-url  URL of the build under test; default: the working tree,
#                  built and served on port $PORT_B
#
# A version with an npm "build" script (Vite) is built and served with
# `vite preview`; an older static version is served as plain files.
#
# Env: RUNS (12), STEPS (250), PORT_A (8711), PORT_B (8712), CHROME (path),
#      PARITY_IGNORE (css selector of intentionally new elements).
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

# serve <dir> <port> <var>: builds a Vite version or serves static files;
# stores the URL in <var> (not printed: a $(...) subshell would lose PIDS)
serve() {
  local dir=$1 port=$2 var=$3
  if [ -f "$dir/package.json" ] && grep -q '"build"' "$dir/package.json"; then
    echo "   сборка $dir" >&2
    if [ ! -d "$dir/node_modules" ]; then
      (cd "$dir" && npm ci --silent >&2)
    fi
    (cd "$dir" && npm run --silent build >/dev/null)
    # the base path ("/dark-counter/") is whatever precedes assets/ in the built page
    local base
    base=$(grep -oE 'src="[^"]*assets/' "$dir/dist/index.html" | head -1 | sed -E 's#src="(.*)assets/#\1#')
    (cd "$dir" && exec node node_modules/vite/bin/vite.js preview --port "$port" --strictPort >/dev/null 2>&1) &
    PIDS="$PIDS $!"
    printf -v "$var" '%s' "http://localhost:$port${base:-/}"
  else
    python3 -m http.server "$port" --directory "$dir" >/dev/null 2>&1 &
    PIDS="$PIDS $!"
    printf -v "$var" '%s' "http://localhost:$port/"
  fi
}

wait_for() {
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "$1" && return 0
    sleep 0.5
  done
  echo "сервер $1 не поднялся" >&2
  return 1
}

echo "== эталон: $BASE_REF ($(git -C "$REPO" rev-parse --short "$BASE_REF"))"
git -C "$REPO" archive "$BASE_REF" | tar -x -C "$BASE_DIR"
serve "$BASE_DIR" "$PORT_A" BASE_URL

if [ -z "$CANDIDATE_URL" ]; then
  serve "$REPO" "$PORT_B" CANDIDATE_URL
fi
echo "== кандидат: $CANDIDATE_URL"
wait_for "$BASE_URL"
wait_for "$CANDIDATE_URL"

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

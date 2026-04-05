#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/output/playwright/smoke"
ARTIFACTS_DIR="$OUTPUT_DIR/artifacts"
PROFILE_DIR="$OUTPUT_DIR/profile"
CONFIG_PATH="$OUTPUT_DIR/cli.config.json"
FLOW_PATH="$ROOT_DIR/scripts/playwright-smoke-flow.js"
NPM_CACHE_DIR="${PLAYWRIGHT_SMOKE_NPM_CACHE:-/tmp/codex-playwright-npm-cache}"
PORT="${PLAYWRIGHT_SMOKE_PORT:-}"
SERVER_PID=""
PLAYWRIGHT_CLI_JS=""

require_command() {
    local command_name="$1"
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
}

find_browser_executable() {
    if [[ -n "${PLAYWRIGHT_SMOKE_BROWSER:-}" ]]; then
        if [[ -x "${PLAYWRIGHT_SMOKE_BROWSER}" ]]; then
            printf '%s\n' "${PLAYWRIGHT_SMOKE_BROWSER}"
            return 0
        fi
        echo "PLAYWRIGHT_SMOKE_BROWSER is set but not executable: ${PLAYWRIGHT_SMOKE_BROWSER}" >&2
        exit 1
    fi

    local cached_browser=""
    cached_browser="$(ls -dt "$HOME"/.cache/puppeteer/chrome/*/chrome-*/"Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null | head -n 1 || true)"
    if [[ -n "$cached_browser" && -x "$cached_browser" ]]; then
        printf '%s\n' "$cached_browser"
        return 0
    fi

    local candidates=(
        "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
    )

    local candidate=""
    for candidate in "${candidates[@]}"; do
        if [[ -x "$candidate" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    echo "Unable to find a Chromium-family browser that can side-load the extension." >&2
    echo "Set PLAYWRIGHT_SMOKE_BROWSER to a Chrome for Testing or Chromium executable." >&2
    exit 1
}

pick_port() {
    python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

wait_for_server() {
    local url="$1"
    local attempt=""
    for attempt in {1..50}; do
        if curl -fsS "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 0.2
    done

    echo "Smoke test server did not become ready: $url" >&2
    exit 1
}

resolve_playwright_cli() {
    mkdir -p "$NPM_CACHE_DIR"
    export npm_config_cache="$NPM_CACHE_DIR"

    npx --yes --package @playwright/cli playwright-cli --version >/dev/null

    PLAYWRIGHT_CLI_JS="$(find "$NPM_CACHE_DIR/_npx" -path '*/node_modules/@playwright/cli/playwright-cli.js' | sort | tail -n 1)"
    if [[ -z "$PLAYWRIGHT_CLI_JS" || ! -f "$PLAYWRIGHT_CLI_JS" ]]; then
        echo "Unable to resolve playwright-cli.js from npm cache." >&2
        exit 1
    fi
}

cleanup() {
    local exit_code="$?"
    if [[ -n "$PLAYWRIGHT_CLI_JS" && -f "$PLAYWRIGHT_CLI_JS" ]]; then
        node "$PLAYWRIGHT_CLI_JS" close-all >/dev/null 2>&1 || true
    fi
    if [[ -n "$SERVER_PID" ]]; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" >/dev/null 2>&1 || true
    fi
    exit "$exit_code"
}

run_cli_checked() {
    local output=""
    if ! output="$(node "$PLAYWRIGHT_CLI_JS" --config "$CONFIG_PATH" "$@" 2>&1)"; then
        printf '%s\n' "$output"
        return 1
    fi

    printf '%s\n' "$output"

    if printf '%s\n' "$output" | rg -q '^### Error$'; then
        return 1
    fi
}

require_command npx
require_command node
require_command python3
require_command curl

BROWSER_EXECUTABLE="$(find_browser_executable)"
PORT="${PORT:-$(pick_port)}"
BASE_URL="http://127.0.0.1:${PORT}"
WEB_URL="${BASE_URL}/manual-tests/web-smoke.html"

mkdir -p "$ARTIFACTS_DIR" "$PROFILE_DIR"

cat > "$CONFIG_PATH" <<EOF
{
  "browser": {
    "browserName": "chromium",
    "userDataDir": "$PROFILE_DIR",
    "launchOptions": {
      "executablePath": "$BROWSER_EXECUTABLE",
      "headless": false,
      "args": [
        "--disable-extensions-except=$ROOT_DIR/chrome-extension",
        "--load-extension=$ROOT_DIR/chrome-extension"
      ]
    },
    "contextOptions": {
      "viewport": {
        "width": 1440,
        "height": 960
      }
    }
  },
  "outputDir": "$ARTIFACTS_DIR",
  "outputMode": "file",
  "allowUnrestrictedFileAccess": true,
  "timeouts": {
    "action": 10000,
    "navigation": 30000
  }
}
EOF

trap cleanup EXIT

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT_DIR" >"$ARTIFACTS_DIR/server.log" 2>&1 &
SERVER_PID="$!"
wait_for_server "$WEB_URL"

resolve_playwright_cli

echo "Running Playwright smoke test against $WEB_URL"
echo "Browser: $BROWSER_EXECUTABLE"
echo "Artifacts: $ARTIFACTS_DIR"

run_cli_checked open "$WEB_URL"
run_cli_checked run-code --filename="$FLOW_PATH"

echo "Playwright smoke test passed."

#!/usr/bin/env bash
# One-command setup for the local video connector + generation models.
#
#   ./setup.sh            # install everything (API venv + model venv + system deps)
#   ./setup.sh --update   # upgrade the model + API packages in place (maintain)
#   ./setup.sh --api-only # only the light API venv (no Kokoro/FLUX models)
#
# Full generation (Kokoro voiceover, FLUX images) is Apple-Silicon only — it uses MLX.
# On other platforms this sets up the API venv so the server runs; model install is skipped
# with a clear note. After setup, start the server with ./run_api.sh (serves :3333).
set -euo pipefail
cd "$(dirname "$0")"

MODE="all"
for arg in "$@"; do
  case "$arg" in
    --update) MODE="update" ;;
    --api-only) MODE="api-only" ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*"; }

is_apple_silicon() { [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; }

# --- system deps (Homebrew) — only what the models need, only on macOS ---------------
ensure_system_deps() {
  if ! is_apple_silicon; then return 0; fi
  if ! command -v brew >/dev/null 2>&1; then
    warn "Homebrew not found — install it from https://brew.sh, then re-run. Skipping system deps."
    return 0
  fi
  for pkg in python@3.12 espeak-ng; do
    if brew list --versions "$pkg" >/dev/null 2>&1; then
      say "$pkg already installed"
    else
      say "installing $pkg via Homebrew…"
      brew install "$pkg"
    fi
  done
}

# Pick a Python 3.12+ interpreter, preferring Homebrew's on Apple Silicon.
pick_python() {
  for cand in /opt/homebrew/bin/python3.12 python3.12 "${PYTHON:-python3}"; do
    if command -v "$cand" >/dev/null 2>&1; then echo "$cand"; return 0; fi
  done
  echo "python3"
}

# --- API venv (fastapi/uvicorn/pydantic/sqlalchemy) ---------------------------------
setup_api_venv() {
  local py; py="$(pick_python)"
  if [ ! -d ".venv-api" ]; then
    say "creating .venv-api ($py)…"
    "$py" -m venv .venv-api
  fi
  say "installing connector API deps…"
  .venv-api/bin/pip install --upgrade pip >/dev/null
  .venv-api/bin/pip install ${UPGRADE:-} -r requirements-api.txt
}

# --- model venv (kokoro + mflux + soundfile) — Apple Silicon only --------------------
setup_model_venv() {
  if ! is_apple_silicon; then
    warn "Not Apple Silicon — skipping model install. Voiceover/image generation won't run here."
    warn "The server and script/build steps still work."
    return 0
  fi
  local py; py="$(pick_python)"
  if [ ! -d ".venv" ]; then
    say "creating model venv .venv ($py)…"
    "$py" -m venv .venv
  fi
  say "installing model deps (kokoro, soundfile, mflux) — this can take a few minutes…"
  .venv/bin/pip install --upgrade pip >/dev/null
  .venv/bin/pip install ${UPGRADE:-} -r requirements-models.txt
  say "model weights (Kokoro-82M, FLUX.1-schnell) download automatically on first generation."
}

case "$MODE" in
  update)   UPGRADE="--upgrade"; ensure_system_deps; setup_api_venv; setup_model_venv ;;
  api-only) ensure_system_deps; setup_api_venv ;;
  all)      ensure_system_deps; setup_api_venv; setup_model_venv ;;
esac

say "done. Start the connector with:  ./run_api.sh   (serves http://localhost:3333)"

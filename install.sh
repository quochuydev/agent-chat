#!/usr/bin/env bash
# One-line installer for the AI Video Agent connector — no git clone needed.
#
#   curl -fsSL https://raw.githubusercontent.com/quochuydev/agent-chat/main/install.sh | bash
#
# Downloads the latest release tarball, extracts it, and runs setup.sh (which builds the
# API + model venvs). For a PRIVATE repo, provide a token with repo read access:
#
#   GITHUB_TOKEN=ghp_xxx bash -c "$(curl -fsSL https://raw.githubusercontent.com/quochuydev/agent-chat/main/install.sh)"
#
# Env overrides: DEST (install dir, default ~/agent-chat-connector), VERSION (a tag, default latest).
set -euo pipefail

REPO="quochuydev/agent-chat"
DEST="${DEST:-$HOME/agent-chat-connector}"
API="https://api.github.com/repos/$REPO"

say()  { printf '\033[1;36m[install]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[install]\033[0m %s\n' "$*" >&2; exit 1; }

for bin in curl tar python3; do
  command -v "$bin" >/dev/null 2>&1 || die "missing required tool: $bin"
done

AUTH=()
[ -n "${GITHUB_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $GITHUB_TOKEN")

# Resolve the release (a specific tag, or the latest).
if [ -n "${VERSION:-}" ]; then
  REL_URL="$API/releases/tags/$VERSION"
else
  REL_URL="$API/releases/latest"
fi

say "looking up release from $REPO…"
REL_JSON="$(curl -fsSL "${AUTH[@]}" -H "Accept: application/vnd.github+json" "$REL_URL")" \
  || die "could not fetch release info. Private repo? set GITHUB_TOKEN. No releases yet? create one."

# Find the connector tarball asset's API url (works with tokens for private repos).
ASSET_URL="$(printf '%s' "$REL_JSON" \
  | python3 -c 'import sys,json
d=json.load(sys.stdin)
a=[x for x in d.get("assets",[]) if x["name"].startswith("agent-chat-connector") and x["name"].endswith(".tar.gz")]
print(a[0]["url"] if a else "")')"
[ -n "$ASSET_URL" ] || die "no agent-chat-connector-*.tar.gz asset on that release."

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
say "downloading connector…"
curl -fsSL "${AUTH[@]}" -H "Accept: application/octet-stream" "$ASSET_URL" -o "$TMP/connector.tar.gz" \
  || die "download failed."

mkdir -p "$DEST"
say "extracting to $DEST…"
tar -xzf "$TMP/connector.tar.gz" -C "$DEST" --strip-components=1

say "running setup…"
( cd "$DEST" && ./setup.sh )

cat <<EOF

✅ Installed to: $DEST

Start the connector (keep it running while you make videos):

    cd "$DEST" && ./run_api.sh      # serves http://localhost:3333

To update later:  cd "$DEST" && ./setup.sh --update
EOF

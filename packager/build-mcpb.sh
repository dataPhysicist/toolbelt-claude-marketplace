#!/usr/bin/env bash
# Build a Claude .mcpb for one Toolbelt assistant. Dependency-free server is static;
# only the manifest varies per agent. Run inside Toolbelt execute_code (shell) or locally.
#
# Required env: AGENT_NAME
# Optional env: AGENT_DESC, TOOL_PREFIX (default = initials of AGENT_NAME), BASE_URL,
#               ASSETS_DIR (where server.js/icon.png live; default ./), OUT (default /tmp/output)
# NOTE: workspace ID is NOT a build input — the user enters it (with their API key) at
#       install, because the same agent has a different workspace ID in each Toolbelt org.
# Output: $OUT/<slug>.mcpb  AND  $OUT/<slug>.mcpb.b64 (base64 for upload_file_to_storage)
set -euo pipefail

: "${AGENT_NAME:?set AGENT_NAME}"
ASSETS_DIR="${ASSETS_DIR:-.}"; OUT="${OUT:-/tmp/output}"; BASE_URL="${BASE_URL:-https://toolbelt.apexti.com}"
slug=$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
prefix="${TOOL_PREFIX:-$(printf '%s' "$AGENT_NAME" | tr -cs '[:alnum:]' ' ' | awk '{for(i=1;i<=NF;i++)printf "%s",tolower(substr($i,1,1))}')_}"
VER=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('version','?'))" "$ASSETS_DIR/manifest.template.json" 2>/dev/null || echo "?")
desc="${AGENT_DESC:-$AGENT_NAME — a Toolbelt assistant.} Powered by Apexti (apexti.com) · v$VER"

export PREFIX="$prefix" SLUG="$slug" DESC="$desc" BASE_URL
work=$(mktemp -d); mkdir -p "$work/server" "$OUT"
cp "$ASSETS_DIR/server.js" "$work/server/index.js"
cp "$ASSETS_DIR/icon.png" "$work/icon.png"

# Assemble manifest with python3 (robust JSON; works in Toolbelt's execute_code sandbox,
# where `node` is a Deno shim that rejects CommonJS require). Stamp name/desc/prefix; bake
# the agent name + prefix + self-routing desc/triggers. Workspace ID stays user-entered.
TPL="$ASSETS_DIR/manifest.template.json" OUTM="$work/manifest.json" python3 <<'PY'
import json, os
m = json.load(open(os.environ['TPL']))
name = os.environ['AGENT_NAME']; prefix = os.environ['PREFIX']; slug = os.environ['SLUG']
m['name'] = 'apexti-' + slug
m['display_name'] = name
m['description'] = os.environ['DESC']
env = m['server']['mcp_config']['env']
env['TOOLBELT_ASSISTANT_NAME'] = name
env['TOOLBELT_TOOL_PREFIX'] = prefix
env['TOOLBELT_BASE_URL'] = os.environ['BASE_URL']
if os.environ.get('AGENT_DESC'): env['TOOLBELT_ASSISTANT_DESC'] = os.environ['AGENT_DESC']
if os.environ.get('AGENT_TRIGGERS'): env['TOOLBELT_ASSISTANT_TRIGGERS'] = os.environ['AGENT_TRIGGERS']
m['user_config'].pop('assistant_name', None)
m['user_config']['workspace_id']['description'] = name + "'s workspace ID in your Toolbelt org (dashboard URL: workspaceId=…)."
if m.get('prompts'):
    for key in ('text', 'description'):
        if key in m['prompts'][0]:
            m['prompts'][0][key] = m['prompts'][0][key].replace('load_persona', prefix + 'load_persona')
open(os.environ['OUTM'], 'w').write(json.dumps(m, indent=2) + "\n")
PY

( cd "$work" && zip -qry "$OUT/$slug.mcpb" manifest.json server icon.png )
base64 < "$OUT/$slug.mcpb" | tr -d '\n' > "$OUT/$slug.mcpb.b64"
rm -rf "$work"
echo "built: $OUT/$slug.mcpb  (name=apexti-$slug prefix=$prefix; workspace ID entered at install)"
echo "b64:   $OUT/$slug.mcpb.b64  ($(wc -c < "$OUT/$slug.mcpb.b64") bytes)"

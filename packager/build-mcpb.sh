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
desc="${AGENT_DESC:-$AGENT_NAME — a Toolbelt assistant.} Powered by Apexti (apexti.com)."

export PREFIX="$prefix" SLUG="$slug" DESC="$desc" BASE_URL
work=$(mktemp -d); mkdir -p "$work/server" "$OUT"
cp "$ASSETS_DIR/server.js" "$work/server/index.js"
cp "$ASSETS_DIR/icon.png" "$work/icon.png"

# Assemble manifest: stamp name/desc/prefix; bake ONLY the agent name + prefix. The
# workspace ID stays a user_config field (entered at install — differs per org).
node - "$ASSETS_DIR/manifest.template.json" "$work/manifest.json" <<NODE
const fs=require("fs");
const [,,tpl,out]=process.argv;
const m=JSON.parse(fs.readFileSync(tpl,"utf8"));
const name=process.env.AGENT_NAME, prefix=process.env.PREFIX, desc=process.env.DESC, slug=process.env.SLUG, base=process.env.BASE_URL;
m.name="apexti-"+slug; m.display_name=name; m.description=desc;
m.server.mcp_config.env.TOOLBELT_ASSISTANT_NAME=name;
m.server.mcp_config.env.TOOLBELT_TOOL_PREFIX=prefix;
m.server.mcp_config.env.TOOLBELT_BASE_URL=base;
delete m.user_config.assistant_name; // name is baked
m.user_config.workspace_id.description=name+"'s workspace ID in your Toolbelt org (dashboard URL: workspaceId=…).";
if(m.prompts&&m.prompts[0]){m.prompts[0].text=m.prompts[0].text.replace("load_persona",prefix+"load_persona");m.prompts[0].description=m.prompts[0].description.replace("load_persona",prefix+"load_persona");}
fs.writeFileSync(out,JSON.stringify(m,null,2)+"\n");
NODE

( cd "$work" && zip -qry "$OUT/$slug.mcpb" manifest.json server icon.png )
base64 < "$OUT/$slug.mcpb" | tr -d '\n' > "$OUT/$slug.mcpb.b64"
rm -rf "$work"
echo "built: $OUT/$slug.mcpb  (name=apexti-$slug prefix=$prefix ws=${WORKSPACE_ID:0:8})"
echo "b64:   $OUT/$slug.mcpb.b64  ($(wc -c < "$OUT/$slug.mcpb.b64") bytes)"

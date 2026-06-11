#!/usr/bin/env bash
# One entry point the Claude-Packager wrench calls via execute_code. Builds either a
# self-routing .mcpb (FORMAT=mcpb) or a full plugin .plugin (FORMAT=plugin, connector +
# routing skill + bundled installer), base64-encodes it, and prints the base64 between
# markers for upload_file_to_storage.
#
# Required env: AGENT_NAME
# Optional env: AGENT_DESC, AGENT_TRIGGERS, FORMAT (mcpb|plugin, default mcpb),
#               TOOL_PREFIX (default initials), BASE_URL
# Self-contained: fetches the build kit from the public repo (no local checkout needed).
set -euo pipefail

REPO="${REPO_RAW:-https://raw.githubusercontent.com/dataPhysicist/toolbelt-for-claude/main/packager}"
FORMAT="${FORMAT:-mcpb}"
: "${AGENT_NAME:?set AGENT_NAME}"
work=$(mktemp -d); cd "$work"
for f in server.js manifest.template.json build-mcpb.sh SKILL.template.md; do curl -fsSL "$REPO/$f" -o "$f"; done
curl -fsSL "$REPO/icon.png" -o icon.png
slug=$(printf '%s' "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
prefix="${TOOL_PREFIX:-$(printf '%s' "$AGENT_NAME" | tr -cs '[:alnum:]' ' ' | awk '{for(i=1;i<=NF;i++)printf "%s",tolower(substr($i,1,1))}')_}"

# Always build the .mcpb (the connector).
AGENT_NAME="$AGENT_NAME" AGENT_DESC="${AGENT_DESC:-}" AGENT_TRIGGERS="${AGENT_TRIGGERS:-}" \
  TOOL_PREFIX="$prefix" ASSETS_DIR="$work" OUT="$work/out" bash build-mcpb.sh >/dev/null

if [ "$FORMAT" = "plugin" ]; then
  pdir="$work/$slug"
  mkdir -p "$pdir/.claude-plugin" "$pdir/skills/$slug"
  desc="${AGENT_DESC:-$AGENT_NAME — a Toolbelt assistant.} Powered by Apexti (apexti.com)."
  SLUG="$slug" DESC="$desc" PJSON="$pdir/.claude-plugin/plugin.json" TPL="$work/SKILL.template.md" SKILL="$pdir/skills/$slug/SKILL.md" PREFIX="$prefix" \
  python3 <<'PY'
import json, os, re
slug=os.environ['SLUG']; name=os.environ['AGENT_NAME']; desc=os.environ['DESC']
json.dump({"name":slug,"description":desc,"version":"1.0.0","author":{"name":"Apexti","url":"https://apexti.com"},"homepage":"https://apexti.com"},
          open(os.environ['PJSON'],'w'), indent=2); open(os.environ['PJSON'],'a').write("\n")
s=open(os.environ['TPL']).read()
m={"AGENT":name,"SLUG":slug,"PREFIX":os.environ['PREFIX'],"DESC":os.environ.get('AGENT_DESC') or name,
   "TRIGGERS":os.environ.get('AGENT_TRIGGERS') or (name+" tasks"),"WORKSPACE_ID":"(entered at install)"}
open(os.environ['SKILL'],'w').write(re.sub(r'\{\{(\w+)\}\}', lambda x: m.get(x.group(1), x.group(0)), s))
PY
  cp "$work/out/$slug.mcpb" "$pdir/skills/$slug/$slug.mcpb"
  ( cd "$work" && zip -qry "$work/out/$slug.plugin" "$slug" )
  artifact="$work/out/$slug.plugin"
else
  artifact="$work/out/$slug.mcpb"
fi

echo "ARTIFACT_NAME=$(basename "$artifact")"
echo "B64_START"
base64 < "$artifact" | tr -d '\n'
echo ""
echo "B64_END"
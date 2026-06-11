# Packager assets — the build kit the Claude-Packager assistant uses

These files let a Toolbelt assistant build Claude `.mcpb` connectors (and full plugins)
for any assistant the user can access, entirely from inside a chat, using `execute_code`.

| File | Role |
|---|---|
| `server.js` | The dependency-free MCP proxy. Identical for every agent; only the manifest varies. Keep in sync with `toolbelt-assistant-mcpb/server/index.js`. |
| `manifest.template.json` | Base `.mcpb` manifest; the build stamps name/workspace/prefix/description. |
| `icon.png` | Default Apexti icon (512×512). |
| `build-mcpb.sh` | Assembles a `.mcpb` from the above given `AGENT_NAME` + `WORKSPACE_ID`. Outputs the `.mcpb` and a base64 file for `upload_file_to_storage`. |
| `SKILL.template.md` | Routing skill with `{{PLACEHOLDERS}}` for Tier-2 full plugins. **Must track `build-plugins.mjs` `skillMd()`** — they are two copies of the same skill text. |

## How the assistant uses these (verified mechanics)

`execute_code` runs in an isolated Deno/bash sandbox with `node`, `zip`, `curl`, and
network — but **no access to Toolbelt storage**. So the build fetches these assets from
the public repo raw URLs at build time (the repo is the source of truth), assembles the
`.mcpb`, base64-encodes it, and prints the base64. The assistant then calls
`upload_file_to_storage` (base64 → file) and `get_storage_file_url` to hand the user a
download link. All four steps are verified working.

Raw base: `https://raw.githubusercontent.com/dataPhysicist/toolbelt-for-claude/main/packager/`

## Keeping server.js current

When `toolbelt-assistant-mcpb/server/index.js` changes (new proxy version), copy it here
and commit, so freshly packaged `.mcpb` files carry the latest proxy. A CI check or a
one-line `cp` in the build workflow is the durable fix (roadmap).

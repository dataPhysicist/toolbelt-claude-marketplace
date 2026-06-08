# Toolbelt — Claude Desktop Extension (.mcpb)

A native **Claude Desktop** install for the Toolbelt router. Stores your API key in the **OS keychain**,
sends it as an `Authorization: Bearer` header (never in a URL), and **carries the router behavior itself**
so there's nothing to paste.

## How it works — a thin local bridge (`bridge.js`)
Desktop Extensions run a **local stdio** server; there's no remote-HTTP server type. So `bridge.js` is a
small MCP server (on `@modelcontextprotocol/sdk`) that connects *out* to the remote Toolbelt MCP endpoint
and proxies traffic, adding:

```
Claude Desktop ──stdio──> bridge.js ──HTTPS + Bearer──> toolbelt.apexti.com/api/workspaces/<id>/mcp
   │  one ask_<agent> tool per org assistant (toggle agents on/off; delegate→wait handled internally)
   │  curated core tools (read_storage_file, toolbelt, toolbelt_help, manage_delegations) — rest hidden
   │  manage_delegations description rewritten (prefer ask_<agent>; wait/correlationId, never sleep)
   │  bundled `toolbelt` prompt (>>toolbelt) = full router guidance
   └  server `instructions` (honored by Claude Code/VS Code; Desktop ignores)
```

1. **Per-agent tools.** At connect, the bridge calls `list_assistants` and surfaces each agent as its own
   **`ask_<name>`** tool (friendly name; description = the agent's purpose). The user can **toggle
   individual agents on/off** in Settings → Extensions. Calling `ask_<agent>({ task, model? })` runs the
   `create → wait` delegation internally and returns the agent's answer — no correlationId handling for
   the model. If the roster can't be parsed, it falls back to exposing `manage_delegations`.
2. **Curated surface.** Only the core tools above pass through; storage writes, `duckdb_*`, `wrench_*`,
   service tools, and connection/workflow setup are hidden so the model can't wander.
3. **Org name.** Optional `Org name` field at install; if left blank the router learns it at runtime via
   `toolbelt list_organizations`. Used so Claude refers to your org by name.

## Install (single-file .mcpb — recommended)
```bash
npm install                  # vendor the SDK into node_modules/
npx @anthropic-ai/mcpb pack  # → desktop-extension.mcpb
```
Then Claude Desktop → **Settings → Extensions → Install Extension** → pick the `.mcpb` → enter org name
(optional), hub workspace ID, and API key. Each agent then appears as an `ask_<name>` tool you can toggle.

## Per-org branded build (names it in the Settings list)
Claude's Settings-list label is the manifest `display_name` (static per build). To get a per-org name
there, build a branded copy:
```bash
node pack-org.mjs --org "Acme Corp" --workspace <hub-workspace-id>   # → acme-corp.mcpb
```
- Stamps `display_name` → **"Toolbelt — Acme Corp"** (shows named in Settings).
- Bakes the org name and (with `--workspace`) the workspace ID, so the user only enters their **API key**.
- Restores the base `manifest.json` afterward. Omit `--workspace` to keep that field at install.

## Status
- Verified locally: bridge handshake, `instructions` + bundled prompt, org-name injection, graceful
  upstream failure; helper/slug logic; the `pack-org.mjs` generator (branded manifest + restore).
- **Needs a live test:** the per-agent tool generation, delegation, and roster parse against a real
  Toolbelt endpoint with your key. Watch `[toolbelt-bridge]` logs; if the roster doesn't parse it falls
  back to `manage_delegations` (still functional).

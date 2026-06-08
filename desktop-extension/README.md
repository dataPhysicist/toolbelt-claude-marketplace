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
   │  CONSTANT tools (any org size): list_agents · ask_agent · check_agent_result · set_pinned_agents
   │  + one ask_<name> tool per PINNED agent only (not one per agent)
   │  read_storage_file (Model Auto-Pilot rules) · toolbelt + toolbelt_help (ad-hoc org management)
   │  delegate→wait handled inside · progress notifications while waiting · auto-reconnect · tools/list_changed
   │  bundled `toolbelt` prompt (>>toolbelt) + server `instructions` (Code/VS Code honor; Desktop ignores)
```

1. **Scalable tool model (constant size).** Instead of one tool per agent (which floods the list and
   context at 50–100 agents), the bridge exposes a fixed set: `list_agents(query?)` to discover,
   `ask_agent({ agent, task, model? })` to delegate to any agent by name/id, and `check_agent_result`
   for long jobs. `ask_agent` resolves the name against a cached roster, runs `create → wait` internally,
   emits **progress notifications** while waiting, and returns the answer (or a `correlationId`).
2. **Pinned favorites.** `set_pinned_agents([...])` pins a few agents, which then also appear as their own
   one-click `ask_<name>` tools. Pins persist in `~/.toolbelt-claude/pins.json` (keyed by workspace, so
   they survive extension updates) and can be **pre-baked** by the operator (`pack-org.mjs --pin "…"` →
   `TOOLBELT_PINNED_AGENTS`) or seeded via the optional install field.
3. **Curated, management available.** Hidden: `manage_delegations`, storage writes, `duckdb_*`, `wrench_*`,
   service tools, connection/workflow setup. The bridge uses `manage_delegations`/`list_assistants`
   upstream itself; `toolbelt`/`toolbelt_help` stay exposed for ad-hoc management.
4. **Resilient.** Auto-reconnects if the upstream session drops (retry-once); generic tools list even when
   the upstream is momentarily down; clear message on a 401.
5. **Org name.** Optional `Org name` field at install; if blank the bridge learns it from
   `list_organizations`. Used so Claude refers to your org by name.

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

## Status (v0.10)
- **Verified locally:** downstream handshake, bundled prompt, graceful upstream failure; the roster
  transform against real org data (recent-first ordering, slug names, collision handling); the
  session/auth error classifiers; packaging (`.mcpbignore` excludes `pack-org.mjs`/README; icon + node
  compatibility in the manifest).
- **Needs a live test (your key):** the delegation round-trip (`create → wait → responseContent`),
  `check_agent_result`, progress-notification rendering, and reconnect after a real session drop. Watch
  `[toolbelt-bridge]` logs; if the roster can't be parsed it falls back to the core tools (still usable).

# Toolbelt — Claude Desktop Extension (.mcpb)

A native **Claude Desktop** install that brings **one Toolbelt agent** — its tools, wrenches/playbooks, and
persona — into Claude. Stores your API key in the **OS keychain**, sends it as an `Authorization: Bearer`
header (never in a URL). **One extension = one agent.**

## How it works — a thin local bridge (`bridge.js`)
Desktop Extensions run a **local stdio** server. `bridge.js` (on `@modelcontextprotocol/sdk`) connects out
to **one agent's** per-workspace Toolbelt endpoint and:

```
Claude Desktop ──stdio──> bridge.js ──HTTPS + Bearer──> toolbelt.apexti.com/api/workspaces/<agentId>/mcp
   │  TOOLS: faithful passthrough of the agent's own governed tools (its connected services,
   │         wrenches/playbooks, storage) — exactly what Toolbelt serves for this workspace
   │  PERSONA: the agent's systemPrompt (via get_assistant) → server `instructions` + an
   │           `act_as_<agent>` prompt, so Claude works *as* the agent
   │  auto-reconnect if the session drops · keychain Bearer auth · clear message on 401
```

1. **Tools = passthrough.** `ListTools` forwards the agent's `tools/list` as-is; `CallTool` forwards to
   upstream. No client-side filtering — whatever the agent is configured for in Toolbelt is what appears
   (permissions/audit/spend enforced server-side). Optional `TOOLBELT_HIDE_MANAGEMENT=1` hides the
   org-management meta-tools (`manage_delegations`/`manage_workflows`/`manage_assistant_connections`);
   default off, since an agent's persona may itself use them.
2. **Persona.** At startup the bridge calls `toolbelt get_assistant` for this workspace and serves the
   agent's `systemPrompt`. On **Claude Code / VS Code** it rides in the initialize `instructions`
   (auto-applied); on the **desktop app** (which ignores `instructions`) you load it by running the
   `act_as_<agent>` prompt (e.g. `>>act_as_chief_of_staff`) — or paste it into a Project.
3. **The agent's files/memory.** Its `Config` / `Memory` / `Skills` storage files come through the storage
   tools, so Claude-as-the-agent can read them when the persona references them.
4. **Resilient.** Auto-reconnects if the upstream session drops (retry-once); clear message on a 401.

## Install (single-file .mcpb — recommended)
```bash
npm install                  # vendor the SDK into node_modules/
npx @anthropic-ai/mcpb pack  # → desktop-extension.mcpb
```
Then Claude Desktop → **Settings → Extensions → Install Extension** → pick the `.mcpb` → enter the agent's
workspace ID + API key (and optional agent name). Run `>>act_as_<agent>` to become the agent.

## Per-AGENT branded build (names it in the Settings list)
The Settings-list label is the manifest `display_name` (static per build). Build a branded per-agent copy:
```bash
node pack-agent.mjs --agent "Chief-of-Staff" --workspace <agent-workspace-id>   # → chief-of-staff.mcpb
```
- Stamps `display_name` → **"Toolbelt — Chief-of-Staff"** and bakes `TOOLBELT_AGENT_NAME` + the workspace,
  so the customer only enters their API key. Hand them the `.mcpb`; they Install Extension and run
  `>>act_as_chief_of_staff`.

## Status
- Verified locally: handshake serves the persona wrapper as `instructions`, the `act_as_<agent>` prompt
  returns it, tools pass through, graceful with a dead upstream. `get_assistant` returns `systemPrompt`
  (verified live).
- **Needs a live test:** install a per-agent `.mcpb` against a real agent → its tools appear → `act_as`
  loads the persona → it works as the agent using its tools, wrenches, and files.

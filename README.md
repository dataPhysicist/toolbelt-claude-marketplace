# Toolbelt for Claude Desktop

**Use your organization's governed Toolbelt agents right inside the Claude desktop app.**

Toolbelt is your team's AI operating layer — agents with their own memory, connected tools, guardrails,
audit, and spend control. This brings that **runtime into Claude Desktop**, so you stay in the chat you
already use and still get what raw Claude can't give a business: shared agents, permissions, audit, spend
control, and connected tools. *Same chat, now run like a business.*

> **Claude is the front door; Toolbelt is the brain.** You *use* your org's agents here; you *build and
> govern* them in Toolbelt. Nothing about an agent is recreated in Claude — its brain stays server-side.

---

## What it is

Your Toolbelt org's agents become usable inside Claude Desktop. Ask Claude something one of your agents
handles, and it routes the work to that agent — which runs in Toolbelt with its full context — and returns
the answer.

| | Raw Claude | Claude + Toolbelt |
|---|---|---|
| **Agents** | one general assistant | your org's purpose-built agents, shared across the team |
| **Memory & tools** | per chat | each agent's own memory + connected tools (Gmail, Slack, CRM, …) |
| **Governance** | none | permissions, audit, per-tool restrictions — enforced server-side |
| **Spend** | your plan | metered and governed at the org level |
| **Model** | fixed | the optimal model per task (Model Auto-Pilot, from your org's rules) |

## How it works

A small **local bridge** — shipped as a one-click Desktop Extension — connects Claude Desktop to your
Toolbelt org. Your API key lives in the OS keychain and is sent as a Bearer header (never in a URL).

```
 You ─► Claude Desktop ──► Toolbelt bridge (local) ──HTTPS + Bearer──► your Toolbelt org
                            │  • each agent = an  ask_<name>  tool (toggle on/off)
                            │  • picks the optimal model per task (Model Auto-Pilot)
                            │  • delegation handled for you (no plumbing to learn)
 You ◄── answer ◄───────────┘ ◄──────────── the agent runs in Toolbelt (its own memory / tools / guardrails)
```

- **Each agent is a tool.** Your org's agents appear as `ask_<name>` tools you can enable/disable
  individually in Settings → Extensions.
- **Right model, automatically.** Claude picks the best model per task from your org's rules and previews
  paid work before spending.
- **Governance stays in Toolbelt.** Permissions, audit, and spend control are enforced server-side,
  whichever chat you use.

## Install (Claude desktop app)

**For end users — you received a `.mcpb` file from your provider.** No terminal needed.
1. Claude Desktop → **Settings → Extensions → Install Extension** → select the `.mcpb` file.
2. Enter what it asks for — your **API key** (and workspace ID / org name if they aren't pre-filled).
3. Ask Claude to do something one of your agents handles — it routes to the right agent.

**For operators / builders — packaging it yourself.**
1. Build the extension once:
   ```bash
   cd desktop-extension && npm install && npx @anthropic-ai/mcpb pack
   ```
   For a per-customer branded copy (their org name in the Settings list, workspace baked in so they only
   enter a key):
   ```bash
   node pack-org.mjs --org "Acme Corp" --workspace <hub-workspace-id>
   ```
2. **Settings → Extensions → Install Extension** → select the `.mcpb` → enter org name / workspace ID / key.
3. Hand the branded `.mcpb` to your customers — they install it with the end-user steps above.

Full steps, the no-build custom-connector fallback, and troubleshooting: **[DESKTOP.md](./DESKTOP.md).**

## Model Auto-Pilot

Before each task, Claude picks the optimal model and passes it to your agent (Toolbelt validates it and
falls back if it isn't allowed). The rules — model catalog, prices, quality floors — live in your org's
`ModelAutoPilot.md` in Toolbelt storage, so each org customizes its own and nothing goes stale. Paid work
gets a one-line preview ("flight plan") before spending; trivial/free work just runs. Reporting is honest:
it names the model and its published price tier (e.g. "free", "~68% cheaper per token"), never a guessed
"tokens saved."

## How to think about context (FAQ)

You don't create skill files or "set up" the agent inside Claude. **The agent's expertise, memory, tools,
and guardrails are configured in Toolbelt** when you build it, and are automatically in play when Claude
calls it. The only thing on the Claude side is thin *routing* guidance, and the extension bundles that for
you — nothing to paste.

## What's inside

```
desktop-extension/         # the Claude Desktop extension — the main way to use this
  ├── bridge.js            #   local MCP proxy: ask_<agent> tools, Model Auto-Pilot, governance passthrough
  ├── router-instructions.md  #   bundled routing guidance (prompt + server instructions)
  ├── manifest.json · package.json   #   MCPB manifest + SDK dependency
  └── pack-org.mjs         #   per-org branded build (names it in the Settings list)
DESKTOP.md                 # full desktop setup + troubleshooting
plugins/toolbelt-get-started/   # Appendix A — the Claude Code (CLI) path
experiments/               # diagnostics (e.g. the MCP-instructions probe)
```

---

## Appendix A — Claude Code (CLI)

If you use **Claude Code** (the terminal CLI) instead of the desktop app, the same org connects via a
plugin. This is the one place the legacy "marketplace" command applies — Claude Code installs plugins from
a catalog repo:

```text
/plugin marketplace add <github-user>/toolbelt-for-claude
/plugin install toolbelt@apexti-toolbelt
/toolbelt:get-started
```

You're prompted for your hub workspace ID + API key (kept in your keychain); the plugin auto-applies the
router skill. Details: [plugins/toolbelt-get-started/README.md](./plugins/toolbelt-get-started/README.md).
*(The desktop app has no `/plugin` or marketplace — use the Extension above.)*

## Appendix B — Two connection methods & architecture

Both keep each agent's brain in Toolbelt; they differ in how the routing context reaches Claude.

**Method B — Desktop Extension (recommended, "Install" above).** A local bridge that carries the behavior
itself: per-agent `ask_<name>` tools, a curated tool surface, keychain Bearer auth, a bundled prompt.
Nothing to paste.

```
 You ─► Claude ──stdio──► bridge.js (local) ──HTTPS + Bearer──► Toolbelt MCP endpoint
                           │  ask_<agent> tools · curated/rewritten surface · delegate→wait inside
 You ◄── answer ◄──────────┘ ◄──────────────────────────────── target agent runs (its own brain)
```

**Method A — Custom Connector + instructions (no build, or claude.ai/Claude Code).** Claude talks directly
to the Toolbelt endpoint; you supply routing context by pasting the router skill into a **Project's custom
instructions** (Desktop/claude.ai) or via the plugin (Code). Full raw tool surface; key in the URL on the
Desktop connector dialog.

```
   ┌─ Project custom instructions = the router skill (you paste it; Code auto-applies)
   ▼
 You ─► Claude ──── MCP (Bearer / URL key) ────► Toolbelt MCP endpoint (full raw tool surface)
 You ◄── answer ◄──────────────────────────────── hub assistant → delegates to target agent
```

| | **Method B — Extension** (recommended) | **Method A — Connector / plugin** |
|---|---|---|
| Where | Claude Desktop | Desktop, claude.ai, Claude Code |
| Routing context | bundled (nothing to paste) | paste the skill into a Project (or plugin) |
| Agents | one `ask_<name>` tool each (toggle) | one connection; delegate by instruction |
| Key | keychain, Bearer header | in the URL (Desktop connector) |
| Build step | yes (`npm install` + pack) | none |

**Rule of thumb: the Extension to live in it; the Connector to try it fast or on a non-desktop client.**

## Appendix C — Roadmap & server-side notes

1. **Desktop Extension (Method B)** — ✅ built (`desktop-extension/`, v0.9): per-agent `ask_<name>` tools,
   curated surface, tool-description rewrites, bundled prompt, keychain Bearer auth, optional org name.
   *Pending a live test against a real org endpoint.*
2. **Per-assistant toggles** — ✅ each agent is its own `ask_<name>` tool.
3. **Per-org branded build** — ✅ `desktop-extension/pack-org.mjs` (names it in the Settings list, bakes the
   workspace ID).
4. **Probe result (recorded):** Claude Desktop does **not** inject the MCP `instructions` field, so the
   bridge relies on per-agent tools + rewrites, not auto-injection (`experiments/instructions-probe/`).
5. **Server-side graduation** (scoped tokens, accurate $-saved reporting, streaming delegate, spend-cap
   enforcement on the MCP path) — tracked in the Toolbelt repo at `docs/claude-integration-roadmap.md`
   (evidence in `docs/claude-integration-findings.md`).

> **Note on naming.** "Marketplace" only refers to the Claude Code plugin command in Appendix A — that's
> Claude Code's term for installing a plugin from a catalog repo. The product is simply **Toolbelt for
> Claude Desktop**.

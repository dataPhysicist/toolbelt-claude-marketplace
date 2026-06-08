# Toolbelt for Claude Desktop

**Bring one of your governed Toolbelt agents — its tools, playbooks, and persona — into the Claude desktop app.**

Toolbelt is your team's AI operating layer — agents with their own persona, connected tools, guardrails,
audit, and spend control. This brings **one such agent's runtime into Claude Desktop**: Claude *becomes*
that agent, using its connected tools (Gmail, Slack, Calendar…), its wrenches/playbooks, and its files —
all governed by Toolbelt. *Same chat, now run like a business.*

> **Claude is the front door; Toolbelt is the brain.** You *use* an agent here; you *build and govern* it
> in Toolbelt. **One extension = one agent** (install another for a second agent).

---

## What it is

You pick a Toolbelt assistant; the extension brings **that agent** into Claude Desktop — its tools and its
operating instructions. Claude works *as* the agent, with everything governed server-side.

| | Raw Claude | Claude + a Toolbelt agent |
|---|---|---|
| **Persona** | general assistant | the agent's system prompt / operating instructions |
| **Tools** | per chat | the agent's connected services (Gmail, Slack, Calendar…) + its wrenches/playbooks |
| **Files & memory** | none | the agent's storage (its `Config` / `Memory` / `Skills` files) |
| **Governance** | none | permissions, audit, per-tool restrictions — enforced server-side |
| **Spend** | your plan | metered and governed at the org level |

## How it works

A small **local bridge** — shipped as a one-click Desktop Extension — connects Claude Desktop to **one
agent's** Toolbelt endpoint. Your API key lives in the OS keychain and is sent as a Bearer header (never in
a URL).

```
 You ─► Claude Desktop ──► Toolbelt agent bridge (local) ──HTTPS + Bearer──► the agent's Toolbelt workspace
                            │  • the agent's own tools pass straight through (governed by Toolbelt)
                            │  • its persona loads as `instructions` + an `act_as_<agent>` prompt
                            │  • its wrenches/playbooks + storage files come too
 You ◄── result ◄───────────┘ ◄──────────── tools run server-side with permissions / audit / spend control
```

- **It's the agent's real toolbox.** Connecting to one agent natively exposes its governed tools — no
  client-side filtering; whatever the agent is configured for in Toolbelt is exactly what you get.
- **Claude becomes the agent.** Run **`>>act_as_<agent>`** to load its operating instructions (persona +
  playbooks), then work as it. (Claude Code auto-applies the persona; the desktop app needs the one-time
  prompt, since it ignores server `instructions`.) The agent's own rules — including its model-selection
  policy — travel *in* its persona.
- **Governance stays in Toolbelt.** Permissions, audit, and spend are enforced server-side on every call.

## Install (Claude desktop app)

**For end users — you received a `.mcpb` file from your provider.** No terminal needed.
1. Claude Desktop → **Settings → Extensions → Install Extension** → select the `.mcpb` file.
2. Enter your **API key** (and the agent's workspace ID, if it isn't pre-filled).
3. Run **`>>act_as_<agent>`** to load the agent, then work as it.

**For operators / builders — packaging an agent.**
1. Build once:
   ```bash
   cd desktop-extension && npm install && npx @anthropic-ai/mcpb pack
   ```
   For a branded per-agent copy (named in the Settings list, workspace baked in so the customer only
   enters a key):
   ```bash
   node pack-agent.mjs --agent "Chief-of-Staff" --workspace <agent-workspace-id>
   ```
2. **Settings → Extensions → Install Extension** → select the `.mcpb` → enter the API key.
3. Hand the branded `.mcpb` to your customer — they install it with the end-user steps above.

Full steps and troubleshooting: **[DESKTOP.md](./DESKTOP.md).**

## The agent's own rules (incl. model selection)

Whatever the agent does is defined by **its persona** — which comes along when you `act_as_<agent>`. If the
agent has its own model-selection policy (e.g. a "Model Auto-Pilot" section in its system prompt, or a
`ModelAutoPilot.md` in its storage), that travels with it; the extension doesn't add a separate layer.
Permissions, audit, and spend remain governed server-side by Toolbelt.

## How to think about context (FAQ)

You don't create skill files or re-build the agent inside Claude. **The agent's persona, tools, files, and
guardrails are configured in Toolbelt.** The extension passes its tools straight through and serves its
system prompt — so "loading the agent" is just running `>>act_as_<agent>`; nothing to paste.

## What's inside

```
desktop-extension/         # the Claude Desktop extension — the main way to use this
  ├── bridge.js            #   local MCP proxy: passes the agent's tools through + serves its persona
  ├── router-instructions.md  #   the "you are <agent>" persona wrapper (persona fetched at runtime)
  ├── manifest.json · package.json   #   MCPB manifest + SDK dependency
  └── pack-agent.mjs       #   per-AGENT branded build (names it in the Settings list)
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

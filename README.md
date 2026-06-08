# Apexti Toolbelt — Claude marketplace

A one-plugin marketplace that connects a Claude client to a governed **Toolbelt** org and makes the
org's **agents** usable right inside Claude. Install it, authorize Toolbelt once, and Claude can route
your requests to the right agent — each agent runs in Toolbelt with its own memory, tools, and
guardrails. **Claude is the front door; Toolbelt is the brain.**

Design law: **Claude *uses* an org's agents; Toolbelt is where you *build* them.** Provisioning happens
in Toolbelt, not in chat.

## Install

The install path differs by client — the custom-marketplace / `/plugin` flow is **Claude Code only**.

**Claude Code (CLI)** — supports custom marketplaces:
```text
/plugin marketplace add YOUR_GITHUB_USERNAME/toolbelt-claude-marketplace
/plugin install toolbelt@apexti-toolbelt
/toolbelt:get-started
```
You'll be prompted for your **hub workspace (assistant) ID** and **Toolbelt API key** (kept in your
keychain, never committed). On first run it connects, loads your org's model rules, lists your agents,
and delegates each request to the best-fit agent on the optimal model.

**Claude desktop app** — does **not** support custom marketplaces or `/plugin` (those are Claude Code
features). Instead, install the bundled **Desktop Extension** (`desktop-extension/`, keychain auth) or
add a **Custom Connector**, then paste the skill into a Project. Full steps in [`DESKTOP.md`](./DESKTOP.md).

## Two ways to connect Toolbelt agents to Claude

First, the mental model — **two layers of context**, in two places:

- **The agent's brain** (expertise, system prompt, memory, connected tools, guardrails, spend limits) is
  configured **in Toolbelt** when you build the assistant. Claude never sets this. You do **not** create
  skill files in Claude or ask it to "become" the agent — the agent already is what it is, server-side.
- **Routing context** (how *Claude* picks an agent, on which model, and retrieves the answer) is the only
  thing set on the Claude side. The two methods below differ only in **how that routing context is
  delivered** and **how curated the tool surface is.** Both keep the brain in Toolbelt.

### Method A — Custom Connector (or Claude Code plugin) + instructions you provide

Claude talks **directly** to Toolbelt's MCP endpoint. You supply the routing context: paste the router
skill into a **Project's custom instructions** (Desktop / claude.ai), or let the **plugin's skill**
auto-apply (Claude Code).

```
   ┌─ Project custom instructions = the router skill  (you paste it; Claude Code auto-applies)
   ▼
 You ─► Claude ───── MCP (Bearer / URL key) ─────► Toolbelt workspace MCP endpoint
   │                                                  │  raw tools: toolbelt, manage_delegations,
   │  Claude follows your pasted instructions:        │             read_storage_file … (FULL surface)
   │   • toolbelt list_assistants   → roster          ▼
   │   • read ModelAutoPilot.md     → pick model    hub assistant ─► delegates to target agent
   │   • manage_delegations create  → wait(correlationId)  │         (its own memory / tools / guardrails)
 You ◄── answer ◄───────────────────────────────────────────┘
```

**How you set context:** paste `plugins/toolbelt-get-started/skills/get-started/SKILL.md` into the
Project's custom instructions (Desktop), or install the plugin so the skill auto-applies (Code). Claude
creates nothing.

**Pros** — works **everywhere** (Desktop, claude.ai browser, Claude Code); **no build step** (a URL or
`/plugin install`); transparent (Claude talks straight to Toolbelt).
**Cons** — you must **paste the skill into every Project** (Desktop), and without it Claude follows the raw
tools' misleading guidance (`sleep`/`get_pending_sub_chats`, connection tools); the **full raw tool
surface** is exposed so Claude can wander; the Desktop connector dialog takes a **URL only** (key in the
URL); **no per-agent toggles**.

### Method B — Bridge Extension (`.mcpb`) — self-contained

A small **local bridge** (`desktop-extension/bridge.js`) sits between Claude and Toolbelt and **carries the
routing context itself** — nothing to paste.

```
 You ─► Claude ──stdio──► bridge.js (local, in the extension) ──HTTPS + Bearer──► Toolbelt MCP endpoint
                           │  • one ask_<agent> tool per assistant   (toggle each on/off)            │
                           │  • bundled router instructions + prompt (nothing to paste)              ▼
                           │  • curated surface + description rewrites (can't wander)        target agent runs
                           │  • delegate→wait handled inside          (no correlationId for the model)
 You ◄── answer ◄──────────┘ ◄──────────────────────────────────────────────────────────── (its own brain)
```

**How you set context:** nothing — install the extension, enter org name / workspace ID / API key. Each
agent appears as an `ask_<name>` tool you can toggle.

**Pros** — **nothing to paste**; **per-agent `ask_<name>` tools** (enable/disable specific assistants);
**key in keychain** + Bearer header (never in a URL); **can't wander** (only router-essential tools,
delegation handled internally); **per-org branding** via `pack-org.mjs` (named in the Settings list).
**Cons** — **Claude Desktop only** (not claude.ai; Code uses the plugin); a **build step** (`npm install`
+ `mcpb pack`); we **maintain a local bridge** (~200 lines); behavior is **bundled at build time** (change
instructions → rebuild + reinstall).

### Which should you choose?

| If you… | Use |
|---|---|
| Want a 2-minute test, or are on **claude.ai / Claude Code** | **Method A** |
| Want the cleanest **Desktop** experience — toggle agents, keychain, zero paste | **Method B** |
| Are **distributing to customers / teammates** | **Method B** (one branded `.mcpb` per org) |
| Need one setup to work across **multiple clients** | **Method A** |

**Rule of thumb: Method A to try it, Method B to live in it (on Desktop).** Both connect to the same
Toolbelt endpoint and keep the agent's brain in Toolbelt — they differ only in how the routing context
reaches Claude and how curated the tools are.

## What's inside

```
.claude-plugin/marketplace.json          # the marketplace catalog
plugins/toolbelt-get-started/            # the plugin (v0.6 — router + Model Auto-Pilot)
  ├── .claude-plugin/plugin.json         # plugin manifest + userConfig (workspace id + API key prompts)
  ├── .mcp.json                          # per-workspace Toolbelt MCP connector (Bearer-header auth)
  ├── skills/get-started/SKILL.md        # connect -> load org rules -> pick model -> delegate (correlationId)
  ├── agents/onboarding-guide.md
  ├── servers/onboard-stub.mjs           # dev/demo stub only (not the product path)
  └── examples/sterling-marketplace.json # branded operator catalog (org-pinned)
```

## Connecting (per-workspace endpoint + your API key)

Toolbelt's MCP endpoint is **per workspace (assistant)**. Pick one assistant as your **hub** — its
endpoint can `list_assistants` (your whole org roster) and delegate to any other agent. The plugin sends
your API key as an **`Authorization: Bearer` header**, not in the URL:

```
POST https://toolbelt.apexti.com/api/workspaces/<WORKSPACE_ID>/mcp
Authorization: Bearer <API_KEY>
```

The plugin collects your **hub workspace ID** and **API key** at install via `userConfig` in
`plugin.json`; the key is marked `sensitive`, so it's stored in your system keychain and substituted into
the header at connect time via `${user_config.toolbelt_api_key}`. **No secret is ever committed to this
repo**, and the key never appears in a URL (so it can't leak via proxy/access logs or browser history).

> **Zero Toolbelt edits.** This router works against Toolbelt as it exists today — no server changes.
> Delegation results are retrieved with `manage_delegations action:"wait"` keyed by the `correlationId`
> returned at create time, which needs no Toolbelt chat session. The future server-side improvements that
> would graduate this from "works" to "best-in-class" (scoped tokens, a one-call streaming `delegate`,
> spend-cap enforcement on the MCP path) are tracked in the Toolbelt repo at
> `docs/claude-integration-roadmap.md` (with full evidence in `docs/claude-integration-findings.md`).

## Model Auto-Pilot (org-defined model selection)

Before delegating, Claude picks the **optimal provider + model** for each task and passes it on the
`manage_delegations create` call (Toolbelt validates the choice and falls back if it isn't allowed). The
routing rules — model catalog, prices, and quality floors — are **not** baked into this plugin; Claude
reads them at runtime from the org's `ModelAutoPilot.md` in Toolbelt **org storage**
(`read_storage_file`, `scope:"org"`), so each organization customizes its own rules and nothing goes
stale. Paid/non-trivial work gets a one-line "flight plan" + your approval; trivial/free work autopilots.

**Honest reporting only.** The skill reports the model used and its *published price tier/ratio* (e.g.
"free", or "~68% cheaper per token than premium") and a count of tasks autopiloted to cheaper models. It
**never** reports absolute "tokens/dollars saved" — Toolbelt meters real usage server-side but doesn't
expose it to the client, so absolute figures would be guesses. Accurate $-saved reporting is a tracked
server-side item (see `docs/claude-integration-roadmap.md` in the Toolbelt repo).

## Roadmap

1. **Router plugin** (this) — connect + list + delegate to the org's agents. ✅ built
2. **Delegation round-trip** — ✅ working with zero server edits via `manage_delegations` create →
   `wait`/`status` by `correlationId` (the earlier "needs a chat context" blocker is solved client-side).
3. **Self-contained behavior via a custom MCP bridge** (zero Toolbelt edits) — ✅ built in
   `desktop-extension/` (`bridge.js`). Replaces `mcp-remote` with a thin SDK-based proxy that carries the
   router behavior itself: **tool-description rewrites** on passthrough (model sees `wait`/`correlationId`,
   not the misleading `sleep`/`get_pending_sub_chats`), a **bundled `toolbelt` prompt** (one-action
   insert), and best-effort server `instructions`.
   **Probe result (recorded so we don't re-litigate):** Claude Desktop does **not** inject the MCP
   `instructions` field (the `experiments/instructions-probe/` test connected and the tool worked, but the
   🍍 directive had no effect). So the bridge relies on the rewrite (automatic) + the prompt (one action),
   not on auto-injection. *Pending a live test against a real org endpoint.*
4. **Generator** — auto-emit a branded connector + roster skill per org.
5. **Optional later** — per-assistant toggle connectors, org-as-Claude-Project templates.
6. **Server-side graduation** — see `docs/claude-integration-roadmap.md` in the Toolbelt repo.

See the EVALUATION and plan docs for the full rationale.

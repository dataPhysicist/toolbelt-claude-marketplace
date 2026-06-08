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
3. **Self-contained behavior via a custom MCP bridge** (zero Toolbelt edits) — replace the bundled
   `mcp-remote` with our own thin local bridge that proxies to Toolbelt **and** carries the router
   behavior itself: server `instructions` (auto system-prompt hint), a bundled `toolbelt` prompt
   (one-action insert), and tool-description rewrites on passthrough (so the model sees
   `wait`/`correlationId`, not the misleading `sleep`/`get_pending_sub_chats`). Removes the
   paste-the-skill-into-a-Project step on desktop. **Gated on a probe:** does Desktop honor the MCP
   `instructions` field? Test with `experiments/instructions-probe/` (🍍 = yes → fully automatic;
   no 🍍 → fall back to the bundled prompt).
4. **Generator** — auto-emit a branded connector + roster skill per org.
5. **Optional later** — per-assistant toggle connectors, org-as-Claude-Project templates.
6. **Server-side graduation** — see `docs/claude-integration-roadmap.md` in the Toolbelt repo.

See the EVALUATION and plan docs for the full rationale.

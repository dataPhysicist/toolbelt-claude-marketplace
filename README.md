# Apexti Toolbelt — Claude marketplace

A one-plugin marketplace that connects a Claude client to a governed **Toolbelt** org and makes the
org's **agents** usable right inside Claude. Install it, authorize Toolbelt once, and Claude can route
your requests to the right agent — each agent runs in Toolbelt with its own memory, tools, and
guardrails. **Claude is the front door; Toolbelt is the brain.**

Design law: **Claude *uses* an org's agents; Toolbelt is where you *build* them.** Provisioning happens
in Toolbelt, not in chat.

## Install in a Claude client

```text
/plugin marketplace add YOUR_GITHUB_USERNAME/toolbelt-claude-marketplace
/plugin install toolbelt@apexti-toolbelt
/toolbelt:get-started
```

On install you'll be prompted for your **hub workspace (assistant) ID** and **Toolbelt API key**
(kept locally, never committed). On first run the plugin connects, lists your org's agents, and tells
you to just ask — it delegates each request to the best-fit agent and returns that agent's answer.

For the **desktop app**, see [`DESKTOP.md`](./DESKTOP.md) — install from your marketplace first; connector + Project is a fallback.

## What's inside

```
.claude-plugin/marketplace.json          # the marketplace catalog
plugins/toolbelt-get-started/            # the plugin (v0.5 — router model)
  ├── .claude-plugin/plugin.json         # plugin manifest + userConfig (workspace id + API key prompts)
  ├── .mcp.json                          # per-workspace Toolbelt MCP connector (Bearer-header auth)
  ├── skills/get-started/SKILL.md        # connect -> list agents -> delegate (manage_delegations, correlationId)
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

## Roadmap

1. **Router plugin** (this) — connect + list + delegate to the org's agents. ✅ built
2. **Delegation round-trip** — ✅ working with zero server edits via `manage_delegations` create →
   `wait`/`status` by `correlationId` (the earlier "needs a chat context" blocker is solved client-side).
3. **Generator** — auto-emit a branded connector + roster skill per org.
4. **Optional later** — per-assistant toggle connectors, org-as-Claude-Project templates.
5. **Server-side graduation** — see `docs/claude-integration-roadmap.md` in the Toolbelt repo.

See the EVALUATION and plan docs for the full rationale.

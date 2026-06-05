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

On first run the plugin connects to Toolbelt, lists your org's agents, and tells you to just ask —
it delegates each request to the best-fit agent and returns that agent's answer.

For the **desktop app**, see [`DESKTOP.md`](./DESKTOP.md) (custom connector + Project, or plugin install).

## What's inside

```
.claude-plugin/marketplace.json          # the marketplace catalog
plugins/toolbelt-get-started/            # the plugin (v0.3 — router model)
  ├── .claude-plugin/plugin.json
  ├── .mcp.json                          # remote Toolbelt MCP connector (org-scoped by URL param)
  ├── skills/get-started/SKILL.md        # connect -> list agents -> delegate (create_sub_chat)
  ├── agents/onboarding-guide.md
  ├── servers/onboard-stub.mjs           # dev/demo stub only (not the product path)
  └── examples/sterling-marketplace.json # branded operator catalog (org-pinned)
```

## Org-scoping (branded per-customer installs)

Point the connector at a specific org by URL param, e.g.
`https://toolbelt.apexti.com/mcp?org=<ORG_ID>`. The generator emits one branded plugin per customer
org (see `examples/sterling-marketplace.json`). The org id is a routing key, not a credential — the
user still authenticates and Toolbelt authorizes their membership.

## Roadmap

1. **Router plugin** (this) — connect + list + delegate to the org's agents. ✅ built
2. **Prove the delegation round-trip** end to end inside a real Claude session (dispatch is verified;
   async result retrieval needs a client chat context — confirm in desktop).
3. **Generator** — auto-emit a branded connector + roster skill per org.
4. **Optional later** — per-assistant toggle connectors, org-as-Claude-Project templates.

See the EVALUATION and plan docs for the full rationale.

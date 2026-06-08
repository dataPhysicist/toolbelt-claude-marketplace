# Toolbelt — Getting Started plugin (Claude Code)

The Claude **Code** path for connecting to a governed **Toolbelt** org and using its agents — the
README's **Method A**. It connects Claude directly to your hub workspace's MCP endpoint and applies the
router skill automatically. Claude is the front door; Toolbelt is the brain.

## What's inside

```
toolbelt-get-started/
├── .claude-plugin/plugin.json     # manifest + userConfig (workspace id + API key prompts)
├── .mcp.json                      # remote Toolbelt MCP connector — Authorization: Bearer (no secret in repo)
├── skills/get-started/SKILL.md    # the router skill (auto-applied): connect → load org rules
│                                  #   → pick model → delegate by correlationId → honest reporting
├── agents/onboarding-guide.md     # legacy demo (pre-router) — not wired into the plugin
├── servers/onboard-stub.mjs       # legacy demo stub (pre-router) — not wired into the plugin
└── examples/sterling-marketplace.json  # legacy branded-catalog demo (old endpoint)
```

## Install (Claude Code)

```text
/plugin marketplace add <github-user>/toolbelt-for-claude
/plugin install toolbelt@apexti-toolbelt
/toolbelt:get-started
```

On install you're prompted for your **hub workspace ID** and **API key** (kept in your keychain via
`userConfig`, never committed). The skill then connects, loads your org's `ModelAutoPilot.md` rules,
lists your agents, and delegates each request to the best-fit agent on the optimal model.

## On the desktop app

The desktop app has no `/plugin` or marketplace. Use a **Custom Connector** (Method A) or the
**Desktop Extension** (Method B) — see [`../../DESKTOP.md`](../../DESKTOP.md) and the README's
[Two ways to connect](../../README.md#two-ways-to-connect-toolbelt-agents-to-claude).

## Notes

- `.mcp.json` carries no secret — the API key is collected at install and sent as a Bearer header.
- The `servers/`, `agents/`, and `examples/` files are **legacy demo artifacts** from an earlier
  onboarding-stub design; they're not part of the router path and can be removed.

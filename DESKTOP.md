# Setting up Toolbelt in the Claude **desktop app**

> **Important:** the Claude desktop app does **not** support custom plugin marketplaces or the `/plugin`
> command — those are **Claude Code** (CLI) features. The desktop **Plugins** tab is a curated
> *Anthropic & Partners* directory, so you can't add this GitHub marketplace there. The `/plug…` slash
> options you may see (`setup-cowork`, `create-cowork-plugin`, `cowork-plugin-customizer`) are Cowork's
> own tooling — **not** a way to install Toolbelt. Use one of the two paths below.

Both paths connect to the same per-workspace Toolbelt MCP endpoint:
`https://toolbelt.apexti.com/api/workspaces/<HUB_WORKSPACE_ID>/mcp`
Pick one assistant as your **hub** — its endpoint lists your whole org's agents and delegates to them.

---

## Path A (recommended) — install the Desktop Extension (.mcpb)
Your key is stored in the **OS keychain** and sent as an `Authorization: Bearer` header (never in a URL).

1. In a terminal, vendor the bundled bridge once:
   ```bash
   cd desktop-extension && npm install
   ```
2. Claude Desktop → **Settings → Extensions → Extension Developer → Install Unpacked Extension** →
   select the `desktop-extension/` folder.
   *(To share it as one double-click file instead: `npx @anthropic-ai/mcpb pack` → distribute the
   resulting `toolbelt.mcpb` → users pick **Install Extension**.)*
3. When prompted, enter your **hub workspace ID** and **Toolbelt API key**.
4. Add the routing instructions to a **Project** (see below), then say **"connect Toolbelt"**.

## Path B (quickest) — add a Custom Connector
No build step. The connector dialog takes a **URL only**, so the key goes in the URL query string —
fine for your own machine (it stays in your account, never in the repo), but Path A is cleaner for
anything you share.

1. **Settings → Connectors → Add custom connector** → paste
   `https://toolbelt.apexti.com/api/workspaces/<HUB_WORKSPACE_ID>/mcp?apikey=<YOUR_KEY>`.
2. Add the routing instructions to a **Project** (see below).
3. Say **"connect Toolbelt"**.

---

## Routing instructions (required for BOTH paths)
The desktop app doesn't auto-apply the plugin's skill, so paste the **body of**
`plugins/toolbelt-get-started/skills/get-started/SKILL.md` into a **Project's custom instructions**, and
use Toolbelt **inside that Project**. That's what tells Claude to load your org's model rules, pick the
model, delegate by `correlationId`, report honestly, and stay pause-aware. *(A future extension can ship
this as an MCP prompt so the paste step goes away.)*

## ⚠️ Never commit your API key
Let the extension's install-time prompt hold it (keychain), or keep it in your private connector URL —
never hardcode it into a public repo.

## A clean "fresh user" test
A connector/extension is account-level, so the cleanest test is a **new Project** you haven't used —
the org's agent roster is then the only context in the room.

---

## Using Claude Code instead (where the marketplace *does* work)
If you use Claude Code (the CLI), the one-line marketplace path works there:
```text
/plugin marketplace add YOUR_GITHUB_USERNAME/toolbelt-claude-marketplace
/plugin install toolbelt@apexti-toolbelt
/toolbelt:get-started
```
This is **Claude Code only** — it does not exist in the desktop app.

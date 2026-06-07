# Running the Toolbelt plugin in the Claude **desktop app**

Toolbelt's MCP endpoint is **per workspace (assistant)**:
`https://toolbelt.apexti.com/api/workspaces/<WORKSPACE_ID>/mcp`

Pick one assistant as your **hub** — its endpoint can list your whole org's agents and delegate to them.

## Distribution path — marketplace install (recommended; secure auth)
This is the real product path (what an operator's customers use). The plugin's `plugin.json` declares a
`userConfig`, so the **workspace ID + API key are entered at install** and never committed to the repo.
The key is marked `sensitive` (stored in your system keychain) and sent as an **`Authorization: Bearer`
header** — it never appears in a URL.

1. Settings → **Plugins** → **Add marketplace** → `YOUR_GITHUB_USERNAME/toolbelt-claude-marketplace`.
2. Install **toolbelt** → when prompted, enter your **hub workspace ID** and **API key**.
3. Say **"connect Toolbelt"** or run **`/toolbelt:get-started`**.

> If your desktop build doesn't expose custom marketplaces (plan/admin-gated), run the marketplace in
> **Claude Code** (`/plugin marketplace add …` works for any user) — it will also prompt for the
> userConfig values and use the Bearer header.

## Fastest smoke test (today) — custom connector
Surest first test with no install step. The Desktop "Add custom connector" dialog takes a **URL only**,
so this path puts the key in the URL query string. That's fine for a private local smoke test (the key
stays on your machine, never in a repo), but prefer the marketplace install above for anything you share.

1. Settings → **Connectors → Add custom connector** → paste your full URL
   (`…/api/workspaces/<HUB_WORKSPACE_ID>/mcp?apikey=<YOUR_KEY>`).
2. Create a **Project**; paste the body of
   `plugins/toolbelt-get-started/skills/get-started/SKILL.md` into its custom instructions.
3. Say **"connect Toolbelt"** → it lists your org's agents and delegates your requests.

## ⚠️ Never commit your API key
The key is a credential. Let the install-time `userConfig` prompt hold it (keychain), or keep it in your
private custom-connector URL — **never hardcode it into `.mcp.json` in a public repo.**

## Note on "fresh instance"
A connector/plugin is account-level. The cleanest "new user" test is a **Project** you haven't used
before, so the org's agent roster is the only context in the room.

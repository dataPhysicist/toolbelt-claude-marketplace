# Connecting a Toolbelt agent in the Claude **desktop app** (and Cowork / web)

Each agent is two pieces: a **connector** (its live tools) and an optional **routing
skill** (so "talk to my Chief-of-Staff" works without being told). This page covers the
connector. There are two ways to add it — **lead with Method A**; it's the fewest steps,
needs no file, and is the only one that also works on **claude.ai web**.

> **Marketplace note:** the desktop **Plugins** tab is a curated *Anthropic & Partners*
> directory, so you can't add this GitHub marketplace there. Custom marketplaces are a
> **Claude Code** (CLI) feature (see the bottom of this page). The connector below,
> however, works in the desktop app, Cowork, and claude.ai web regardless.

## Two methods at a glance

| | **Method A — Connect by URL** (recommended) | **Method B — Desktop Extension (.mcpb)** |
|---|---|---|
| Setup | paste a URL, sign in once | double-click a `.mcpb` |
| Key | entered on the gateway sign-in page; **never touches Claude** | OS keychain, sent as Bearer header |
| Workspace ID | in the URL — nothing to look up | entered at install |
| Web support | **yes** (claude.ai web) | desktop / Cowork only |
| Needs | the gateway deployed once ([`gateway/`](gateway/README.md)) | nothing — fully offline |

**Rule of thumb: Method A for a team and for web; Method B when you want the key in your
own keychain or the gateway isn't reachable.**

---

## Method A (recommended) — Connect by URL

1. **Settings → Connectors → Add connector** (or "+" → **Add connector** in a chat).
2. Paste the agent's URL:
   `https://toolbelt-oauth-gateway.onrender.com/workspaces/<WORKSPACE_ID>/mcp`
   (the routing skill hands you the exact per-agent URL on first run, or get it from your
   operator).
3. Claude opens the agent's **sign-in page**. Paste your Toolbelt API key once
   (Toolbelt → **Settings → Connect to Claude**) and submit. The gateway seals the key
   into opaque tokens — Claude only ever holds the tokens.
4. Start a **new chat** (connectors attach at chat start), confirm the agent is toggled
   on in the "+" → Connectors menu, and ask away.

The agent's tools load namespaced (`cos_*`, `st_*`, …) and self-routing, so multiple
agents coexist in one chat. To deploy the gateway that serves these URLs, see
[`gateway/README.md`](gateway/README.md) (~5 minutes on Render).

## Method B — Desktop Extension (.mcpb)

Use this when you'd rather keep the key in your OS keychain, or the gateway isn't
available.

1. Get the agent's `.mcpb` — the routing skill surfaces it on first run, or download it
   from [`dist/`](dist/) (e.g. `dist/chief-of-staff.mcpb`). Always use the current build;
   don't reuse an old copy from elsewhere on disk.
2. Claude Desktop → **Settings → Extensions → Install Extension** → select the `.mcpb`.
   *(Use "Install **Extension**" — the file picker — not "Install Unpacked Extension",
   which wants a folder.)* Double-clicking the file also works.
3. When prompted, enter your **Toolbelt API key** (Toolbelt → Settings → Connect to
   Claude; stored in the OS keychain) and the agent's **workspace ID** (shown by the
   routing skill, or in the Toolbelt dashboard URL).
4. Start a **new chat**, toggle the agent on in the "+" → Connectors menu, and ask away.

---

## ⚠️ Never commit or share your API key
Method A keeps it on the gateway (sealed into tokens); Method B keeps it in your OS
keychain. Either way, never hardcode a key into a repo or hand out a shared key — each
user signs in with their own, so per-user access and IT/Security's server-side tool
policy both apply.

## A clean "fresh user" test
A connector is account-level, so the cleanest test is a **new chat** (Method A) or a
**new Project** you haven't used — the agent's roster is then the only context in the room.

## Using Claude Code (where the custom marketplace works)
In the Claude Code CLI the marketplace path works directly:
```text
/plugin marketplace add dataPhysicist/toolbelt-for-claude
/plugin install chief-of-staff@apexti-toolbelt
```
Then add the connector with `claude mcp add` (the gateway URL, Method A) or install the
`.mcpb` (Method B). This marketplace path is **Claude Code only** — it does not exist in
the desktop app.

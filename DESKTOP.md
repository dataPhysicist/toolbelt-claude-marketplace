# Setting up Toolbelt in the Claude **desktop app**

> **Important:** the Claude desktop app does **not** support custom plugin marketplaces or the `/plugin`
> command — those are **Claude Code** (CLI) features. The desktop **Plugins** tab is a curated
> *Anthropic & Partners* directory, so you can't add this GitHub marketplace there. The `/plug…` slash
> options you may see (`setup-cowork`, `create-cowork-plugin`, `cowork-plugin-customizer`) are Cowork's
> own tooling — **not** a way to install Toolbelt. Use one of the two methods below.

## Two methods at a glance
Both connect to the same Toolbelt endpoint and keep each agent's brain in Toolbelt — they differ in how
the *routing context* reaches Claude. Full diagrams + pros/cons are in the
[README "Two ways to connect"](./README.md#two-ways-to-connect-toolbelt-agents-to-claude) section.

| | **Method B — Desktop Extension** (recommended) | **Method A — Custom Connector** |
|---|---|---|
| Setup | install a `.mcpb` | paste a URL |
| Key | OS keychain, Bearer header | in the URL |
| Routing context | **bundled** (nothing to paste) | **paste the skill** into a Project |
| Agent | the agent's tools + persona (`act_as_<agent>`) | the agent's tools; persona pasted into a Project |
| Build step | yes (`npm install` + pack) | none |

**Rule of thumb: Method A to try it fast, Method B to live in it.**

---

## Method B (recommended) — Desktop Extension (.mcpb)
Your key is stored in the **OS keychain** and sent as an `Authorization: Bearer` header (never in a URL).
The extension brings **one agent** into Claude: its own tools pass straight through, and its persona loads
via an `act_as_<agent>` prompt (and the server `instructions`) — so there's nothing to paste.

> **End user with a `.mcpb` from your provider?** Skip step 1 — go straight to step 2 and install the file.

1. In a terminal, build the installable file once:
   ```bash
   cd desktop-extension && npm install && npx @anthropic-ai/mcpb pack
   ```
   This produces `desktop-extension/desktop-extension.mcpb`. *(For a branded per-agent build named in the
   Settings list, use instead: `node pack-agent.mjs --agent "Chief-of-Staff" --workspace <agent-id>`.)*
2. Claude Desktop → **Settings → Extensions → Extension Developer → Install Extension** → select the
   **`.mcpb` file**. *(Use "Install **Extension**" — the file picker — not "Install Unpacked Extension",
   which wants a folder and greys out files.)*
3. When prompted, enter an **agent name** (optional label), the **agent's workspace ID**,
   and your **Toolbelt API key**.
4. Open a chat — the agent's tools are available. Run **`>>act_as_<agent>`** to load its persona and work
   as the agent.

## Method A (quickest) — Custom Connector + Project instructions
No build step. The connector dialog takes a **URL only**, so the key goes in the URL query string —
fine for your own machine (it stays in your account, never in the repo), but Method B is cleaner for
anything you share. You **must** supply the routing context yourself (next step).

1. **Settings → Connectors → Add custom connector** → paste
   `https://toolbelt.apexti.com/api/workspaces/<HUB_WORKSPACE_ID>/mcp?apikey=<YOUR_KEY>`.
2. Create a **Project** and paste the **body of**
   `plugins/toolbelt-get-started/skills/get-started/SKILL.md` into its **custom instructions**. This is
   required — it tells Claude to load your org's model rules, pick the model, delegate by `correlationId`,
   report honestly, and stay pause-aware. (Without it, Claude follows the raw tools' misleading
   `sleep`/`get_pending_sub_chats` guidance.)
3. Inside that Project, say **"connect Toolbelt"**.

> **For best results — create a Cowork Project per assistant.** Whenever you add a Toolbelt assistant,
> create a dedicated **Project** in Cowork mode for it. Send this as your **first prompt** in the Project:
>
> *"Read the assistant instructions of the connector named `<toolbelt assistant name>` and update your
> instructions, CLAUDE.md, so we best utilize this assistant in this project."*
>
> This seeds the Project's CLAUDE.md with the assistant's purpose, tools, and constraints so Claude routes
> and collaborates effectively across sessions — without you re-explaining context each time.

---

## ⚠️ Never commit your API key
Let the extension's install-time prompt hold it (keychain), or keep it in your private connector URL —
never hardcode it into a public repo.

## A clean "fresh user" test
A connector/extension is account-level, so the cleanest test is a **new Project** you haven't used —
the org's agent roster is then the only context in the room.

---

## Using Claude Code instead (where the marketplace *does* work)
If you use Claude Code (the CLI), the one-line marketplace path works there (this is Method A, auto-applied):
```text
/plugin marketplace add YOUR_GITHUB_USERNAME/toolbelt-for-claude
/plugin install toolbelt@apexti-toolbelt
/toolbelt:get-started
```
This is **Claude Code only** — it does not exist in the desktop app.

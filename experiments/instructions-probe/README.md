# MCP Instructions Probe (diagnostic)

A tiny, **zero-dependency** local MCP server that answers one design-deciding question:

> **Does the Claude desktop app inject an MCP server's `instructions` (from the `initialize`
> response) into the model's context?**

If yes, a future Toolbelt bridge can carry the router behavior **automatically** — nothing to paste
into a Project. If no, we fall back to a one-action bundled **prompt**. This probe tests both in a
single install. Remove it when you're done.

## Install (desktop, unpacked — no build step)
1. Claude Desktop → **Settings → Extensions → Extension Developer → Install Unpacked Extension**
2. Select this folder: `experiments/instructions-probe/`
3. **Start a brand-new chat** (so the only context is the probe).

## Read the result — three signals, one install

| Signal | How to check | Means |
|---|---|---|
| **Server connects** | A tool named `probe_echo` appears in the chat's tool list | The stdio MCP server loaded and runs under Desktop's Node |
| **`instructions` injected** ⭐ | Ask any question. **Does the reply start with 🍍?** You never mentioned pineapple — that directive lives *only* in the server's `instructions` field | 🍍 = Desktop injects `instructions` → the **auto** bridge design is viable. No 🍍 = it ignores them → use the **prompt** fallback |
| **Prompts surfaced** | Type `>>` (or open the prompt/`+` menu) and look for **`probe-ping`** | Desktop surfaces server prompts → the one-action fallback works |

The ⭐ row is the decisive one.

## Notes
- The 🍍 directive appears in **no** tool description, prompt, or message — only in
  `initialize.result.instructions` (see `server.js`). That isolation is what makes the test valid.
- Verified locally: `node server.js` speaks newline-delimited JSON-RPC and returns `instructions` on
  `initialize`, plus `probe_echo` and the `probe-ping` prompt.
- **Uninstall after testing** (Settings → Extensions → remove) so the 🍍 prefix stops.

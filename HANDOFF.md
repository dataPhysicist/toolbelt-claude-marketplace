# Toolbelt for Claude — Handoff Brief (continue in a fresh session)

Read this top-to-bottom. It is self-contained: a new Claude Code session with **no prior context** can
execute from it. The goal drifted a lot during development — **this brief describes where we actually
landed, not the journey.**

---

## 1. The goal (what we actually want now)

**A per-agent Claude Desktop extension.** One extension = **one** Toolbelt assistant. It brings *that one
agent* into Claude: its **governed tools** (the agent's connected services + wrenches/playbooks + storage),
its **persona** (the agent's system prompt), and its **memory/config files**. Claude effectively *becomes*
that agent, with Toolbelt enforcing permissions/audit/spend on every call.

- **Primary client:** the **Claude desktop app**. Secondary/richer: **Cowork / Claude Code** (it honors MCP
  server `instructions` and resources; the desktop app does not).
- **Distribution:** an operator builds a **branded `.mcpb` per agent** ("Toolbelt — Acme Invoice Bot") and
  hands it to a customer, who installs it and enters only their API key. (Built via `pack-agent.mjs`.)
- **Not** the org-wide model anymore. We tried "one extension exposes the whole org" (v0.5–v0.11); it
  doesn't scale (50–100 agents floods the tool list/context). Per-agent is the design. The org-hub code is
  recoverable from git history if ever needed.

---

## 2. ⛔ THE BLOCKER — start here before building anything

**Symptom:** in Claude Desktop, the installed Toolbelt extension is *Enabled* with the API key saved, but
**"Tool permissions" shows no tools** — even after a full quit-and-reopen. This has persisted across many
versions, so **do not add features until you can see one tool. Diagnose first.**

### Diagnostic playbook (do in this order)

**Step 0 — Isolate the bridge vs. the endpoint (most important).** Bypass our extension entirely: in
Desktop, **Settings → Connectors → Add custom connector** with the raw per-workspace URL
`https://toolbelt.apexti.com/api/workspaces/<AGENT_WORKSPACE_ID>/mcp?apikey=<API_KEY>`.
- If the agent's tools **appear** → the Toolbelt endpoint + Desktop are fine, and **our bridge is the
  problem.** Focus there.
- If they **also don't appear** → it's the **Toolbelt endpoint or Desktop itself** (not our code). See the
  N+1 hypothesis below; likely needs the server-side PR merged.

**Step 1 — Read the extension's logs.** Settings → Extensions → Extension Developer → **Open Extensions
Folder** (or "Open Extension Settings Folder") → the `toolbelt-*` extension's logs. Look for
`[toolbelt-agent]` stderr lines: `connected to agent workspace MCP` (good) vs. `upstream listTools
failed: …`, an auth error, or a long stall before any response. **This is the single most useful artifact —
get it first.**

**Step 2 — Leading hypotheses (ranked):**
1. **Slow `tools/list` (most likely for multi-service agents).** When Claude calls `tools/list`, the bridge
   forwards to the Toolbelt workspace endpoint, whose `getAvailableTools()` queries **each connected service
   serially with a 180s timeout** (`app/src/mcp/workspace-mcp-server.js:1838-1868`). Chief-of-Staff has **7
   services** → if one is slow/dead, the whole list can hang past Desktop's `tools/list` timeout → **empty
   tools.** Fix: **merge Toolbelt PR #540** (parallelizes + 15s timeout) — see §5. Bridge-side stopgap: cache
   the tool list and/or fetch it in the background so the first call returns fast.
2. **Desktop didn't actually re-fetch.** Re-entering a key may not trigger a reconnect; only a **full quit +
   reopen** does. (We've hit this; confirm it was a true quit, not a window close.)
3. **Per-tool toggle state persisted** from an earlier "disable all." Check the Tool permissions list for
   greyed/off entries.

> We already fixed one self-inflicted cause: v0.13 **blocked startup** on persona+memory fetches, exceeding
> the init timeout. v0.13.1 connects the server immediately (verified: up in 0.18s with a dead upstream). So
> if it's still empty, it's **not** startup-blocking — pursue the hypotheses above.

---

## 3. What you (the human) must provide the new session

- **Your Toolbelt API key** (sensitive — paste it to the session; it is NOT in the repo). It's a per-user
  key from your Toolbelt account settings.
- **The agent workspace ID(s)** you want to package. Known ones (org `2e26435a-f2dd-47ed-894d-dae0dea3d327`,
  "Personal" org, all `accessType: owned`):
  - Chief-of-Staff: `79b0e0a0-9c22-485d-982e-7668845b6679` (7 services — good stress test, also the one that
    won't show tools)
  - Personal: `dd78c329-dd94-45b9-861c-a9d89c44f5db`
  - Meeting-Prep: `1f31749b-e246-4a7d-baae-2445418bcd07`
  - (Full roster: call `toolbelt { action: "list_assistants" }` on any connected endpoint.)
- **Confirmation that `gh` is authenticated** (it is, as GitHub user **dataPhysicist**) — used for both repos.
- **A decision** if asked: is "no tools" reproducible via the raw Custom Connector too (Step 0)? Running that
  test yourself and reporting the result will save the session a lot of guessing.

---

## 4. Where everything lives

- **This repo (the client):** local `/Users/nmckervey/Documents/Claude/Projects/Apexti Strategy/toolbelt-claude-marketplace`
  → GitHub **`dataPhysicist/toolbelt-for-claude`** (default branch `main`). *(Repo was renamed from
  `toolbelt-claude-marketplace`; "marketplace" only ever meant the legacy Claude Code path.)*
  - `desktop-extension/` — **the product.** `bridge.js` (the local MCP server, currently **v0.13.1**),
    `manifest.json` (MCPB), `router-instructions.md` (persona wrapper), `pack-agent.mjs` (per-agent build),
    `icon.png`. `node_modules/` and `*.mcpb` are gitignored — run `npm install` then `npx @anthropic-ai/mcpb
    pack` (or `node pack-agent.mjs --agent "Name" --workspace <id>`).
  - `plugins/toolbelt-get-started/` — legacy **Claude Code plugin** path (appendix; not the focus).
  - `experiments/instructions-probe/` — a diagnostic that proved **Desktop ignores MCP `instructions`** (no
    🍍) while Cowork/Code honor them.
  - `README.md`, `DESKTOP.md` — user docs (currently describe the org-hub/per-agent mix; **will need a pass**
    once the product is settled).
- **The Toolbelt server (for context + PRs):** local `/opt/claude/toolbelt-apexti` → GitHub **`apexti/toolbelt`**,
  default branch **`staging`**. Findings + roadmap docs live at `docs/claude-integration-findings.md` and
  `docs/claude-integration-roadmap.md` (uncommitted in that working tree).

---

## 5. Open Toolbelt server PRs (already pushed, awaiting review)

- **PR #539** — `fix/external-mcp-inter-assistant-content-wrapping`: wraps inter-assistant tool results
  (`manage_delegations` etc.) in a `content` array. Without it, external MCP clients get "completed with no
  output." (We also work around it client-side; see §6.)
- **PR #540** — `perf/external-mcp-roster-and-delegation-guidance`: **parallelizes `getAvailableTools`**
  (serial 180s/service → `Promise.allSettled` + 15s) and fixes the delegation guidance message. **This is
  very likely the real fix for "no tools" on multi-service agents** — prioritize getting it merged/tested.

---

## 6. Hard-won facts (don't re-derive these)

- **The per-workspace endpoint is native to this design.** `/api/workspaces/<id>/mcp` already serves *that
  workspace's* enabled service tools + wrenches + storage (`getAvailableTools`, `workspace-mcp-server.js:724-2005`;
  enabled services `:572-722`). A single-agent bridge is mostly **faithful passthrough** — connect, forward
  `tools/list` and `tools/call`. Don't filter client-side; tool access is governed per-workspace in Toolbelt.
- **Persona is retrievable:** `toolbelt { action: "get_assistant", params: { assistantId: "<id>" } }` returns
  the agent's `systemPrompt` (`toolbeltService.js:1135-1150`). The bridge serves it as the server
  `instructions` and an `act_as_<agent>` prompt.
- **Desktop ignores `instructions`; Cowork/Claude Code honor them** (proven by the probe). So on Desktop the
  persona/memory must arrive via the **`act_as_<agent>` prompt** (a one-action load) or a Project paste; in
  Cowork it can auto-apply.
- **Memory:** the agent's **file-based** memory (`Memory/*.md`, `Config/*`, `Skills/*`) is reachable via the
  passed-through **storage tools**, and v0.13 also exposes storage files as **MCP resources** + can preload
  `Memory/`+`Config/` into the persona. The platform's **semantic memory** (`Memory.search`,
  `chatService.js:5359`) is **not** exposed over MCP — that would be a new Toolbelt action (`search_memory`),
  a future PR.
- **MCP result schema is loose** — `manage_delegations` returns data at the **top level** (no `content`), so
  the bridge's `extractData` reads top-level fields as a fallback. Keep that.
- **MCPB constraints:** the install dialog is **static** — it can't show a live picker (e.g. choose agents/
  tools post-key). `user_config` fields only; sensitive values → OS keychain; `${user_config.x}` substitutes
  into `mcp_config` env/args. `headers` + `Authorization: Bearer` work. `.mcpbignore` trims the bundle.
  `compatibility.runtimes.node`, `icon` are valid.
- **Auth:** API key via `Authorization: Bearer` header (never the URL). `gh` is dataPhysicist. `~/Downloads`
  is TCC-blocked for the agent — have files placed in the project folder, not Downloads.
- **The bridge already has:** lazy connect + **auto-reconnect** on dropped sessions, a clear 401 message, and
  (v0.13.1) **non-blocking startup**. Reuse these, don't rewrite them.

---

## 7. Suggested first moves for the new session

1. Run **Step 0** (raw Custom Connector) to localize the fault, and pull the **logs** (§2).
2. If the endpoint is fine but the bridge isn't: instrument `bridge.js` `ListTools` (log the upstream
   `tools/list` duration + count) and add a **tool-list cache / background prefetch** so the first call is
   fast. Confirm tools then appear.
3. If the endpoint itself is slow/empty: get **PR #540** merged to `staging` (or test the branch), then retry.
4. Only once **one tool reliably shows** in Desktop, layer back: persona via `act_as_<agent>`, memory
   resources, then a clean `pack-agent` build for Chief-of-Staff and the end-to-end test (§8).

## 8. End-to-end test (the proof)

Build a per-agent `.mcpb` (`node pack-agent.mjs --agent "Chief-of-Staff" --workspace 79b0e0a0-9c22-485d-982e-7668845b6679`),
install it, enter the key, **full-restart Desktop**. Success =:
- The Chief-of-Staff's tools (Gmail, Calendar, Grain, Granola, Contacts, Exa, `cos-*` wrenches, storage)
  appear in Tool permissions.
- Running `>>act_as_chief_of_staff` loads its persona; "give me my operating brief" makes Claude read
  `Config/identity.json` / `Memory/*`, run a `cos-*` wrench, and answer **as** the agent.

---

*Local verification without Desktop:* `cd desktop-extension && node --check bridge.js`, then pipe a JSON-RPC
`initialize` + `tools/list` into `node bridge.js` with `TOOLBELT_MCP_URL` + `TOOLBELT_API_KEY` set to confirm
the server starts fast and lists the agent's tools. (No Toolbelt creds were available in the prior dev
sandbox — that's why the live Desktop test is the real gate.)

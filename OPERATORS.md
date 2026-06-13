# Builder Operator Guide — packaging Toolbelt agents for Claude

**Audience:** builder operators (MSPs, IT advisors — today: Apexti; soon: partners) who
build governed agents in Toolbelt and want their end users to run them inside Claude.

**What you're shipping:** each agent becomes a **connector + skill pair**. The end user
installs a plugin from your marketplace; on their first question the skill greets them as
the agent's setup guide, hands them the connector installer right in the chat, and walks
them through the one-time setup. After that, asking "what's on my calendar?" just works —
answered by *your governed agent*, with its live instructions, skills, memory, and
audited tools. Edit the agent in Toolbelt and every installed copy updates on the next
message. Nothing to redeploy.

---

## One-time setup (operator machine)

1. Node 18+, this repo cloned, and the build toolkit folder (`toolbelt-assistant-mcpb`)
   beside it.
2. Your Toolbelt API key in `~/.toolbelt/api_key`:
   `mkdir -p ~/.toolbelt && printf '%s\n' 'tb_YOUR_KEY' > ~/.toolbelt/api_key && chmod 600 ~/.toolbelt/api_key`

## Packaging an agent (the whole workflow)

1. **Build the agent in Toolbelt** — instructions, services, wrenches, memory. The agent
   IS the product; packaging just delivers it.
2. **Add one roster entry** in `toolbelt-assistant-mcpb/assistants.json`:
   ```json
   { "name": "Pipeline-Coach",
     "workspace_id": "<the agent's workspace ID>",
     "description": "One sentence a buyer would understand.",
     "triggers": "deals, pipeline review, stalled deals, CRM hygiene, next steps" }
   ```
   `workspace_id` is the Toolbelt **assistant ID** (`toolbelt list_assistants` or the
   dashboard URL) — *not* a Cowork connector ID. `triggers` decide when Claude reaches
   for this agent unprompted — write them like the user talks.
3. **Run the packager:**
   ```bash
   node package-agent.mjs --agent "Pipeline-Coach"
   ```
   It will (a) **provision** the agent's Toolbelt side — interop contract, storage
   index, daily archivist, a CLIENT INTEROP section appended to the system prompt —
   showing you the exact persona addition and asking y/N (idempotent; re-runs are
   no-ops; `--dry-run` to preview); then (b) build the namespaced `.mcpb` connector and
   the skill-only plugin with the installer bundled inside.
4. **Review and publish:** `git diff` in this repo, commit, push. Marketplace syncs can
   take up to ~30 minutes; "⋯ → Update" on the marketplace in Claude forces it.

## What provisioning adds to the agent (and why)

- `Skills/ClientInterop.md` — how to receive/process/return chat-client requests:
  always return readable text, short answers + storage handles, no >2K-token dumps.
- `INDEX.md` — the one file agents read instead of scanning all of storage.
- **Daily archivist task** — sweeps `Inbox/` (>14 days) to `Archive/`, keeps the index
  small, never touches binaries or config/memory/skills.
- **Persona section** — points the agent at the contract. Appended once, marker-checked,
  nothing removed. This is what makes the agent a great citizen inside Claude's context
  window instead of flooding it.

## What your end user does (copy-paste this to customers)

> 1. In Claude: **Customize → Plugins → "+" → Add marketplace** → enter
>    `dataPhysicist/toolbelt-for-claude`, then install the agent (e.g. **Chief of staff**).
> 2. **Connect it by URL.** Settings → **Connectors → Add connector** → paste the agent's
>    URL (your skill hands it to you on first run; it looks like
>    `https://toolbelt-oauth-gateway.onrender.com/workspaces/<id>/mcp`). **Sign in** with
>    your Toolbelt API key once on the page that opens — done. Works on claude.ai web too.
> 3. Start a new chat, toggle the agent on in the "+" → Connectors menu, and ask away.

Each user signs in with their **own** Toolbelt key (sealed on the gateway, never in
Claude). Per-user access and IT/Security's server-side tool policy both apply. Never
distribute a shared key.

**Offline / keychain alternative:** instead of step 2, have the user double-click the
agent's `.mcpb` (bundled in the skill, or in [`dist/`](dist/)) and enter their key +
workspace ID at install. The key lives in their OS keychain; no gateway involved. Good for
a single machine; the URL path is better for distributing to a team and is the only one
that works on claude.ai web.

**Gateway is the recommended distribution path.** Deploy [`gateway/`](gateway/README.md)
once on any HTTPS host and every agent becomes one URL —
`https://<gateway>/workspaces/<that agent's workspace id>/mcp`. Hand customers the URLs
for the agents they should have; their employees add the connector and sign in with their
own keys. (`render.yaml` makes this a ~5-minute Render deploy.)

## Governed approvals (a selling point for IT/Security)

Tool permissions are set **server-side in Toolbelt** by whoever owns the service/org/
workspace — not in each user's Claude settings. Set a tool to:

- **`allow`** — runs normally.
- **`ask`** — Toolbelt refuses to run it and the connector shows the user a
  **🔒 APPROVAL REQUIRED** prompt in Claude; it executes only after the user explicitly
  approves (the proxy re-calls with the confirmation Toolbelt issued). Use for external
  sends, CRM/finance writes, deletes — anything irreversible.
- **`deny`** — cannot be run from any client; Claude explains org policy blocks it.

Because the policy and enforcement live on the server, a user can't switch it off from
their Claude connector settings — which is exactly what a customer's security review wants
to hear. Pair this with Toolbelt's audit log and you can show *what ran, who approved it,
and that it stayed in policy*. (Lead with this when selling to regulated or IT-cautious
customers; it's the clearest "why not just raw Claude?" answer.)

## Updating agents after launch

- **Instructions, skills (wrenches), files, memory, model:** edit in Toolbelt — live
  everywhere instantly. No repackaging.
- **Name, description, triggers, or tool-prefix changes:** edit the roster, re-run the
  packager, push. Users get the update via the marketplace.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Connector isn't connected" in chat | Connector not installed or not toggled on for that chat — the skill walks the user through it. Connectors attach at chat start: new chat after installing. |
| Update button missing in Claude | Marketplace sync lag — "⋯ → Update" on the marketplace; verify the plugin version on its detail page. |
| Tools vanish when two agents enabled | Fixed ≥ v2.5.1 (per-agent tool namespacing + dedupe). Check Settings → Extensions shows the current version. |
| Agent answers with raw JSON / nothing | The workspace tool returned structured-only output — connector ≥ v2.4.0 converts it; also fix the wrench/tool to return text. |
| Logs | `~/Library/Logs/Claude/mcp-server-<Agent>.log` — the connector logs every step to stderr, including dropped duplicate tools. |

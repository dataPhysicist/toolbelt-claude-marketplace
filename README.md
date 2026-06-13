# Toolbelt for Claude

**Bring your Toolbelt agents into Claude — their knowledge, skills, memory, and connected
tools — so Claude stops being a brilliant stranger and starts being your team.**

## Quick start — connect an agent in ~2 minutes

The fastest way to get going. No file to download, no API key typed into Claude, no
workspace ID to look up, nothing to build. Works in Claude Desktop, Cowork, **and
claude.ai web**.

1. **Add the connector.** Claude → **Settings → Connectors → Add connector** (or "+" →
   *Add connector* in any chat). Paste the agent's URL:

   ```
   https://toolbelt-oauth-gateway.onrender.com/workspaces/<workspace_id>/mcp
   ```

2. **Sign in once.** Claude opens the agent's sign-in page → paste your Toolbelt API key
   (Toolbelt → **Settings → Connect to Claude**) → submit. The key is sealed on the
   gateway; Claude only ever holds opaque tokens.
3. **Start a new chat**, toggle the agent on in the "+" → Connectors menu, and ask away.

That's the whole install — the connector self-routes, so it works on its own. Edit the
agent in Toolbelt and the next message reflects it; nothing is copied or goes stale.

> **No gateway URL yet?** Deploy [`gateway/`](gateway/README.md) once (~5 min on Render)
> and every agent becomes one URL like the above. **Want the routing skill or an offline
> install instead?** See [More ways to install](#more-ways-to-install).

---

## Why connect Claude to Toolbelt?

Claude is a world-class generalist, and with enough patience you can dress it up
yourself: a Project here, some memory there, a few connectors, custom instructions,
maybe a skill or two. Plenty of people do — and what they end up with is a careful,
personal setup that lives inside *one person's* Claude. It can't be handed to a
teammate, it isn't versioned or audited, it doesn't run anywhere else, and when the
person who built it leaves, it leaves with them.

A **Toolbelt agent** is that same idea done as infrastructure instead of personal
craft. You build the agent once in [Toolbelt](https://apexti.com), and everyone it's
shared with gets the identical, governed, always-current version — in Claude, and in
every other interface Toolbelt serves. Each agent has its own operating instructions,
versioned skills ("wrenches"), persistent memory and files, governed connected tools
(Gmail, Calendar, Slack, CRM, …), and a team of other agents it can delegate to.

**Claude is the front door; Toolbelt is the brain.** Asking "what's on my calendar?"
just works — answered by your Chief-of-Staff with its tools, its memory, and its
judgment. Everything stays live: edit the agent in Toolbelt and Claude picks up the
change on the next call. Nothing is copied, nothing goes stale, governance never leaves
the server.

| | Do-it-yourself Claude setup | Claude + a Toolbelt agent |
|---|---|---|
| Persona | custom instructions you maintain by hand | the agent's operating instructions, fetched live — edit once in Toolbelt, applies everywhere |
| Skills | personal skills, per machine | versioned workflows (wrenches) shared by everyone using the agent |
| Memory | your chats and Projects, yours alone | the agent's own files and memory — shared, persistent, interface-independent |
| Tools | connectors each person wires up themselves | the agent's governed services, with permissions enforced server-side |
| Oversight | none — every user is on their own | audit trail and spend control for everything every user does |
| Teamwork | one person's assistant | a roster: agents delegate to each other, and the whole team uses the same ones |
| Portability | locked to your Claude account | the same agent works in Claude, ChatGPT, Gemini, and Toolbelt itself |

## What makes this design interesting

**Your agents never go stale.** Nothing is copied into Claude — instructions, skills
(wrenches), files, and memory are fetched live from Toolbelt on every use. Edit an agent
in Toolbelt and every connected copy, on every machine, behaves differently on the very
next message. The routing skills auto-update too: push a new version to this repo and
installed plugins pick it up from the marketplace.

**One question, many models.** Toolbelt agents can spawn sub-chats on OpenAI, Gemini,
Anthropic, or free Crescent models, picked per task by Model Auto-Pilot — so from inside
Claude you can route a job to `gpt-5.4-mini`, run research on `gemini-3.5-flash`, or ask
the *same question to three providers and compare the answers*. Claude is the interface;
the work runs wherever it runs best.

**No one-way doors.** If you build your business natively on a single AI ecosystem,
you've signed a lease you can't break: when that vendor raises prices, has an outage, or
changes terms, your only options are pay up or rebuild everything from scratch. With
Toolbelt as the brains, your agents — their instructions, workflows, memory, integrations,
and governance — live in a layer that speaks to *every* provider and *every* interface.
Claude is a front door you chose, not a foundation you're stuck on.

**Approvals your IT team controls — enforced inside Claude.** In Toolbelt, IT/Security
sets per-tool permissions (`allow` / `ask` / `deny`) at the owner, org, or workspace
level. When a user in Claude triggers an action marked **"ask"** — say, sending an
external email or a CRM write — Toolbelt **refuses to run it** until the user explicitly
approves, and a **"deny"** tool can't run at all. The policy lives on the server, so a
user can't switch it off from their Claude settings. Compare that to raw Claude, where
tool permissions are per-user client config that no admin can govern. **Same chat your
team already likes — now with the guardrails an enterprise needs.**

## More ways to install

The Quick Start above is all most people need. The other pieces are optional:

**Routing skill (marketplace plugin).** Customize → Plugins → "+" → **Add marketplace** →
enter `dataPhysicist/toolbelt-for-claude`, then install the agent (e.g. **Chief of
staff**). It teaches Claude *when* to reach for the agent unprompted ("ask my
Chief-of-Staff…"), hands you the connect URL on first run, and auto-updates from this
repo. Optional — the connector self-routes without it.

**Offline / keychain install (`.mcpb`).** Prefer your key in the OS keychain, or working
without the gateway? Double-click the agent's `.mcpb` (in [`dist/`](dist/), or bundled in
the skill on first run) and enter your API key + workspace ID at install. The local
`.mcpb` also adds proxy niceties the bare URL doesn't: tool **namespacing** (`cos_*`,
`st_*`) so many agents run in one chat without collisions, structured-output→readable-text
conversion, and read-only annotations so Claude prompts less.

**Claude Code (CLI).** `claude plugin marketplace add dataPhysicist/toolbelt-for-claude`,
then `claude plugin install chief-of-staff@apexti-toolbelt`, plus the connector via
`claude mcp add` (the gateway URL) or the `.mcpb`.

## How it works

```
Claude (Desktop / Cowork / web / Code)
   │  connector: a remote URL via the OAuth gateway (recommended), or a local .mcpb proxy
   │  optional routing skill (from this marketplace): reaches for the right agent unprompted
   ▼
Toolbelt workspace MCP endpoint   (OAuth via gateway/, or Bearer key via .mcpb)
   │  the agent's live tools · wrenches · files · memory · delegations
   ▼
Your governed services (Gmail, Calendar, Slack, CRM, …)
```

Nothing is embedded: instructions, tools, and files are read live from Toolbelt on every
use — so the agent in Claude is always exactly the agent you built, regardless of how you
connected it.

## What's in this repo

```
gateway/                       OAuth gateway: real MCP OAuth for Toolbelt, zero server changes
                               → serves the connect URL <gateway>/workspaces/<id>/mcp (the Quick Start path)
plugins/<agent>/               Per-agent routing skills (skill-only plugins)
plugins/toolbelt-get-started/  Org onboarding plugin (connect, list agents, route work)
dist/                          Prebuilt installers: per-agent .mcpb connectors + .plugin skills
```

More agents are added by registering them in the build roster (`assistants.json`) and
rebuilding — each becomes its own connector + skill pair, installable and toggleable
independently.

---

Powered by [Apexti](https://apexti.com) · Toolbelt is the operating layer for governed AI
agents — built once, used everywhere your team already works.

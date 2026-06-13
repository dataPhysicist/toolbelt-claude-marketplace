# Toolbelt for Claude

**Bring your Toolbelt agents into Claude — their knowledge, skills, memory, and connected
tools — so Claude stops being a brilliant stranger and starts being your team.**

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
every other interface Toolbelt serves. Each agent has:

- **Its own operating instructions** — who it is, how your business works, what good output looks like
- **Skills ("wrenches")** — your proven, repeatable workflows, codified and versioned
- **Memory and files** — it remembers decisions, open loops, and context across every session
- **Connected tools** — your Gmail, Calendar, Slack, CRM, and internal systems, with permissions, audit logs, and spend control enforced server-side
- **A team** — agents can delegate to each other (your Chief-of-Staff can hand work to your researcher, your ticket-triager, your strategist)

This repo connects the two: **Claude is the front door; Toolbelt is the brain.** Install
an agent's plugin and Claude can *become* that agent — asking "what's on my calendar?"
just works, answered by your Chief-of-Staff with its tools, its memory, and its judgment.
Everything stays live: edit the agent in Toolbelt and Claude picks up the new
instructions on the next call. Nothing is copied, nothing goes stale, and governance
never leaves the server.

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
in Toolbelt and every installed copy, on every machine, behaves differently on the very
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
Claude is a front door you chose, not a foundation you're stuck on. Swap models, mix
providers, or add ChatGPT and Gemini as additional front doors — nothing gets rebuilt.

**Approvals your IT team controls — enforced inside Claude.** This is the one most
AI-in-chat setups can't do. In Toolbelt, IT/Security sets per-tool permissions
(`allow` / `ask` / `deny`) at the owner, org, or workspace level. When a user in Claude
triggers an action marked **"ask"** — say, sending an external email or a CRM write —
Toolbelt **refuses to run it** and the connector shows a clear **🔒 APPROVAL REQUIRED**
prompt; the action only happens after the user explicitly approves, and a **"deny"** tool
can't run at all. The policy lives on the server, so a user can't switch it off from their
Claude settings, and it works on today's Claude clients with no special support. Compare
that to raw Claude, where tool permissions are per-user client config that no admin can
govern. **Same chat your team already likes — now with the guardrails an enterprise needs.**

**Agents coexist cleanly.** Every agent's tools are namespaced (`cos_*`, `st_*`), so you
can run your whole roster in one chat without collisions, toggle each agent per
conversation, and see exactly which agent did what in the tool-call log.

## How it's packaged: connector + skill, separately

Each agent ships as **two small pieces** that work together:

1. **The connector** — how the agent's live tools reach Claude. Two interchangeable forms:
   - **By URL (recommended):** add `https://toolbelt-oauth-gateway.onrender.com/workspaces/<id>/mcp`
     as a remote connector and sign in once on a web page. No file, no key typed into
     Claude, no workspace ID to look up. Works in Desktop, Cowork, **and claude.ai web**.
     Deploy [`gateway/`](gateway/README.md) once to get the URL.
   - **By file:** a one-click `.mcpb` desktop extension (in `dist/`) that stores your API
     key in the **OS keychain** and sends it as a Bearer header — no gateway needed.

   Either way the agent's persona loads live, read-only tools are annotated so Claude
   prompts less, and every tool is **namespaced with the agent's initials**
   (`cos_get_calendar`, `st_wrench_execute`) so any number of agents coexist without
   collisions. Each agent gets its own **on/off toggle in every chat's "+" menu** and
   fully inspectable tool calls.
2. **The routing skill** — a plugin from this marketplace. It teaches Claude *when* to
   use the agent ("what's on my calendar?" → Chief-of-Staff) without being told, hands
   the user the connect URL (or the bundled `.mcpb`) on first run, and updates
   automatically when this repo changes.

## Install (Claude Desktop / Cowork / web)

1. **Add the routing skill.** Customize → Plugins → "+" → Add marketplace → enter
   `dataPhysicist/toolbelt-for-claude`, then install the agent's plugin (e.g. **Chief of
   staff**). *(Skip this if you only want the connector — the connector self-routes; the
   skill just makes "talk to my Chief-of-Staff" phrasing work proactively.)*
2. **Connect the agent — by URL (recommended).** Settings → **Connectors → Add
   connector**, paste `https://toolbelt-oauth-gateway.onrender.com/workspaces/<id>/mcp`
   (the skill hands you the exact per-agent URL on first run), and **sign in** with your
   Toolbelt API key once on the page that opens. No key touches Claude; no workspace ID
   to type. This is the only path that also works on **claude.ai web**.
3. Start a **new** conversation (connectors attach at chat start), confirm the agent is
   toggled on in the "+" → Connectors menu, and ask away.

**Offline / keychain alternative:** instead of step 2, double-click the agent's `.mcpb`
(bundled in the skill on first run, or grab it from [`dist/`](dist/)) and enter your API
key + workspace ID at install. Same agent, key held in the OS keychain.

Claude Code users: `claude plugin marketplace add dataPhysicist/toolbelt-for-claude`,
then `claude plugin install chief-of-staff@apexti-toolbelt`, plus the connector via
`claude mcp add`.

## What's in this repo

```
plugins/chief-of-staff/        Chief-of-Staff routing skill (skill-only plugin)
plugins/smart-ticketing/       Smart-Ticketing routing skill (skill-only plugin)
plugins/toolbelt-get-started/  Org onboarding plugin (connect, list agents, route work)
gateway/                       OAuth gateway: real MCP OAuth for Toolbelt, zero server changes
                               → the connect URL <gateway>/workspaces/<id>/mcp (recommended path)
dist/                          Prebuilt installers: per-agent .mcpb connectors + .plugin skills
```

More agents are added by registering them in the generator's roster and rebuilding —
each agent becomes its own connector + skill pair, installable and toggleable
independently.

## How it works

```
Claude (Desktop / Cowork / Code)
   │  skill (from this marketplace): routes the request to the right agent
   │  connector (.mcpb proxy, zero deps, namespaced cos_*/st_* — or remote URL via gateway/)
   ▼
Toolbelt workspace MCP endpoint  (Bearer auth, or OAuth via gateway/)
   │  the agent's tools · wrenches · files · delegations
   ▼
Your governed services (Gmail, Calendar, Slack, CRM, …)
```

Nothing is embedded: instructions, tools, and files are read live from Toolbelt on every
use, so the agent in Claude is always exactly the agent you built.

---

Powered by [Apexti](https://apexti.com) · Toolbelt is the operating layer for governed AI
agents — built once, used everywhere your team already works.

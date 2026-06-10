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

## How it's packaged: connector + skill, separately

Each agent ships as **two small pieces** that work together:

1. **The connector** — a one-click `.mcpb` desktop extension (in `dist/`). It proxies the
   agent's live Toolbelt MCP endpoint: persona loaded live, read-only tools annotated so
   Claude prompts less, and every tool **namespaced with the agent's initials**
   (`cos_get_calendar`, `st_wrench_execute`) so any number of agents coexist without
   tool-name collisions. Your API key goes into the **OS keychain** at install. Because
   it's a regular connector, each agent gets its own **on/off toggle in every chat's "+"
   menu** and fully inspectable tool calls.
2. **The routing skill** — a plugin from this marketplace. It teaches Claude *when* to
   use the agent ("what's on my calendar?" → Chief-of-Staff) without being told, ships
   the connector installer inside it, and updates automatically when this repo changes.

## Install (Claude Desktop / Cowork)

1. **Customize → Plugins → "+" → Add marketplace** → enter
   `dataPhysicist/toolbelt-for-claude`, then install the agent's plugin (e.g. **Chief of
   staff**).
2. Start a chat and ask something in the agent's lane — *"What's on my calendar
   today?"* On first run the skill hands you the bundled connector installer right in
   the chat: double-click it, enter your Toolbelt API key (Toolbelt → Settings → Connect
   to Claude; stored in the OS keychain).
3. Start a **new** conversation (connectors attach at chat start), confirm the agent is
   toggled on in the "+" → Connectors menu, and ask again.

(Manual alternative: grab the `.mcpb` straight from [`dist/`](dist/) and double-click it
before installing the plugin.)

Prefer OAuth over API keys (e.g. distributing to a team or using claude.ai web)? Deploy
[`gateway/`](gateway/README.md) and add
`https://<your-gateway>/workspaces/<id>/mcp` as a remote connector instead of the
`.mcpb` — users sign in on a web page; no key ever touches Claude.

Claude Code users: `claude plugin marketplace add dataPhysicist/toolbelt-for-claude`,
then `claude plugin install chief-of-staff@apexti-toolbelt`, plus the connector via
`claude mcp add`.

## What's in this repo

```
plugins/chief-of-staff/        Chief-of-Staff routing skill (skill-only plugin)
plugins/smart-ticketing/       Smart-Ticketing routing skill (skill-only plugin)
plugins/toolbelt-get-started/  Org onboarding plugin (connect, list agents, route work)
gateway/                       OAuth gateway: real MCP OAuth for Toolbelt, zero server changes
dist/                          Prebuilt installers: per-agent .mcpb connectors + .plugin skills
desktop-extension/             Legacy single-bundle extension (superseded by dist/*.mcpb)
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

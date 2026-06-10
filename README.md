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

## Install (Claude Desktop / Cowork)

1. In Claude Desktop: **Customize → Plugins → "+" → Add marketplace** → enter
   `dataPhysicist/toolbelt-for-claude`
2. Install the agent plugin you want (e.g. **Chief of staff**).
3. Give it your Toolbelt API key (Toolbelt → Settings → Connect to Claude). Pick one:
   - **Key file (recommended for now):**
     `mkdir -p ~/.toolbelt && printf '%s\n' 'tb_YOUR_KEY' > ~/.toolbelt/api_key && chmod 600 ~/.toolbelt/api_key`
     One file, shared by every agent plugin.
   - **In chat:** just ask the agent something; it will request the key once via its
     `toolbelt_setup` tool and save it for you.
   - **OAuth sign-in (best for distributing to others):** deploy `gateway/` and connect
     via URL — users sign in on a web page, no key ever touches a chat. See
     [gateway/README.md](gateway/README.md).
4. Start a **new** conversation and ask something in the agent's lane —
   *"What's on my calendar today?"* — and watch it route, load the persona, and answer.

Each plugin ships two things: a **connector** (a dependency-free local proxy to the
agent's live Toolbelt MCP endpoint — tools tagged with the agent's name, persona loaded
live via `load_persona`) and a **routing skill** (so Claude knows *when* to use the agent
without being told).

Claude Code users: `claude plugin marketplace add dataPhysicist/toolbelt-for-claude`,
then `claude plugin install chief-of-staff@apexti-toolbelt`.

## What's in this repo

```
plugins/chief-of-staff/        Chief-of-Staff plugin (connector + routing skill)
plugins/toolbelt-get-started/  Org onboarding plugin (connect, list agents, route work)
gateway/                       OAuth gateway: real MCP OAuth for Toolbelt, zero server changes
desktop-extension/             Legacy one-click .mcpb desktop extension (keychain-based)
dist/                          Prebuilt .plugin files for direct upload
```

More agents are added by registering them in the generator's roster and rebuilding —
each agent becomes its own plugin, installable and toggleable independently.

## How it works

```
Claude (Desktop / Cowork / Code)
   │  plugin: routing skill + local proxy (zero dependencies)
   ▼
Toolbelt workspace MCP endpoint  (Bearer auth, or OAuth via gateway/)
   │  the agent's tools · wrenches · files · delegations
   ▼
Your governed services (Gmail, Calendar, Slack, CRM, …)
```

The proxy never embeds anything: instructions, tools, and files are read live from
Toolbelt on every use, so the agent in Claude is always exactly the agent you built.

---

Powered by [Apexti](https://apexti.com) · Toolbelt is the operating layer for governed AI
agents — built once, used everywhere your team already works.

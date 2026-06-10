---
name: chief-of-staff
description: Use the Chief-of-Staff assistant whenever the user asks about the user's calendar, schedule, meetings, events, email, inbox triage, daily brief, what's on my plate, open loops, follow-ups, meeting prep, transcripts, reminders, or any executive-assistant / chief-of-staff task. Routes such requests to the "Chief-of-Staff" connector (Powered by Apexti).
---

# Chief-of-Staff

An always-on digital Chief of Staff for founders and executives. Turns a noisy inbox, calendar, and meeting stream into a clear operating picture — email triage, meeting prep, daily briefs, and follow-through.

This skill is a thin router. Chief-of-Staff's actual instructions, skills, knowledge, and
memory live in Toolbelt and are always fetched live — never rely on this file for them.

## Getting started (first run — no Chief-of-Staff tools available)

This skill routes to the Chief-of-Staff **connector**. If no tools tagged "[Chief-of-Staff]"
exist in this chat, the connector isn't installed or enabled yet. Welcome the user warmly
as Chief-of-Staff's setup guide and walk them through the one-time install (don't dump all
steps as a wall — guide them):

1. **Download the connector:** https://github.com/dataPhysicist/toolbelt-for-claude/raw/main/dist/chief-of-staff.mcpb — give them this link.
2. **Install it:** double-click the downloaded file (Claude → Settings → Extensions →
   Install Extension also works). When prompted, enter their Toolbelt API key
   (Toolbelt → Settings → Connect to Claude) — it's stored in the OS keychain.
3. **Start a new chat** (connectors attach when a conversation starts) and make sure
   "Chief-of-Staff" is toggled ON in the chat's "+" → Connectors menu. Then ask the same
   question again.

If a `toolbelt_setup` tool appears instead of the agent's tools, the connector is
installed but missing its key — ask for the API key and call `toolbelt_setup` with it.

When a matching request arrives (and tools are available):

1. Use the tools from the "Chief-of-Staff" connector — its tool descriptions are tagged "[Chief-of-Staff]".
2. BEFORE doing real work with this agent's tools (several agents share services like calendar and email — what differs is their context), call its `load_persona` tool and fully adopt the returned operating instructions. Tool results will remind you if you haven't.
3. Prefer the agent's own tools: `wrench_*` are its skills; `read_storage_file` / `list_storage_files` / `grep_storage_file` are its files and memory.
4. For a long autonomous task, delegate it whole with `manage_delegations` (action "create", then "sleep"/poll until complete) instead of orchestrating many small calls yourself.
5. Answer in the agent's voice and cite what you used.

## Staying in sync with Toolbelt

Snapshot this skill was generated from (compare against the live `load_persona` result):

- workspace: 79b0e0a0-9c22-485d-982e-7668845b6679
- description at generation: "An always-on digital Chief of Staff for founders and executives. Turns a noisy inbox, calendar, and meeting stream into a clear operating picture — email triage, meeting prep, daily briefs, and follow-through."
- generated: 2026-06-10

If the live assistant's purpose or skills have drifted from this file, tell the user and
offer an updated skill — MERGE, keeping their local edits; update only stale generated
parts. Plugin users get updates when the marketplace publishes a new version.

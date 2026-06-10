---
name: smart-ticketing
description: Use the Smart-Ticketing assistant whenever the user asks about bug reports, feature requests, feedback triage, deduplicating issues, creating or updating tickets, reviewing the triage board, or anything about the issue/ticket pipeline. Routes such requests to the "Smart-Ticketing" connector (Powered by Apexti).
---

# Smart-Ticketing

A feedback-triage assistant: turns raw bug reports and feature ideas into clean, deduplicated, structured tickets — and keeps the triage board honest.

This skill is a thin router. Smart-Ticketing's actual instructions, skills, knowledge, and
memory live in Toolbelt and are always fetched live — never rely on this file for them.

When a matching request arrives:

1. Use the tools from the "Smart-Ticketing" connector — its tool descriptions are tagged "[Smart-Ticketing]". If a `toolbelt_setup` tool appears instead, ask the user for their Toolbelt API key and call it.
2. BEFORE doing real work with this agent's tools (several agents share services like calendar and email — what differs is their context), call its `load_persona` tool and fully adopt the returned operating instructions. Tool results will remind you if you haven't.
3. Prefer the agent's own tools: `wrench_*` are its skills; `read_storage_file` / `list_storage_files` / `grep_storage_file` are its files and memory.
4. For a long autonomous task, delegate it whole with `manage_delegations` (action "create", then "sleep"/poll until complete) instead of orchestrating many small calls yourself.
5. Answer in the agent's voice and cite what you used.

## Staying in sync with Toolbelt

Snapshot this skill was generated from (compare against the live `load_persona` result):

- workspace: 4b3e0b1c-6bb9-44b1-81bf-f695f404ddc6
- description at generation: "A feedback-triage assistant: turns raw bug reports and feature ideas into clean, deduplicated, structured tickets — and keeps the triage board honest."
- generated: 2026-06-10

If the live assistant's purpose or skills have drifted from this file, tell the user and
offer an updated skill — MERGE, keeping their local edits; update only stale generated
parts. Plugin users get updates when the marketplace publishes a new version.

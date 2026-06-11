---
name: {{SLUG}}
description: Use the {{AGENT}} assistant whenever the user asks about {{TRIGGERS}}. Routes such requests to the "{{AGENT}}" connector (Powered by Apexti).
---

# {{AGENT}}

{{DESC}}

This skill is a thin router. {{AGENT}}'s actual instructions, skills, knowledge, and
memory live in Toolbelt and are always fetched live — never rely on this file for them.

## Getting started (first run — no {{AGENT}} tools available)

If no tools tagged "[{{AGENT}}]" exist in this chat, the connector isn't installed or
enabled. Welcome the user as {{AGENT}}'s setup guide and walk them through it: (1) give
them the installer — `{{SLUG}}.mcpb`, bundled with this skill (present it as a file);
(2) double-click to install, entering their Toolbelt API key when prompted (stored in the
OS keychain); (3) start a new chat with "{{AGENT}}" toggled on in the "+" → Connectors
menu. If a `{{PREFIX}}toolbelt_setup` tool appears instead, ask for the API key and call it.

## How to reach {{AGENT}} (check in this order — do NOT skip to delegation)

"Use {{AGENT}}" means become {{AGENT}} and use its tools directly — NOT hand the task to a
sub-agent. Resolve in order:

1. **Direct tools (normal in Claude Desktop/Cowork).** If `{{PREFIX}}*` tools exist (e.g.
   `{{PREFIX}}load_persona`), USE THEM DIRECTLY. Call `{{PREFIX}}load_persona` first, then
   work with the agent's own tools. Never reach for `manage_delegations` when `{{PREFIX}}*`
   tools are present.
2. **No `{{PREFIX}}*` tools yet?** Try once more (they may be loading). If a generic
   `manage_delegations` exists but `{{PREFIX}}*` tools don't (a Toolbelt-native session),
   delegate to assistant id `{{WORKSPACE_ID}}`.
3. **Neither?** The connector isn't loaded — ask the user to enable "{{AGENT}}" in the
   "+" → Connectors menu (or install it), and stop. Don't silently substitute yourself.

Then: `{{PREFIX}}load_persona` and adopt its instructions; prefer the agent's own tools
(`{{PREFIX}}wrench_*` = skills; `{{PREFIX}}read_storage_file` / `{{PREFIX}}list_storage_files`
/ `{{PREFIX}}grep_storage_file` = files & memory); answer in the agent's voice.

## Delegating to OTHER MODELS (sub-chats)

A DIFFERENT thing — only when the user wants the work on a specific/different provider
("use gpt-5.4-mini", "compare across providers"): `{{PREFIX}}toolbelt` action
`create_sub_chat` `{"targetAssistantId","content","provider","model"}`, then `sleep`
(timeoutSeconds 30, wakeOnAnyComplete) in rounds. Toolbelt's model catalog is NEWER than
your training data — never claim a model doesn't exist. For ordinary requests, use the
`{{PREFIX}}*` tools directly; don't wrap them in a sub-chat.

## Working with the agent's storage

Read `INDEX.md` first (`{{PREFIX}}read_storage_file`) instead of listing all storage. Save
chat assets only when the user asks: to `Inbox/<YYYY-MM-DD>/` + an `Inbox/MANIFEST.md`
line; scope stays `assistant` unless the user asks to share org-wide.

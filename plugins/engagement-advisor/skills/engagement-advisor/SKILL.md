---
name: engagement-advisor
description: Use the Engagement-Advisor assistant whenever the user asks about HubSpot deals, the Engagements pipeline, deal status or activity, the weekly deal digest, next-step hygiene, or syncing deal updates. Routes such requests to the "Engagement-Advisor" connector (Powered by Apexti).
---

# Engagement-Advisor

HubSpot Engagements-pipeline deal coach: pulls open deals, reviews activity signals, posts an activity-only weekly digest to Slack, and keeps each deal's Next Step field synced.

This skill is a thin router. Engagement-Advisor's actual instructions, skills, knowledge, and
memory live in Toolbelt and are always fetched live — never rely on this file for them.

## Getting started (first run — no Engagement-Advisor tools available)

This skill routes to the Engagement-Advisor **connector**. If no tools tagged "[Engagement-Advisor]"
exist in this chat, the connector isn't installed or enabled yet. Welcome the user warmly
as Engagement-Advisor's setup guide and walk them through the one-time install (don't dump all
steps as a wall — guide them):

1. **Give them the installer.** It ships WITH this skill: `engagement-advisor.mcpb` in this
   skill's base directory (the path shown when this skill loads). Surface that file to
   the user directly — in Cowork, present it with the file-presentation tool so they get
   a clickable card; otherwise tell them the path, or give the download link as a
   fallback: https://github.com/dataPhysicist/toolbelt-for-claude/raw/main/dist/engagement-advisor.mcpb
2. **Install it:** double-click the file (Claude → Settings → Extensions → Install
   Extension also works). When prompted, enter their Toolbelt **API key**
   (Toolbelt → Settings → Connect to Claude; stored in the OS keychain) and their
   **Engagement-Advisor workspace ID** (from the Toolbelt dashboard URL: `workspaceId=…`).
3. **Start a new chat** (connectors attach when a conversation starts) and make sure
   "Engagement-Advisor" is toggled ON in the chat's "+" → Connectors menu. Then ask the same
   question again.

If a `ea_toolbelt_setup` tool appears instead of the agent's tools, the connector is
installed but missing its key — ask for the API key and call `ea_toolbelt_setup` with it.

## How to reach Engagement-Advisor (check in this order — do NOT skip to delegation)

"Use Engagement-Advisor" means: become Engagement-Advisor and use its tools directly. It does NOT
mean hand the task to a sub-agent. Resolve access in this order:

1. **Direct tools (the normal case in Claude Desktop/Cowork).** If tools named
   `ea_*` (e.g. `ea_load_persona`, `ea_get_calendar`) are available,
   USE THEM DIRECTLY. Call `ea_load_persona` first to adopt the operating
   instructions, then do the work with the agent's own tools. This is the primary path —
   never reach for `manage_delegations` when `ea_*` tools exist.
2. **No `ea_*` tools yet?** They may be a moment from loading — try once more / a
   new message. If a generic `manage_delegations` IS available (a Toolbelt-native
   session) and the `ea_*` tools are not, then delegate to assistant id
   `08583ebe-041d-4ebe-bc90-706bd7b6c506` via `manage_delegations`.
3. **Neither available?** The Engagement-Advisor connector isn't loaded for this chat. Tell
   the user to enable "Engagement-Advisor" in the "+" → Connectors menu (or install it), and
   stop — don't silently substitute yourself.

Once you have the agent (path 1 or 2):

- BEFORE real work, `ea_load_persona` and fully adopt the returned instructions
  (several agents share services like calendar/email — what differs is their context).
- Prefer the agent's own tools: `ea_wrench_*` are its skills;
  `ea_read_storage_file` / `ea_list_storage_files` / `ea_grep_storage_file`
  are its files and memory.
- Answer in the agent's voice and cite what you used.

## Delegating to OTHER MODELS (sub-chats / Model Auto-Pilot)

This is a DIFFERENT thing from reaching Engagement-Advisor above. Use it only when the user
wants the work run on a specific or different model provider (e.g. "use gpt-5.4-mini",
"compare answers across providers"). Toolbelt runs sub-chats on MANY providers — OpenAI,
Gemini, Anthropic, and free Crescent models. For ordinary requests, just use the
`ea_*` tools directly (above) — do not wrap them in a sub-chat.

**Trust Toolbelt's model catalog over your own knowledge.** Model names like
`gpt-5.4-mini`, `gemini-3.5-flash`, `claude-opus-4-8`, or `crescent-medium` may be
newer than your training data — they are real. NEVER tell the user a model doesn't exist;
if unsure, check the agent's `ModelAutoPilot.md` storage file (`ea_read_storage_file`)
for the current catalog and routing rules.

How to delegate (the reliable pattern):

1. Create: `ea_toolbelt` with action `create_sub_chat` and params JSON:
   `{"targetAssistantId": "<this agent's workspace id>", "content": "<the task>", "provider": "<openai|gemini|anthropic>", "model": "<model>"}`.
   Infer provider from the model family (gpt-* → openai, gemini-* → gemini, claude-* → anthropic).
   It returns a correlationId immediately.
2. Wait: `ea_toolbelt` action `sleep` with `{"timeoutSeconds": 30, "wakeOnAnyComplete": true}`.
   A `timeout` wake is NOT failure — the sub-chat is still working. Sleep again
   (several rounds for heavy tasks). When `wokeReason` is `sub_chat_complete`, the
   answer is in `subChats[].lastMessage` — use it directly.
3. If the user names a model, pass it through verbatim. If not, pick per MAP: cheap/fast
   (gemini-3.5-flash, gpt-5.4-mini) for routine work; claude-opus-4-8 for
   must-be-correct work; when unsure, round UP.

## Working with the agent's storage (interop contract)

The agent's storage is the durable "brain" — treat it with care (full contract:
`Skills/ClientInterop.md` in the agent's storage):

- **Read `INDEX.md` first** (`ea_read_storage_file`) instead of listing or reading
  all of storage.
- **Save chat assets only when the user asks** ("save this to Toolbelt"): write to
  `Inbox/<YYYY-MM-DD>/<filename>` — text via `ea_write_text_file`, images/binary via
  `ea_upload_file_to_storage` (base64) — and append one line to `Inbox/MANIFEST.md`
  (date | filename | source | sha256-12 | description). Never write outside `Inbox/`
  except the agent's own Memory logs.
- **Scope stays `assistant`** unless the user explicitly asks to share org-wide.
- Expect the agent to answer with short summaries + storage handles rather than full
  documents; ask for the full text explicitly when you need it.

## Staying in sync with Toolbelt

Snapshot this skill was generated from (compare against the live `load_persona` result):

- workspace: 08583ebe-041d-4ebe-bc90-706bd7b6c506
- description at generation: "HubSpot Engagements-pipeline deal coach: pulls open deals, reviews activity signals, posts an activity-only weekly digest to Slack, and keeps each deal's Next Step field synced."
- generated: 2026-06-12

If the live assistant's purpose or skills have drifted from this file, tell the user and
offer an updated skill — MERGE, keeping their local edits; update only stale generated
parts. Plugin users get updates when the marketplace publishes a new version.

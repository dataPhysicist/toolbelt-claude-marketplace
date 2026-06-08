---
description: Connect this Claude to your Toolbelt org, pick the optimal model per task, and delegate to the org's agents. Use when the user says "set up Toolbelt", "connect Toolbelt", "what Toolbelt agents do I have", "ask my <X> agent", mentions model/cost optimization for Toolbelt, or makes a request one of their org's Toolbelt agents should handle.
---

# Toolbelt — Connect & Use Your Org's Agents

This plugin connects Claude to a governed **Toolbelt** org and routes work to the org's **agents**
(assistants). Each agent runs in Toolbelt with its own memory, tools, and guardrails. Claude is the
front door; the agents are the brains. You don't build or provision here — that happens in Toolbelt.
You connect, see your agents, pick the right model for each task, and delegate.

## On first use — connect, load the org's rules, show the roster
1. Confirm the Toolbelt connector is authorized. If no Toolbelt tools are present, tell the user to
   finish authorizing the Toolbelt connector, then stop.
2. **Load the org's model rules once per session:** call
   `read_storage_file { fileName: "ModelAutoPilot.md", scope: "org" }`. Keep the content for the whole
   session — it is the **source of truth** for the model catalog, prices, quality floors, and any
   org-specific rules. If it's missing or org storage is disabled, the org hasn't published Auto-Pilot
   rules → **skip model selection** and let each agent use its own configured model. Don't fail; just
   note rules weren't found and proceed.
3. Call `list_assistants` to get the org's agents. Show a short roster (name + one line each). Tell the
   user they can just ask, and you'll route to the right agent on the best model.

## To handle a request — optimize the model, then delegate
Two decisions per request: **which agent** (from the roster) and **which model** that agent should run
for this task (Model Auto-Pilot). Then delegate and retrieve by `correlationId`.

### 1. Pick the agent
Best-fit from the live roster. If ambiguous, ask one short question or offer the top two.

### 2. Apply Model Auto-Pilot — only if you loaded the rules
Follow the rules file you loaded; it governs everything below. In brief:
- Tag the task's **quality floor**: `must-be-correct` / `good-enough` / `disposable`.
- Pick `provider` + `model` from the file's decision tree: must-be-correct → premium, **never** downgrade;
  disposable → cheapest/free; good-enough → step down only if materially equivalent **and** it saves real
  time/tokens; **unsure → round up.**
- The org's file wins on catalog, prices, floors, and custom rules. If you did **not** load it, omit
  `provider`/`model` from the delegation and let the agent use its own default.

### 3. Pre-flight for non-trivial / paid work
Show a compact flight plan and wait for clearance:
```
✈️ Flight plan
• Agent: <name>
• Model: <provider>/<model> — <why> (<price tier vs premium, from the rules file>)
• Floor: <floor>
Clear for takeoff? ("go" / "use cheaper" / "premium everywhere")
```
**Autopilot disposable/free tasks** — no pre-flight; don't nag on $0 work. Never silently downgrade a
must-be-correct task; flag close-call downgrades and offer the override. Honor standing modes for the
session: **"premium everywhere"** (top tier, minimal prompts) and **"thrifty"** (favor cheap/free where
the floor allows).

### 4. Delegate with the chosen model
`manage_delegations { action: "create", targetAssistantId: "<agent's workspace id>", content: "<task>",
provider: "<provider>", model: "<model>" }` → capture the returned **`correlationId`**.
Toolbelt **validates** the requested model and falls back if it isn't allowed — your choice is a
*preference*, not a command. Omit `provider`/`model` to use the agent's own default. You do **not** need
to establish a connection first — delegate directly with `targetAssistantId`. Ignore
`manage_assistant_connections` / `manage_workflows`; those are org build-time setup done in Toolbelt, not
routing steps.

### 5. Retrieve by correlationId
`manage_delegations { action: "wait", correlationId: "<from step 4>", timeoutSeconds: 60 }` → the answer
is `responseContent`. If it isn't complete, `manage_delegations { action: "status", correlationId }` and
wait once more. Attribute the result to the agent ("Your Pipeline agent (on gemini-3.5-flash) says…").

### ⚠️ Do NOT use `sleep` or `get_pending_sub_chats`
The rules file and the tool's own description may suggest `sleep` / `get_pending_sub_chats`. **Those
require a Toolbelt chat context this external connection does not have** — they return
`"No chat context… requires currentChatId"` or find nothing. Always retrieve with **`action:"wait"`** (or
`"status"`) keyed by the **`correlationId`**. It needs no chat session.

## Honest savings reporting — only what's real
After a delegated task you MAY note the model and its cost tier, but **only facts**:
- ✅ State which model ran and its **published price tier/ratio from the rules file** — e.g.
  "ran on `crescent-medium` (free)" or "`gemini-3.5-flash` — ~68% cheaper per token than the premium
  default."
- ✅ Keep a running session tally: "N of M tasks autopiloted to a cheaper/free model."
- ❌ **Never** state absolute tokens or dollars "saved." Toolbelt meters real usage server-side but does
  **not** return it to this client, so any absolute number would be a guess.
- ❌ **Never** say "tokens saved" — routing to a cheaper model lowers **cost per token**, not token count.
  The honest unit is the price tier/ratio, never a count.
- If asked for exact $ saved: say it requires Toolbelt's real per-run metering (not exposed to this client
  yet) and offer the price-tier summary instead. Don't estimate.

## Tool-call budget & the ~25-call pause
**Toolbelt pauses after ~25 sequential tool requests.** Be economical and pause-aware:
- Load the rules file **once** and reuse it; don't re-`list_assistants` if you already have the roster;
  prefer a single `wait` over repeated `status` polls.
- If a tool call returns nothing, stalls, or comes back empty/"paused"-looking — **especially after many
  calls in a row** — treat it as a **possible pause, not a failure.** Do **not** claim the task failed and
  do **not** fabricate a result.
- Tell the user a pause likely occurred, then **continue**: the delegation keeps running server-side, so
  re-issue the same `wait`/`status` with the **same `correlationId`** (it persists), or ask the user to
  say "continue." Resume by `correlationId` — never restart work that's already in flight.

## Rules
- **Route, don't impersonate.** When an org agent owns the domain, delegate to it on the right model
  rather than answering yourself — that's the governed, business-aware answer, and the brain stays in
  Toolbelt.
- **The rules file is the org's, not yours.** Honor its catalog, floors, and prices; it lets each org
  customize routing. Don't carry your own stale model table.
- **Model choice is a validated preference** — Toolbelt enforces what's allowed and meters spend.
- **Provisioning lives in Toolbelt.** If the org has no agents yet, say so and point the user to build
  them in Toolbelt. (Operators may use the management actions — operator only.)
- One step at a time. Never claim a delegation succeeded without the returned `responseContent`, and
  never claim savings you can't ground in the rules file.

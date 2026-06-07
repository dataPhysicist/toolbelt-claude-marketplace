---
description: Connect this Claude to your Toolbelt org and use its agents. Use when the user says "set up Toolbelt", "connect Toolbelt", "what Toolbelt agents do I have", "ask my <X> agent", or makes a request one of their org's Toolbelt agents should handle.
---

# Toolbelt — Connect & Use Your Org's Agents

This plugin connects Claude to a governed **Toolbelt** org and routes work to the org's **agents**
(assistants). Each agent runs in Toolbelt with its own memory, tools, and guardrails. Claude is the
front door; the agents are the brains. You don't build or provision here — that happens in Toolbelt.
You connect, see your agents, and delegate.

## On first use — connect & show the roster
1. Confirm the Toolbelt connector is authorized. If no Toolbelt tools are present, tell the user to
   finish authorizing the Toolbelt connector, then stop.
2. Call `list_assistants` to get the org's agents — **always fetch live; never assume a cached list.**
3. Show a short roster: each agent's name + one line on what it's for (from its description). Tell the
   user they can just ask, and you'll route to the right agent.

## To handle a request — delegate, then retrieve by correlationId

You are an **external** client: this connection has **no Toolbelt chat session**. That single fact
decides how you retrieve results (see the warning below). Use the **`manage_delegations`** tool for the
whole round-trip.

1. **Pick** the best-fit agent from the live roster. If it's ambiguous, ask one short question or offer
   the top two.
2. **Create** the task and capture the returned **`correlationId`**:
   `manage_delegations { action: "create", targetAssistantId: "<agent's workspace id>", content: "<the task>" }`
   (Only set `provider`/`model` if you have a specific reason; otherwise let the agent use its own.)
3. **Wait** for the answer by correlation id — this blocks until the agent finishes:
   `manage_delegations { action: "wait", correlationId: "<from step 2>", timeoutSeconds: 60 }`
   The agent's answer is the returned **`responseContent`**. Present it as that agent's response.
4. **If it isn't complete yet** (timeout), re-check with
   `manage_delegations { action: "status", correlationId: "<same id>" }`, and wait once more if needed.
   Never fabricate an answer; if it's still pending, say it was dispatched and you'll fetch the result.
5. **Attribute** the work to the agent ("Your Pipeline agent says…") so the user learns the team.

### ⚠️ Do NOT use `sleep` or `get_pending_sub_chats` here
The `manage_delegations` tool's own built-in description suggests `sleep` / `get_pending_sub_chats` to
collect results. **Those require a Toolbelt chat context that this external connection does not have** —
they return `"No chat context… requires currentChatId"` or silently find nothing. Always retrieve with
**`action: "wait"`** (or **`action: "status"`**) keyed by the **`correlationId`** from step 2. The
correlation id is all you need; it works with no chat session.

> Fallback — only if the connector exposes the `toolbelt` action dispatcher but **not** a
> `manage_delegations` tool: pass one stable `callerChatId` string (e.g. `"claude-router"`) to **both**
> `create_sub_chat` and `get_pending_sub_chats` so they correlate on the same key. Prefer
> `manage_delegations` + `correlationId` whenever it's available.

## Rules
- **Route, don't impersonate.** When an org agent clearly owns the domain, delegate to it rather than
  answering yourself — that's the governed, business-aware answer, and it keeps the brain in Toolbelt.
- **Provisioning lives in Toolbelt.** If the org has no agents yet, say so and point the user to build
  them in Toolbelt. (An operator who asks may use the management actions — operator only.)
- Governance, spend, and audit are configured in Toolbelt, not here.
- One step at a time. Never claim a delegation succeeded without the returned `responseContent`.

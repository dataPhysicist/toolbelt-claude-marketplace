---
description: Connect this Claude to your Toolbelt org and use its agents. Use when the user says "set up Toolbelt", "connect Toolbelt", "what Toolbelt agents do I have", "ask my <X> agent", or makes a request one of their org's Toolbelt agents should handle.
---

# Toolbelt — Connect & Use Your Org's Agents

This plugin connects Claude to a governed **Toolbelt** org and routes work to the org's **agents**
(assistants). Each agent runs in Toolbelt with its own memory, tools, and guardrails. Claude is the
front door; the agents are the brains. You do not build or provision here — that happens in Toolbelt.
You connect, see your agents, and delegate.

## On first use — connect & show the roster
1. Make sure the Toolbelt connector is authorized. If no Toolbelt tools are present, tell the user to
   finish authorizing the Toolbelt connector, then stop.
2. Call `list_assistants` to get the org's agents — **always fetch live; never assume a cached list.**
3. Show a short roster: each agent's name + one line on what it's for (from its description). Tell the
   user they can just ask, and you'll route to the right agent.

## To handle a request — route & delegate
1. Pick the best-fit agent from the live roster. If it's ambiguous, ask one short question or offer the
   top two choices.
2. Delegate with `create_sub_chat`: `targetAssistantId` + the task as `content`. Only set
   `provider`/`model` if you have a reason; otherwise let the agent use its own.
3. Wait with `sleep` (timeoutSeconds 30-60, `wakeOnAnyComplete: true`). When `wokeReason` is
   `sub_chat_complete`, the answer is in `subChats[].lastMessage` — present it as that agent's response.
4. If `sleep` times out, call `get_pending_sub_chats` to re-check, then `sleep` once more. If result
   retrieval reports no chat context, tell the user the task was dispatched and you'll fetch the result
   shortly — never fabricate an answer.
5. Attribute the work to the agent ("Your Pipeline agent says…") so the user learns the team.

## Rules
- **Route, don't impersonate.** When an org agent clearly owns the domain, delegate to it rather than
  answering yourself — that's the governed, business-aware answer, and it keeps the brain in Toolbelt.
- **Provisioning lives in Toolbelt.** If the org has no agents yet, say so and point the user to build
  them in Toolbelt. (For an operator who asks, you may use the management actions — operator only.)
- Governance, spend, and audit are configured in Toolbelt, not here.
- One step at a time. Never claim a delegation succeeded without the returned `lastMessage`.

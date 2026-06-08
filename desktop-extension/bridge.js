#!/usr/bin/env node
/**
 * Toolbelt bridge — a thin local MCP server (stdio) that proxies to the remote
 * Toolbelt MCP endpoint (streamable HTTP) and augments it with client-independent
 * behavior the extension carries on its own:
 *
 *   1. Tool-description REWRITE on passthrough — fixes the misleading
 *      `manage_delegations` guidance so the model retrieves results with
 *      wait/status by correlationId (not sleep/get_pending_sub_chats, which fail
 *      for an external client). Works on every client; needs no user action.
 *   2. A bundled `toolbelt` PROMPT carrying the full router instructions — one
 *      action (>>toolbelt) instead of pasting a skill file into a Project.
 *   3. Server `instructions` (best-effort) — honored by clients that inject them
 *      (Claude Code, VS Code, …); Claude Desktop ignores it, hence #1 and #2.
 *
 * Auth: API key is sent as `Authorization: Bearer` (never in the URL).
 * Zero Toolbelt server changes — the remote endpoint is consumed as-is.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const log = (...a) => process.stderr.write(`[toolbelt-bridge] ${a.join(" ")}\n`);

const MCP_URL = process.env.TOOLBELT_MCP_URL;
const API_KEY = process.env.TOOLBELT_API_KEY;
if (!MCP_URL || !API_KEY) {
  log("FATAL: TOOLBELT_MCP_URL and TOOLBELT_API_KEY must both be set.");
  process.exit(1);
}

// Router guidance — used for BOTH the bundled prompt and server `instructions`.
const ROUTER_INSTRUCTIONS = readFileSync(join(HERE, "router-instructions.md"), "utf8");

// --- (1) Tool-description rewrites applied on passthrough ---------------------
const TOOL_OVERRIDES = {
  manage_delegations:
    'Delegate a task to another assistant and get its answer back. ' +
    'EXTERNAL-CLIENT CONTRACT: create with action:"create" (pass provider+model to route to the ' +
    'optimal model) and capture the returned correlationId; then retrieve the answer with ' +
    'action:"wait" (blocks) or action:"status" (poll), keyed by that correlationId. ' +
    'Do NOT use "sleep" or "get_pending_sub_chats" — they need a Toolbelt chat session this connection ' +
    'does not have and fail with "No chat context". The answer is the returned responseContent.',
};
const rewriteTool = (tool) =>
  TOOL_OVERRIDES[tool.name] ? { ...tool, description: TOOL_OVERRIDES[tool.name] } : tool;

// Tools that lure the router off-path. The router only needs to read rules,
// list assistants, and delegate — these are org build-time concerns done in
// Toolbelt, not prerequisites for delegating. Hidden from the model's surface.
const HIDDEN_TOOLS = new Set([
  "manage_assistant_connections", // request/approve persistent connections — NOT needed to delegate
  "manage_workflows", // multi-assistant workflow authoring — not a routing action
]);

// --- (2) Bundled prompt ------------------------------------------------------
const ROUTER_PROMPT = {
  name: "toolbelt",
  description:
    "Load the Toolbelt router instructions: connect, load org model rules, pick the optimal model, " +
    "delegate by correlationId, report honestly, and stay pause-aware.",
};

// --- upstream (remote Toolbelt MCP), connected lazily on first use -----------
const upstream = new Client({ name: "toolbelt-bridge", version: "0.7.0" }, { capabilities: {} });
let connected = false;
let connecting = null;
function ensureUpstream() {
  if (connected) return Promise.resolve();
  if (!connecting) {
    connecting = (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
      });
      await upstream.connect(transport);
      connected = true;
      log("connected to upstream Toolbelt MCP");
    })().catch((e) => {
      connecting = null; // allow a later retry
      throw new Error(`Toolbelt upstream not reachable: ${e.message}`);
    });
  }
  return connecting;
}

// --- downstream (stdio server exposed to Claude) -----------------------------
const server = new Server(
  { name: "toolbelt", version: "0.7.0" },
  { capabilities: { tools: {}, prompts: {} }, instructions: ROUTER_INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  await ensureUpstream();
  const { tools = [] } = await upstream.listTools();
  return { tools: tools.filter((t) => !HIDDEN_TOOLS.has(t.name)).map(rewriteTool) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  await ensureUpstream();
  return upstream.callTool({
    name: req.params.name,
    arguments: req.params.arguments ?? {},
  });
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  let upstreamPrompts = [];
  try {
    await ensureUpstream();
    upstreamPrompts = (await upstream.listPrompts()).prompts ?? [];
  } catch {
    /* upstream may not advertise prompts; our bundled one still shows */
  }
  return { prompts: [ROUTER_PROMPT, ...upstreamPrompts] };
});

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name === ROUTER_PROMPT.name) {
    return {
      description: ROUTER_PROMPT.description,
      messages: [{ role: "user", content: { type: "text", text: ROUTER_INSTRUCTIONS } }],
    };
  }
  await ensureUpstream();
  return upstream.getPrompt({ name: req.params.name, arguments: req.params.arguments ?? {} });
});

await server.connect(new StdioServerTransport());
log("toolbelt bridge ready on stdio");

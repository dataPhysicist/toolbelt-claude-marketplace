#!/usr/bin/env node
/**
 * Toolbelt bridge — a thin local MCP server (stdio) that proxies to the remote
 * Toolbelt MCP endpoint (streamable HTTP) and augments it so the extension carries
 * the router behavior itself. Zero Toolbelt server changes.
 *
 *  • Per-agent tools: each org assistant is surfaced as its own `ask_<name>` tool,
 *    so users can toggle individual agents on/off in the client. Each tool runs the
 *    delegate→wait round-trip internally and returns the agent's answer directly.
 *  • Curated surface: only a few core Toolbelt tools pass through; everything else
 *    is hidden so the model can't wander.
 *  • Tool-description rewrites, a bundled `toolbelt` prompt, and server `instructions`.
 *
 * Auth: API key is sent as `Authorization: Bearer` (never in the URL).
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

// Optional org label (set at install). Ignore an empty or unsubstituted value.
let ORG_NAME = (process.env.TOOLBELT_ORG_NAME || "").trim();
if (!ORG_NAME || ORG_NAME.includes("${")) ORG_NAME = "";
const ORG_HEADER = ORG_NAME
  ? `> This connection is the **${ORG_NAME}** Toolbelt org. Refer to it by that name ` +
    `(e.g. "your ${ORG_NAME} agents") in greetings and attributions.\n\n`
  : "";
const ROUTER_INSTRUCTIONS = ORG_HEADER + readFileSync(join(HERE, "router-instructions.md"), "utf8");

const ROUTER_PROMPT = {
  name: "toolbelt",
  description:
    "Load the Toolbelt router instructions: connect, load org model rules, pick the optimal model, " +
    "delegate via the per-agent tools, report honestly, and stay pause-aware.",
};

// Core Toolbelt tools the router keeps (everything else is hidden). Each org
// assistant is ALSO surfaced as its own `ask_<name>` tool (buildAgentTools).
const CORE_TOOLS = new Set([
  "read_storage_file", // load the org's ModelAutoPilot.md rules
  "toolbelt", // dispatcher — list_organizations (org name), list_assistants
  "toolbelt_help", // discover toolbelt action names/params
  "manage_delegations", // status-check a long-running ask_<agent> task by correlationId
]);
const AGENT_PREFIX = "ask_";
const WAIT_ITERS = 2; // internal wait windows per agent call
const WAIT_SECS = 45; // seconds per window (kept modest for client tool-call timeouts)

const TOOL_OVERRIDES = {
  manage_delegations:
    "Check a long-running delegation by correlationId. PREFER the per-agent `ask_<name>` tools to " +
    'delegate — they run the task on the right agent and respect the user\'s per-agent toggles. Use this ' +
    'only to check status (action:"status"/"wait" with a correlationId an ask_ tool reported). Never use ' +
    '"sleep"/"get_pending_sub_chats" (no chat context for an external client).',
};
const rewriteTool = (t) => (TOOL_OVERRIDES[t.name] ? { ...t, description: TOOL_OVERRIDES[t.name] } : t);

// --- helpers ---
function extractData(res) {
  if (res && res.structuredContent && typeof res.structuredContent === "object") return res.structuredContent;
  const text = res?.content?.find?.((c) => c.type === "text")?.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return { _raw: text };
    }
  }
  return {};
}
function slugify(s) {
  return (
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "agent"
  );
}

// --- upstream (remote Toolbelt MCP), connected lazily ---
const upstream = new Client({ name: "toolbelt-bridge", version: "0.9.0" }, { capabilities: {} });
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
      connecting = null;
      throw new Error(`Toolbelt upstream not reachable: ${e.message}`);
    });
  }
  return connecting;
}

// --- per-agent tools generated from the org roster ---
let agentIndex = new Map(); // toolName -> { id, name }
async function buildAgentTools() {
  const res = await upstream.callTool({ name: "toolbelt", arguments: { action: "list_assistants" } });
  const assistants = extractData(res).assistants;
  if (!Array.isArray(assistants)) throw new Error("roster not parseable");
  const tools = [];
  const index = new Map();
  const used = new Set();
  for (const a of assistants) {
    if (!a || !a.id) continue;
    let name = `${AGENT_PREFIX}${slugify(a.name)}`;
    while (used.has(name)) name = `${name}_${String(a.id).slice(0, 6)}`;
    used.add(name);
    index.set(name, { id: a.id, name: a.name || name });
    const meta = a.provider && a.model ? ` Default model: ${a.provider}/${a.model}.` : "";
    tools.push({
      name,
      description:
        `Ask the "${a.name}" agent to do a task and get its answer.` +
        `${a.description ? " " + a.description : ""}${meta} ` +
        "Runs in Toolbelt with its own memory, tools, and guardrails.",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string", description: "What you want this agent to do." },
          model: {
            type: "string",
            description:
              "Optional model override per Model Auto-Pilot (e.g. gemini-3.5-flash). Omit to use the agent's default.",
          },
        },
        required: ["task"],
      },
    });
  }
  agentIndex = index;
  return tools;
}

async function delegateToAgent(id, label, { task, model } = {}) {
  if (!task) return { isError: true, content: [{ type: "text", text: "Provide a 'task' for the agent." }] };
  const createArgs = { action: "create", targetAssistantId: id, content: task };
  if (model) createArgs.model = model;
  const createRes = await upstream.callTool({ name: "manage_delegations", arguments: createArgs });
  const correlationId = extractData(createRes).correlationId;
  if (!correlationId) return createRes; // surface whatever the create returned
  for (let i = 0; i < WAIT_ITERS; i++) {
    const res = await upstream.callTool({
      name: "manage_delegations",
      arguments: { action: "wait", correlationId, timeoutSeconds: WAIT_SECS },
    });
    const d = extractData(res);
    if (d.responseContent) return { content: [{ type: "text", text: String(d.responseContent) }] };
    if (d.status && /fail|error|cancel/i.test(String(d.status)))
      return { isError: true, content: [{ type: "text", text: `Delegation to ${label} ${d.status}.` }] };
  }
  return {
    content: [
      {
        type: "text",
        text: `The "${label}" agent is still working (correlationId ${correlationId}). Check later with manage_delegations action:"status".`,
      },
    ],
  };
}

// --- downstream (stdio server exposed to Claude) ---
const server = new Server(
  { name: "toolbelt", version: "0.9.0" },
  { capabilities: { tools: {}, prompts: {} }, instructions: ROUTER_INSTRUCTIONS },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  await ensureUpstream();
  const { tools = [] } = await upstream.listTools();
  const core = tools.filter((t) => CORE_TOOLS.has(t.name)).map(rewriteTool);
  let agents = [];
  try {
    agents = await buildAgentTools();
  } catch (e) {
    log(`agent-tool generation failed: ${e.message} (falling back to core tools only)`);
  }
  return { tools: [...agents, ...core] };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  await ensureUpstream();
  if (name.startsWith(AGENT_PREFIX)) {
    if (!agentIndex.has(name)) {
      try {
        await buildAgentTools();
      } catch {
        /* fall through */
      }
    }
    const agent = agentIndex.get(name);
    if (agent) return delegateToAgent(agent.id, agent.name, args);
  }
  return upstream.callTool({ name, arguments: args });
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  let up = [];
  try {
    await ensureUpstream();
    up = (await upstream.listPrompts()).prompts ?? [];
  } catch {
    /* upstream may not advertise prompts */
  }
  return { prompts: [ROUTER_PROMPT, ...up] };
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

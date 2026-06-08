#!/usr/bin/env node
/**
 * Toolbelt bridge — a thin local MCP server (stdio) that proxies to the remote
 * Toolbelt MCP endpoint (streamable HTTP) and augments it so the extension carries
 * the router behavior itself. Zero Toolbelt server changes.
 *
 *  • Per-agent tools: each org assistant is surfaced as its own `ask_<name>` tool
 *    (recent-first), so users can toggle individual agents on/off. Each tool runs
 *    the delegate→wait round-trip internally and returns the agent's answer, sending
 *    MCP progress notifications while it waits. Long jobs → `check_agent_result`.
 *  • Curated surface: `ask_<agent>` + `check_agent_result` + `read_storage_file`
 *    (Model Auto-Pilot rules) + `toolbelt`/`toolbelt_help` (ad-hoc org management).
 *    `manage_delegations` and everything else is hidden.
 *  • Resilient: reconnects automatically if the upstream session drops; refreshes the
 *    roster and emits tools/list_changed when agents are added/removed.
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
const VERSION = "0.10.1";
const log = (...a) => process.stderr.write(`[toolbelt-bridge] ${a.join(" ")}\n`);

const MCP_URL = process.env.TOOLBELT_MCP_URL;
const API_KEY = process.env.TOOLBELT_API_KEY;
if (!MCP_URL || !API_KEY) {
  log("FATAL: TOOLBELT_MCP_URL and TOOLBELT_API_KEY must both be set.");
  process.exit(1);
}

// Optional org label set at install (an override). Empty/unsubstituted → resolved
// at runtime from the org itself (see resolveOrgName).
let ORG_OVERRIDE = (process.env.TOOLBELT_ORG_NAME || "").trim();
if (!ORG_OVERRIDE || ORG_OVERRIDE.includes("${")) ORG_OVERRIDE = "";

const ROUTER_BODY = readFileSync(join(HERE, "router-instructions.md"), "utf8");
const orgHeader = (name) =>
  name
    ? `> This connection is the **${name}** Toolbelt org. Refer to it by that name ` +
      `(e.g. "your ${name} agents") in greetings and attributions.\n\n`
    : "";
// Static instructions for the initialize response (clients that honor it). The org
// name here is the install-time override only; the prompt resolves it dynamically.
const ROUTER_INSTRUCTIONS = orgHeader(ORG_OVERRIDE) + ROUTER_BODY;

const ROUTER_PROMPT = {
  name: "toolbelt",
  description:
    "Load the Toolbelt router instructions: delegate via the per-agent tools, pick the optimal model, " +
    "report honestly, and stay pause-aware.",
};

// Tools that pass through to Claude (everything else is hidden). Each org assistant
// is ALSO surfaced as an `ask_<name>` tool, plus the bridge-native check_agent_result.
const CORE_TOOLS = new Set([
  "read_storage_file", // load the org's ModelAutoPilot.md rules
  "toolbelt", // ad-hoc org management (create assistants, enable services, …)
  "toolbelt_help", // discover toolbelt action names/params
]);
const AGENT_PREFIX = "ask_";
const WAIT_ITERS = 6; // wait windows per agent call
const WAIT_SECS = 30; // seconds per window — progress pings keep the client alive

const CHECK_TOOL = {
  name: "check_agent_result",
  description:
    "Check the status or final answer of a long-running agent task, using the correlationId an " +
    "`ask_<agent>` tool reported when it was still working. Returns the answer once complete.",
  inputSchema: {
    type: "object",
    properties: {
      correlationId: { type: "string", description: "The correlationId from the ask_<agent> tool." },
    },
    required: ["correlationId"],
  },
};

const TOOL_OVERRIDES = {
  toolbelt:
    "Ad-hoc Toolbelt org management — create/configure assistants, enable services, tasks, dashboards, " +
    "etc. To DELEGATE a task to an agent, use the per-agent `ask_<name>` tools instead (they respect the " +
    "user's toggles and handle the round-trip). Do NOT use create_sub_chat / sleep / get_pending_sub_chats " +
    "for delegation — they need a chat context this external client lacks.",
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
function isSessionError(e) {
  if (e?.code === -32000 || e?.code === -32001) return true; // ConnectionClosed / RequestTimeout
  if ((e?.constructor?.name || "") === "StreamableHTTPError") return true;
  return /fetch failed|terminated|ECONNRESET|socket hang up|session|closed|network|aborted|not found/i.test(
    e?.message || "",
  );
}
function isAuthError(e) {
  if ((e?.constructor?.name || "") === "UnauthorizedError") return true;
  if (e?.code === 401 || e?.code === 403) return true;
  return /\b401\b|\b403\b|unauthor|forbidden|invalid.*(key|token|credential)/i.test(e?.message || "");
}

// --- upstream (remote Toolbelt MCP) with reconnect ---
let upstream = null;
let connected = false;
let connecting = null;

async function connectUpstream() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  transport.onclose = () => {
    connected = false;
  };
  const client = new Client({ name: "toolbelt-bridge", version: VERSION }, { capabilities: {} });
  try {
    await client.connect(transport);
  } catch (e) {
    if (isAuthError(e)) {
      throw new Error(
        "Toolbelt rejected the credentials (401/403). Check your API key and hub workspace ID in the extension settings.",
      );
    }
    throw new Error(`Toolbelt upstream not reachable: ${e.message}`);
  }
  upstream = client;
  connected = true;
  log("connected to upstream Toolbelt MCP");
}

function ensureUpstream() {
  if (connected) return Promise.resolve();
  if (!connecting) {
    connecting = connectUpstream().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

// Run an upstream operation; on a dropped/expired session, reconnect once and retry.
async function withUpstream(fn) {
  await ensureUpstream();
  try {
    return await fn(upstream);
  } catch (e) {
    if (isSessionError(e)) {
      log(`upstream session error (${e.message}); reconnecting…`);
      connected = false;
      try {
        await upstream?.close?.();
      } catch {
        /* ignore */
      }
      await ensureUpstream();
      return fn(upstream);
    }
    throw e;
  }
}

// --- org name (override, else resolved from the org once) ---
let orgName = ORG_OVERRIDE;
let orgNameTried = false;
async function resolveOrgName() {
  if (orgName) return orgName;
  if (orgNameTried) return "";
  orgNameTried = true;
  try {
    const res = await withUpstream((c) => c.callTool({ name: "toolbelt", arguments: { action: "list_organizations" } }));
    const orgs = extractData(res).organizations;
    if (Array.isArray(orgs) && orgs[0]?.name) orgName = orgs[0].name;
  } catch {
    /* leave unresolved */
  }
  return orgName || "";
}

// --- per-agent tools generated from the org roster (recent-first) ---
let agentIndex = new Map(); // toolName -> { id, name }
async function buildAgentTools() {
  const res = await withUpstream((c) => c.callTool({ name: "toolbelt", arguments: { action: "list_assistants" } }));
  const assistants = extractData(res).assistants;
  if (!Array.isArray(assistants)) throw new Error("roster not parseable");
  const sorted = [...assistants].sort(
    (a, b) => new Date(b.lastUpdated || 0).getTime() - new Date(a.lastUpdated || 0).getTime(),
  );
  const tools = [];
  const index = new Map();
  const used = new Set();
  for (const a of sorted) {
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

async function delegateToAgent(id, label, { task, model } = {}, req, extra) {
  if (!task) return { isError: true, content: [{ type: "text", text: "Provide a 'task' for the agent." }] };
  const createArgs = { action: "create", targetAssistantId: id, content: task };
  if (model) createArgs.model = model;
  const createRes = await withUpstream((c) => c.callTool({ name: "manage_delegations", arguments: createArgs }));
  const correlationId = extractData(createRes).correlationId;
  if (!correlationId) return createRes; // surface whatever the create returned
  const progressToken = req?.params?._meta?.progressToken;
  for (let i = 0; i < WAIT_ITERS; i++) {
    if (progressToken && extra?.sendNotification) {
      await extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken, progress: i, total: WAIT_ITERS, message: `${label} working…` },
        })
        .catch(() => {});
    }
    const res = await withUpstream((c) =>
      c.callTool({ name: "manage_delegations", arguments: { action: "wait", correlationId, timeoutSeconds: WAIT_SECS } }),
    );
    const d = extractData(res);
    if (d.responseContent) return { content: [{ type: "text", text: String(d.responseContent) }] };
    if (d.status && /fail|error|cancel/i.test(String(d.status)))
      return { isError: true, content: [{ type: "text", text: `Delegation to ${label} ${d.status}.` }] };
  }
  return {
    content: [
      {
        type: "text",
        text: `The "${label}" agent is still working (correlationId ${correlationId}). Use check_agent_result with that correlationId to get the answer.`,
      },
    ],
  };
}

async function checkResult(correlationId) {
  if (!correlationId) return { isError: true, content: [{ type: "text", text: "Provide a correlationId." }] };
  const res = await withUpstream((c) =>
    c.callTool({ name: "manage_delegations", arguments: { action: "status", correlationId } }),
  );
  const d = extractData(res);
  if (d.responseContent) return { content: [{ type: "text", text: String(d.responseContent) }] };
  return { content: [{ type: "text", text: `Status: ${d.status || "pending"} (correlationId ${correlationId}).` }] };
}

// --- downstream (stdio server exposed to Claude) ---
const server = new Server(
  { name: "toolbelt", version: VERSION },
  { capabilities: { tools: {}, prompts: {} }, instructions: ROUTER_INSTRUCTIONS },
);

let lastRosterSig = "";

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const upstreamTools = (await withUpstream((c) => c.listTools())).tools ?? [];
  const core = upstreamTools.filter((t) => CORE_TOOLS.has(t.name)).map(rewriteTool);
  let agents = [];
  try {
    agents = await buildAgentTools();
    lastRosterSig = [...agentIndex.keys()].sort().join(",");
  } catch (e) {
    log(`agent-tool generation failed: ${e.message} (exposing core tools only)`);
  }
  return { tools: [...agents, CHECK_TOOL, ...core] };
});

server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  if (name === CHECK_TOOL.name) return checkResult(args.correlationId);
  if (name.startsWith(AGENT_PREFIX)) {
    if (!agentIndex.has(name)) {
      try {
        await buildAgentTools();
      } catch {
        /* fall through to passthrough */
      }
    }
    const agent = agentIndex.get(name);
    if (agent) return delegateToAgent(agent.id, agent.name, args, req, extra);
  }
  return withUpstream((c) => c.callTool({ name, arguments: args }));
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  let up = [];
  try {
    up = (await withUpstream((c) => c.listPrompts())).prompts ?? [];
  } catch {
    /* upstream may not advertise prompts */
  }
  return { prompts: [ROUTER_PROMPT, ...up] };
});

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name === ROUTER_PROMPT.name) {
    const header = orgHeader(await resolveOrgName());
    return {
      description: ROUTER_PROMPT.description,
      messages: [{ role: "user", content: { type: "text", text: header + ROUTER_BODY } }],
    };
  }
  return withUpstream((c) => c.getPrompt({ name: req.params.name, arguments: req.params.arguments ?? {} }));
});

// Periodically refresh the roster; if the set of agents changed, tell the client.
async function refreshRoster() {
  if (!connected) return;
  try {
    await buildAgentTools();
    const sig = [...agentIndex.keys()].sort().join(",");
    if (lastRosterSig && sig !== lastRosterSig) {
      lastRosterSig = sig;
      server.sendToolListChanged?.();
      log("roster changed; notified client (tools/list_changed)");
    } else {
      lastRosterSig = sig;
    }
  } catch {
    /* ignore transient refresh errors */
  }
}
const rosterTimer = setInterval(refreshRoster, 5 * 60 * 1000);
rosterTimer.unref?.();

await server.connect(new StdioServerTransport());
log(`toolbelt bridge ${VERSION} ready on stdio`);

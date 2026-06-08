#!/usr/bin/env node
/**
 * Toolbelt single-agent bridge — a thin local MCP server (stdio) that connects to ONE
 * Toolbelt assistant's per-workspace endpoint and brings THAT agent into Claude:
 *
 *   • Tools = faithful passthrough of the agent's own governed tool surface (its connected
 *     services, wrenches/playbooks, storage, etc.) — exactly what Toolbelt serves for this
 *     workspace, with permissions/audit/spend enforced server-side. No client filtering.
 *   • Persona = the agent's `systemPrompt` (fetched via get_assistant), served as the server
 *     `instructions` and as an `act_as_<agent>` prompt so Claude works *as* the agent.
 *
 * One extension = one agent. Resilient (reconnect on dropped session). Auth: API key sent
 * as Authorization: Bearer (never in the URL). Zero Toolbelt server changes.
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
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = "0.13.1";
const log = (...a) => process.stderr.write(`[toolbelt-agent] ${a.join(" ")}\n`);

const MCP_URL = process.env.TOOLBELT_MCP_URL;
const API_KEY = process.env.TOOLBELT_API_KEY;
if (!MCP_URL || !API_KEY) {
  log("FATAL: TOOLBELT_MCP_URL and TOOLBELT_API_KEY must both be set.");
  process.exit(1);
}
const AGENT_WS_ID = (MCP_URL.match(/workspaces\/([^/]+)/) || [, ""])[1];
let AGENT_NAME = (process.env.TOOLBELT_AGENT_NAME || "").trim();
if (!AGENT_NAME || AGENT_NAME.includes("${")) AGENT_NAME = "";

// Optional: hide platform org-management tools (not "this agent"). Default OFF (full passthrough)
// because an agent's persona may itself use them (e.g. create_sub_chat via the toolbelt tool).
const HIDE_META = /^(1|true|yes)$/i.test(process.env.TOOLBELT_HIDE_MANAGEMENT || "");
const META_TOOLS = new Set(["manage_delegations", "manage_workflows", "manage_assistant_connections"]);

const WRAPPER = readFileSync(join(HERE, "router-instructions.md"), "utf8");

// (B) Auto-load the agent's memory/config into context at connect. Explicit list via
// env, else default to files under Memory/ and Config/. Capped to keep instructions sane.
const CONTEXT_FILES = (process.env.TOOLBELT_CONTEXT_FILES || "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s && !s.includes("${"));
const CONTEXT_PREFIXES = ["Memory/", "Config/"];
const MAX_CONTEXT_BYTES = 24000;
const RES_PREFIX = "toolbelt:///"; // (A) MCP resource URI scheme for the agent's storage files

// --- helpers ---
function extractData(res) {
  if (res && res.structuredContent && typeof res.structuredContent === "object") return res.structuredContent;
  const t = res?.content?.find?.((c) => c.type === "text")?.text;
  if (typeof t === "string") {
    try {
      return JSON.parse(t);
    } catch {
      return { _raw: t };
    }
  }
  if (res && typeof res === "object" && (res.systemPrompt !== undefined || res.name !== undefined || res.id !== undefined))
    return res;
  return {};
}
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "agent";
}
function isSessionError(e) {
  if (e?.code === -32000 || e?.code === -32001) return true;
  if ((e?.constructor?.name || "") === "StreamableHTTPError") return true;
  return /fetch failed|terminated|ECONNRESET|socket hang up|session|closed|network|aborted|not found/i.test(e?.message || "");
}
function isAuthError(e) {
  if ((e?.constructor?.name || "") === "UnauthorizedError") return true;
  if (e?.code === 401 || e?.code === 403) return true;
  return /\b401\b|\b403\b|unauthor|forbidden|invalid.*(key|token|credential)/i.test(e?.message || "");
}

// list_storage_files returns text: "Found N files…\n- <name> (<size> bytes, <type>)".
function parseFileList(res) {
  const t = res?.content?.find?.((c) => c.type === "text")?.text || "";
  const out = [];
  for (const m of t.matchAll(/^- (.+?) \(\d+ bytes,/gm)) out.push(m[1]);
  return out;
}
function fileText(res) {
  return res?.content?.find?.((c) => c.type === "text")?.text ?? "";
}
function mimeFor(name) {
  if (/\.md$/i.test(name)) return "text/markdown";
  if (/\.json$/i.test(name)) return "application/json";
  if (/\.html?$/i.test(name)) return "text/html";
  return "text/plain";
}

// --- upstream (the agent's workspace endpoint) with reconnect ---
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
  const client = new Client({ name: "toolbelt-agent-bridge", version: VERSION }, { capabilities: {} });
  try {
    await client.connect(transport);
  } catch (e) {
    if (isAuthError(e))
      throw new Error("Toolbelt rejected the credentials (401/403). Check your API key and agent workspace ID.");
    throw new Error(`Toolbelt upstream not reachable: ${e.message}`);
  }
  upstream = client;
  connected = true;
  log("connected to agent workspace MCP");
}
function ensureUpstream() {
  if (connected) return Promise.resolve();
  if (!connecting) connecting = connectUpstream().finally(() => (connecting = null));
  return connecting;
}
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

// --- (B) load the agent's memory/config files into a context block ---
async function loadContextBlock() {
  try {
    let names = CONTEXT_FILES;
    if (!names.length) {
      const got = new Set();
      for (const pfx of CONTEXT_PREFIXES) {
        try {
          const r = await withUpstream((c) => c.callTool({ name: "list_storage_files", arguments: { prefix: pfx, maxResults: 50 } }));
          parseFileList(r).forEach((f) => got.add(f));
        } catch {
          /* prefix may not exist */
        }
      }
      names = [...got];
    }
    if (!names.length) return "";
    const parts = [];
    let budget = MAX_CONTEXT_BYTES;
    for (const f of names) {
      if (budget <= 0) break;
      try {
        const r = await withUpstream((c) => c.callTool({ name: "read_storage_file", arguments: { fileName: f, raw: true } }));
        let txt = fileText(r);
        if (txt.length > budget) txt = txt.slice(0, budget) + "\n…(truncated)";
        budget -= txt.length;
        parts.push(`## ${f}\n\n${txt}`);
      } catch {
        /* skip unreadable */
      }
    }
    if (!parts.length) return "";
    return (
      `# ${AGENT_NAME || "Agent"} — loaded memory & config (snapshot at connect)\n\n` +
      `Treat these as your current working state. Re-read via the storage tools or the attached resources ` +
      `for the latest.\n\n${parts.join("\n\n")}`
    );
  } catch {
    return "";
  }
}

// --- persona (the agent's systemPrompt), fetched once ---
let persona = null; // null = not yet fetched; "" = none/failed
async function getPersona() {
  if (persona !== null) return persona;
  try {
    const res = await withUpstream((c) =>
      c.callTool({ name: "toolbelt", arguments: { action: "get_assistant", params: JSON.stringify({ assistantId: AGENT_WS_ID }) } }),
    );
    const a = extractData(res);
    persona = typeof a.systemPrompt === "string" ? a.systemPrompt : "";
    if (!AGENT_NAME && a.name) AGENT_NAME = a.name;
  } catch (e) {
    log(`persona fetch failed: ${e.message}`);
    persona = "";
  }
  return persona;
}
function buildInstructions(p, ctx) {
  const name = AGENT_NAME || "this agent";
  const head = WRAPPER.replace(/\{\{AGENT\}\}/g, name);
  let out = p ? `${head}\n\n---\n\n# ${name} — operating instructions\n\n${p}` : head;
  if (ctx) out += `\n\n---\n\n${ctx}`;
  return out;
}

// Best-effort persona fetch at startup so it can ride in the initialize `instructions`
// (clients that honor it). Never fatal; it also loads lazily via the prompt.
// Connect the server IMMEDIATELY — never block startup on upstream calls (that can
// exceed the client's init timeout → "no tools"). Persona + memory load lazily via the
// act_as_<agent> prompt (and via resources / storage tools). AGENT_NAME comes from the
// baked env (pack-agent) or defaults; no fetch needed to start.
if (!AGENT_NAME) AGENT_NAME = "Agent";
const PROMPT_NAME = `act_as_${slugify(AGENT_NAME)}`;

// --- downstream server ---
const server = new Server(
  { name: "toolbelt-agent", version: VERSION },
  { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: buildInstructions("", "") },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  let tools = [];
  try {
    ({ tools = [] } = await withUpstream((c) => c.listTools()));
  } catch (e) {
    log(`upstream listTools failed: ${e.message}`);
  }
  if (HIDE_META) tools = tools.filter((t) => !META_TOOLS.has(t.name));
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await withUpstream((c) => c.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} }));
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Toolbelt error: ${e.message}` }] };
  }
});

// (A) Expose the agent's storage files as MCP resources (memory/config/skills, etc.).
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  let files = [];
  try {
    const r = await withUpstream((c) => c.callTool({ name: "list_storage_files", arguments: { maxResults: 200 } }));
    files = parseFileList(r);
  } catch (e) {
    log(`listResources failed: ${e.message}`);
  }
  return {
    resources: files.map((f) => ({ uri: RES_PREFIX + encodeURI(f), name: f, mimeType: mimeFor(f) })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  const fileName = decodeURI(uri.startsWith(RES_PREFIX) ? uri.slice(RES_PREFIX.length) : uri);
  const r = await withUpstream((c) => c.callTool({ name: "read_storage_file", arguments: { fileName, raw: true } }));
  return { contents: [{ uri, mimeType: mimeFor(fileName), text: fileText(r) }] };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const mine = {
    name: PROMPT_NAME,
    description: `Act as the "${AGENT_NAME}" agent — load its operating instructions and use its connected tools, wrenches, and storage as your own.`,
  };
  let up = [];
  try {
    up = (await withUpstream((c) => c.listPrompts())).prompts ?? [];
  } catch {
    /* upstream may not advertise prompts */
  }
  return { prompts: [mine, ...up] };
});

server.setRequestHandler(GetPromptRequestSchema, async (req) => {
  if (req.params.name === PROMPT_NAME) {
    const p = await getPersona();
    return {
      description: `Operating instructions for ${AGENT_NAME}`,
      messages: [{ role: "user", content: { type: "text", text: buildInstructions(p, await loadContextBlock()) } }],
    };
  }
  return withUpstream((c) => c.getPrompt({ name: req.params.name, arguments: req.params.arguments ?? {} }));
});

await server.connect(new StdioServerTransport());
log(`toolbelt single-agent bridge ${VERSION} (${AGENT_NAME}) ready on stdio`);

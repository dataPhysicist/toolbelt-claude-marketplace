#!/usr/bin/env node
/**
 * Toolbelt Assistant proxy — DEPENDENCY-FREE (Node builtins only).
 *
 * Marketplace plugin syncs strip node_modules, so this server must run with zero deps:
 * a raw newline-delimited JSON-RPC stdio server + a minimal MCP Streamable HTTP client.
 *
 * Features: live tool passthrough (tagged "[Agent]"), load_persona (live fetch),
 * static manifest-matching "persona" prompt, in-chat API-key setup (toolbelt_setup),
 * connection diagnostics, elicitation/sampling/ping bridging (Toolbelt's
 * "25 tool calls — continue?" gate), pre-persona context nudge, reconnect on drop.
 *
 * Hard rules: stdio answers initialize instantly (no network first); stdout is protocol
 * (logs -> stderr); crash-proof; instructions fetched live, never embedded.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const VERSION = "2.0.0";
const log = (...a) => process.stderr.write(`[toolbelt-assistant] ${a.join(" ")}\n`);
process.on("unhandledRejection", (e) => log(`unhandledRejection: ${e?.message || e}`));
process.on("uncaughtException", (e) => log(`uncaughtException: ${e?.message || e}`));

// ---------- config ----------
const clean = (v) => (v && !v.includes("${") ? v.trim() : "");
const KEY_FILE = join(process.env.TOOLBELT_KEY_FILE || join(homedir(), ".toolbelt"), "api_key");
const readKeyFile = () => { try { return readFileSync(KEY_FILE, "utf8").trim(); } catch { return ""; } };
let API_KEY = clean(process.env.TOOLBELT_API_KEY) || readKeyFile();
const WORKSPACE_ID = clean(process.env.TOOLBELT_WORKSPACE_ID);
const BASE_URL = (clean(process.env.TOOLBELT_BASE_URL) || "https://toolbelt.apexti.com").replace(/\/+$/, "");
let NAME = clean(process.env.TOOLBELT_ASSISTANT_NAME);
const MCP_URL = `${BASE_URL}/api/workspaces/${WORKSPACE_ID}/mcp`;
if (!WORKSPACE_ID) { log("FATAL: TOOLBELT_WORKSPACE_ID is required."); process.exit(1); }

const PROMPT_NAME = "persona";
// Must stay byte-identical to manifest.json -> prompts[0].text (Desktop validates exactly).
const PROMPT_TEXT =
  "Call the load_persona tool from this connector now, then fully adopt the operating instructions it returns for the rest of this conversation.";
const PERSONA_TOOL = "load_persona";
const SETUP_TOOL = "toolbelt_setup";
const STATUS_TOOL = "toolbelt_connection_status";
const CALL_TIMEOUT_MS = 10 * 60 * 1000;

// ---------- downstream stdio (newline-delimited JSON-RPC) ----------
let clientCaps = {};
let nextDownId = 1;
const downPending = new Map(); // id -> {resolve, reject}
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const sendResult = (id, result) => send({ jsonrpc: "2.0", id, result });
const sendError = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
function requestDownstream(method, params, timeoutMs = CALL_TIMEOUT_MS) {
  const id = `s${nextDownId++}`;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { downPending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
    downPending.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); } });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

// ---------- upstream: minimal MCP Streamable HTTP client ----------
let session = { id: null, initialized: false, initializing: null };
let nextUpId = 1;

function sseEvents(text) {
  // Parse a complete SSE body into data payloads.
  const out = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const datas = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    if (datas.length) out.push(datas.join("\n"));
  }
  return out;
}

async function postUpstream(message, { expectId = null, timeoutMs = CALL_TIMEOUT_MS } = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${API_KEY}`,
  };
  if (session.id) headers["mcp-session-id"] = session.id;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(message), signal: ctl.signal });
  } finally { /* timer cleared below */ }
  const sid = res.headers.get("mcp-session-id");
  if (sid) session.id = sid;
  if (res.status === 401 || res.status === 403) {
    clearTimeout(t);
    throw new Error("Toolbelt rejected the credentials (401/403). Check the API key and workspace ID.");
  }
  if (res.status === 404 && session.id) { clearTimeout(t); throw Object.assign(new Error("session expired"), { sessionExpired: true }); }
  if (res.status === 202 || expectId === null) { clearTimeout(t); res.body?.cancel?.().catch?.(() => {}); return null; }
  if (!res.ok) { clearTimeout(t); throw new Error(`Toolbelt HTTP ${res.status} at ${MCP_URL}`); }

  const ctype = (res.headers.get("content-type") || "").split(";")[0].trim();
  try {
    if (ctype === "application/json") {
      const obj = await res.json();
      for (const m of Array.isArray(obj) ? obj : [obj]) if (m.id === expectId) return m;
      throw new Error("response missing expected id");
    }
    // text/event-stream: read incrementally; handle server->client requests mid-stream.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === "\r" ? 4 : 2));
        const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
        if (!data) continue;
        let msg;
        try { msg = JSON.parse(data); } catch { continue; }
        if (msg.id !== undefined && msg.method) { handleUpstreamRequest(msg); continue; } // server request
        if (msg.method) continue; // notification
        if (msg.id === expectId) { ctl.abort(); return msg; } // our response
      }
    }
    throw new Error("stream ended without response");
  } finally {
    clearTimeout(t);
  }
}

async function handleUpstreamRequest(msg) {
  // Bridge upstream server->client requests (elicitation, sampling, ping) to Claude.
  try {
    let result;
    if (msg.method === "ping") result = {};
    else if (msg.method === "elicitation/create" && clientCaps.elicitation) {
      log("forwarding upstream elicitation to Claude");
      result = await requestDownstream("elicitation/create", msg.params);
    } else if (msg.method === "sampling/createMessage" && clientCaps.sampling) {
      result = await requestDownstream("sampling/createMessage", msg.params);
    } else {
      await postUpstream({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `${msg.method} not supported by client` } });
      return;
    }
    await postUpstream({ jsonrpc: "2.0", id: msg.id, result });
  } catch (e) {
    log(`bridging ${msg.method} failed: ${e.message}`);
    try { await postUpstream({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: e.message } }); } catch { /* ignore */ }
  }
}

async function initUpstream() {
  if (session.initialized) return;
  if (session.initializing) return session.initializing;
  session.initializing = (async () => {
    session.id = null;
    const id = `u${nextUpId++}`;
    const caps = {};
    if (clientCaps.elicitation) caps.elicitation = {};
    if (clientCaps.sampling) caps.sampling = {};
    const resp = await postUpstream(
      { jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: caps, clientInfo: { name: "toolbelt-assistant-proxy", version: VERSION } } },
      { expectId: id, timeoutMs: 30000 },
    );
    if (resp.error) throw new Error(resp.error.message || "initialize failed");
    await postUpstream({ jsonrpc: "2.0", method: "notifications/initialized" });
    session.initialized = true;
    log("connected to Toolbelt workspace MCP");
    startSseListener(); // server-initiated requests (elicitation etc.) arrive here
  })().finally(() => (session.initializing = null));
  return session.initializing;
}

// Standalone GET stream: how the server reaches US (elicitation, notifications).
let sseAbort = null;
async function startSseListener() {
  if (sseAbort) { try { sseAbort.abort(); } catch { /* ignore */ } }
  const mySession = session;
  const ctl = new AbortController();
  sseAbort = ctl;
  (async () => {
    while (session === mySession && session.initialized) {
      try {
        const headers = { accept: "text/event-stream", authorization: `Bearer ${API_KEY}` };
        if (session.id) headers["mcp-session-id"] = session.id;
        const res = await fetch(MCP_URL, { method: "GET", headers, signal: ctl.signal });
        if (res.status === 405) return; // server doesn't offer a standalone stream
        if (!res.ok) throw new Error(`GET stream HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
            const block = buf.slice(0, idx);
            buf = buf.slice(idx + (buf[idx] === "\r" ? 4 : 2));
            const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
            if (!data) continue;
            let msg;
            try { msg = JSON.parse(data); } catch { continue; }
            if (msg.id !== undefined && msg.method) handleUpstreamRequest(msg);
          }
        }
      } catch (e) {
        if (ctl.signal.aborted || session !== mySession) return;
        log(`SSE listener dropped (${e.message}); retrying in 2s`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })().catch((e) => log(`SSE listener crashed: ${e.message}`));
}

async function rpcUpstream(method, params, timeoutMs = CALL_TIMEOUT_MS) {
  const attempt = async () => {
    await initUpstream();
    const id = `u${nextUpId++}`;
    const resp = await postUpstream({ jsonrpc: "2.0", id, method, params }, { expectId: id, timeoutMs });
    if (resp.error) { const e = new Error(resp.error.message || `upstream error ${resp.error.code}`); e.code = resp.error.code; throw e; }
    return resp.result;
  };
  try {
    return await attempt();
  } catch (e) {
    if (e.sessionExpired || /session expired|fetch failed|ECONNRESET|socket|network|aborted/i.test(e.message || "")) {
      log(`upstream error (${e.message}); reconnecting once…`);
      session = { id: null, initialized: false, initializing: null };
      return attempt();
    }
    throw e;
  }
}

// ---------- agent features ----------
let personaLoaded = false;
let lastUpstreamError = "";
let toolsCache = { tools: null, at: 0 };
const TOOLS_TTL_MS = 30 * 1000;
const needsSetup = () => !API_KEY;

const personaTool = () => ({
  name: PERSONA_TOOL,
  description:
    `Load the live operating instructions (persona) of the "${NAME || "Toolbelt"}" assistant from Toolbelt. ` +
    `Call this when asked to act as the assistant, then fully adopt the returned instructions for the conversation.`,
  inputSchema: { type: "object", properties: {} },
});
const setupTool = () => ({
  name: SETUP_TOOL,
  description:
    `⚠️ ${NAME || "This agent"} needs a Toolbelt API key before its tools can load. ` +
    `Ask the user for their key (Toolbelt → Settings → Connect to Claude), then call this tool with it. ` +
    `It is saved to ${KEY_FILE} (shared by all agent plugins) — never echo it back.`,
  inputSchema: { type: "object", properties: { api_key: { type: "string", description: "The Toolbelt API key" } }, required: ["api_key"] },
});
const statusTool = () => ({
  name: STATUS_TOOL,
  description:
    `⚠️ Could not load tools from Toolbelt: ${lastUpstreamError || "unknown error"} — endpoint ${MCP_URL}. ` +
    `Call this tool to retry and see details. Common causes: wrong workspace ID, invalid API key, Toolbelt unreachable.`,
  inputSchema: { type: "object", properties: {} },
});
const tagTools = (tools) => (NAME ? tools.map((t) => ({ ...t, description: `[${NAME}] ${t.description || ""}` })) : tools);

async function fetchPersona() {
  let text = "";
  try {
    const res = await rpcUpstream("tools/call", { name: "toolbelt", arguments: { action: "get_assistant", params: JSON.stringify({ assistantId: WORKSPACE_ID }) } });
    const raw = res?.structuredContent ?? res?.content?.find?.((x) => x.type === "text")?.text;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    if (typeof data.systemPrompt === "string") text = data.systemPrompt;
    if (!NAME && data.name) NAME = String(data.name);
  } catch (e) {
    log(`get_assistant persona fetch failed (${e.message}); trying mcp-config…`);
    try {
      const r = await fetch(`${BASE_URL}/api/workspaces/${WORKSPACE_ID}/mcp-config`, { headers: { authorization: `Bearer ${API_KEY}` } });
      if (r.ok) text = (await r.json())?.mcpConfig?.systemPrompt || "";
      else log(`mcp-config fallback HTTP ${r.status}`);
    } catch (e2) { log(`mcp-config fallback failed: ${e2.message}`); }
  }
  return text;
}
const personaMessage = (p) => {
  const who = NAME || "this Toolbelt assistant";
  if (!p) return `Could not fetch live instructions for ${who} right now. Proceed using its tools; retry load_persona to load the persona.`;
  return (
    `From now on in this conversation, act as **${who}**, a Toolbelt assistant. ` +
    `Its tools, skills (wrench_*), and storage files are available to you via this connector — use them as your own. ` +
    `These are its current operating instructions (fetched live from Toolbelt):\n\n---\n\n${p}`
  );
};

// ---------- downstream request handlers ----------
const handlers = {
  initialize: async (params) => {
    clientCaps = params?.capabilities || {};
    return {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {}, prompts: {} },
      serverInfo: { name: NAME ? `apexti-${NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "toolbelt-assistant", title: NAME || "Toolbelt Assistant", version: VERSION },
      instructions:
        `This connector brings the Toolbelt assistant "${NAME || "(name loads on first use)"}" into Claude — ` +
        `its live tools, skills, and files. To adopt its persona, call the "${PERSONA_TOOL}" tool and fully adopt what it returns.`,
    };
  },
  ping: async () => ({}),
  "tools/list": async () => {
    if (needsSetup()) return { tools: [setupTool()] };
    if (toolsCache.tools && Date.now() - toolsCache.at < TOOLS_TTL_MS) return { tools: [personaTool(), ...tagTools(toolsCache.tools)] };
    try {
      const { tools = [] } = await rpcUpstream("tools/list", {});
      toolsCache = { tools, at: Date.now() };
      lastUpstreamError = "";
      return { tools: [personaTool(), ...tagTools(tools)] };
    } catch (e) {
      lastUpstreamError = e.message;
      log(`tools/list failed: ${e.message}`);
      return { tools: [personaTool(), ...(toolsCache.tools?.length ? tagTools(toolsCache.tools) : [statusTool()])] };
    }
  },
  "tools/call": async (params) => {
    const name = params?.name;
    const args = params?.arguments ?? {};
    if (name === SETUP_TOOL) {
      const key = String(args.api_key || "").trim();
      if (!key) return { isError: true, content: [{ type: "text", text: "No api_key provided." }] };
      try {
        mkdirSync(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
        writeFileSync(KEY_FILE, key + "\n", { mode: 0o600 });
      } catch (e) { return { isError: true, content: [{ type: "text", text: `Could not save key file: ${e.message}` }] }; }
      API_KEY = key;
      session = { id: null, initialized: false, initializing: null };
      try {
        const { tools = [] } = await rpcUpstream("tools/list", {});
        toolsCache = { tools, at: Date.now() };
        return { content: [{ type: "text", text: `Key saved to ${KEY_FILE} and verified — ${tools.length} tools available. Tell the user to reload/toggle the connector (or start a new chat) so the full tool list appears.` }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Key saved to ${KEY_FILE}, but Toolbelt rejected it or is unreachable: ${e.message}` }] };
      }
    }
    if (needsSetup()) return { isError: true, content: [{ type: "text", text: `Setup required: call ${SETUP_TOOL} with the user's Toolbelt API key first.` }] };
    if (name === PERSONA_TOOL) {
      personaLoaded = true;
      const p = await fetchPersona();
      return p
        ? { content: [{ type: "text", text: personaMessage(p) }] }
        : { isError: true, content: [{ type: "text", text: `Could not fetch live instructions. Retry, or check the connection with ${STATUS_TOOL}.` }] };
    }
    if (name === STATUS_TOOL) {
      try {
        const { tools = [] } = await rpcUpstream("tools/list", {});
        toolsCache = { tools, at: Date.now() };
        lastUpstreamError = "";
        return { content: [{ type: "text", text: `Connected. ${tools.length} tools available — reload/toggle this connector to refresh the tool list.` }] };
      } catch (e) {
        lastUpstreamError = e.message;
        return { isError: true, content: [{ type: "text", text: `Still failing: ${e.message}\nEndpoint: ${MCP_URL}\nCheck the workspace ID and API key.` }] };
      }
    }
    try {
      const res = await rpcUpstream("tools/call", { name, arguments: args });
      if (!personaLoaded && Array.isArray(res?.content)) {
        res.content = [...res.content, { type: "text", text: `[note] You have not loaded ${NAME || "this agent"}'s operating context yet. Call ${PERSONA_TOOL} to get its current instructions, skills, and knowledge before continuing to act as it.` }];
      }
      return res;
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: `Toolbelt error: ${e.message}` }] };
    }
  },
  "prompts/list": async () => {
    const persona = {
      name: PROMPT_NAME,
      title: `Act as ${NAME || "the Toolbelt assistant"}`,
      description: `Act as the "${NAME || "Toolbelt"}" assistant — loads its current instructions live from Toolbelt.`,
    };
    let up = [];
    try { if (!needsSetup()) up = (await rpcUpstream("prompts/list", {})).prompts ?? []; } catch { /* none */ }
    return { prompts: [persona, ...up.filter((p) => p.name !== PROMPT_NAME)] };
  },
  "prompts/get": async (params) => {
    if (params?.name === PROMPT_NAME) {
      return { description: `Act as ${NAME || "the Toolbelt assistant"}`, messages: [{ role: "user", content: { type: "text", text: PROMPT_TEXT } }] };
    }
    return rpcUpstream("prompts/get", { name: params?.name, arguments: params?.arguments ?? {} });
  },
};

// ---------- stdio loop ----------
let stdinBuf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuf += chunk;
  let nl;
  while ((nl = stdinBuf.indexOf("\n")) !== -1) {
    const line = stdinBuf.slice(0, nl).trim();
    stdinBuf = stdinBuf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log("bad JSON on stdin"); continue; }
    handleDownstream(msg).catch((e) => log(`handler crash: ${e?.message || e}`));
  }
});
process.stdin.on("end", () => { log("stdin closed; exiting"); process.exit(0); });

async function handleDownstream(msg) {
  // Response to a request WE sent downstream (elicitation/sampling bridge)
  if (msg.id !== undefined && !msg.method) {
    const p = downPending.get(msg.id);
    if (p) {
      downPending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || "client error"));
      else p.resolve(msg.result);
    }
    return;
  }
  if (msg.method?.startsWith("notifications/")) return; // ignore (incl. initialized, cancelled)
  const h = handlers[msg.method];
  if (msg.id === undefined) return; // unknown notification
  if (!h) return sendError(msg.id, -32601, `Method not found: ${msg.method}`);
  try {
    sendResult(msg.id, await h(msg.params));
  } catch (e) {
    sendError(msg.id, -32603, e?.message || "internal error");
  }
}

log(`toolbelt-assistant ${VERSION} (dependency-free) ready on stdio · upstream ${MCP_URL}${needsSetup() ? " · NO API KEY (setup mode)" : ""}`);

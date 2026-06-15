#!/usr/bin/env node
/**
 * Toolbelt OAuth Gateway — gives Toolbelt's MCP endpoints real MCP OAuth
 * WITHOUT any Toolbelt source changes. Zero dependencies (Node 18+ builtins).
 *
 * Flow: Claude discovers OAuth here → user signs in ONCE on our HTTPS page by
 * entering their Toolbelt API key → we seal the key (AES-256-GCM) inside the
 * issued tokens → every MCP call is forwarded to Toolbelt with the real key.
 * Claude only ever holds opaque tokens. No key in chat, no key in Claude logs,
 * no database (fully stateless — tokens carry their own sealed payload).
 *
 * Env:
 *   GATEWAY_SECRET      required, long random string (rotating it revokes all tokens)
 *   PUBLIC_URL          required in production, e.g. https://connect.apexti.com
 *   TOOLBELT_BASE_URL   default https://toolbelt.apexti.com
 *   PORT                default 8787
 *
 * Connect URL for Claude (custom connector / plugin .mcp.json type http):
 *   {PUBLIC_URL}/workspaces/{workspace_id}/mcp
 */
import { createServer } from "node:http";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Auto-generate a secret if none is set (logged once so you can pin it). Pin it in env
// for production — rotating it logs everyone out.
const SECRET = process.env.GATEWAY_SECRET || randomBytes(32).toString("hex");
if (!process.env.GATEWAY_SECRET) console.error(`[gateway] WARNING: no GATEWAY_SECRET set; generated an ephemeral one. Pin this in env to keep sessions across restarts:\n  GATEWAY_SECRET=${SECRET}`);
const PORT = Number(process.env.PORT || 8787);
// PUBLIC_URL must be the exact public origin (baked into OAuth metadata). Auto-detect on
// common hosts (Render) so deploy is one fewer manual step.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const TOOLBELT = (process.env.TOOLBELT_BASE_URL || "https://toolbelt.apexti.com").replace(/\/+$/, "");
const AES_KEY = createHash("sha256").update(SECRET).digest();
const log = (...a) => console.error(`[gateway] ${a.join(" ")}`);

// Brand icon: served at /icon.png + /favicon.* and advertised in the MCP initialize
// response (serverInfo.icons, MCP spec SEP-973) so clients that support it show Apexti's
// logo instead of a generic globe. Loaded once; gateway runs fine without it.
let ICON_BUF = null, ICON_DATA_URI = null;
try {
  ICON_BUF = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "icon.png"));
  ICON_DATA_URI = `data:image/png;base64,${ICON_BUF.toString("base64")}`;
} catch { log("no icon.png next to index.js — connector will use the client's default icon"); }

// ---------- sealed tokens (AES-256-GCM, stateless) ----------
const b64u = (b) => Buffer.from(b).toString("base64url");
const seal = (obj) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", AES_KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return "v1." + b64u(Buffer.concat([iv, ct, c.getAuthTag()]));
};
const unseal = (tok) => {
  try {
    if (!tok?.startsWith("v1.")) return null;
    const raw = Buffer.from(tok.slice(3), "base64url");
    const iv = raw.subarray(0, 12), tag = raw.subarray(raw.length - 16), ct = raw.subarray(12, raw.length - 16);
    const d = createDecipheriv("aes-256-gcm", AES_KEY, iv);
    d.setAuthTag(tag);
    const obj = JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch { return null; }
};
const sha256b64u = (s) => b64u(createHash("sha256").update(s).digest());

// ---------- helpers ----------
const json = (res, code, obj, headers = {}) => {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", ...headers });
  res.end(body);
};
const html = (res, code, body) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8" }); res.end(body); };
const readBody = (req) => new Promise((ok, no) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d)); req.on("error", no); });
const form = (s) => Object.fromEntries(new URLSearchParams(s));

// CORS: remote MCP calls are usually server-side, but claude.ai web may preflight.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version, www-authenticate",
  "access-control-max-age": "86400",
};

// ---------- response transforms (parity with the local .mcpb proxy) ----------
// Mutate a parsed JSON-RPC message in place IFF it needs help: inject the brand icon into
// the initialize handshake, surface org-policy gates, and convert structured-only results
// to text. Tightly scoped so unrelated responses pass through untouched. Returns true if changed.
function rewriteMessage(msg) {
  const r = msg && typeof msg === "object" && !Array.isArray(msg) ? msg.result : null;
  if (!r || typeof r !== "object") return false;
  // initialize: brand icon + a routing nudge so Claude reaches for THIS connector
  // unprompted (additive; clients that ignore these fields are unaffected).
  if (r.serverInfo && typeof r.serverInfo === "object") {
    let changed = false;
    if (ICON_DATA_URI && !r.serverInfo.icons) {
      r.serverInfo.icons = [{ src: ICON_DATA_URI, mimeType: "image/png", sizes: ["512x512"] }];
      changed = true;
    }
    const agent = r.serverInfo.name || "this Toolbelt assistant";
    const ROUTE =
      `You are connected to "${agent}", a Toolbelt assistant (Powered by Apexti). When the ` +
      `user's request falls in ${agent}'s domain, use THIS connector's tools directly — do ` +
      `not answer generically or ask the user which connector to use. Call the load_persona ` +
      `tool FIRST to adopt ${agent}'s current instructions, skills, and memory, then act with ` +
      `its tools. (Tool names on this connector are unprefixed, e.g. load_persona, get_calendar.)`;
    if (typeof r.instructions === "string" && r.instructions.trim()) {
      if (!r.instructions.includes("Powered by Apexti")) { r.instructions = `${r.instructions}\n\n${ROUTE}`; changed = true; }
    } else { r.instructions = ROUTE; changed = true; }
    return changed;
  }
  // tools/list: drop intra-connector duplicate tool names. Cross-connector duplicates are
  // fine (the client namespaces per connector), but Toolbelt can aggregate two services
  // exposing the SAME name in one workspace, and a duplicate registration can break the
  // connector. Keep the first, drop the rest (mirrors the .mcpb proxy's dedupe).
  if (Array.isArray(r.tools)) {
    const seen = new Set();
    const deduped = r.tools.filter((t) => {
      const nm = t && typeof t.name === "string" ? t.name : null;
      if (nm === null) return true;
      if (seen.has(nm)) return false;
      seen.add(nm);
      return true;
    });
    if (deduped.length !== r.tools.length) { r.tools = deduped; return true; }
    return false;
  }
  // Org-policy "ask" gate: surface needsConfirmation as a clear human-approval request.
  if (r.needsConfirmation && r.confirmationId) {
    const name = r.toolName || "this action";
    r.content = [{ type: "text", text:
      `🔒 APPROVAL REQUIRED — your organization's policy (set in Toolbelt by IT/Security) ` +
      `requires explicit approval before "${name}" runs. The action has NOT happened.\n\n` +
      `Confirmation ID: ${r.confirmationId}\n\n` +
      `Tell the user plainly what this action will do and ask them to approve. ` +
      `Do NOT approve on their behalf. ONLY if the user explicitly approves, call ` +
      `\`${name}\` again with the same arguments PLUS \`__confirmationId\`: "${r.confirmationId}". ` +
      `If they decline, do not proceed.` }];
    return true;
  }
  // Empty content + structuredContent → readable text (clients render empty content as
  // "no output"). Only fires when structuredContent exists, so non-tool results are safe.
  if ((!Array.isArray(r.content) || r.content.length === 0) && r.structuredContent !== undefined) {
    r.content = [{ type: "text", text: JSON.stringify(r.structuredContent, null, 2) }];
    return true;
  }
  return false;
}
const applyRewrite = (msg) => Array.isArray(msg) ? msg.map(rewriteMessage).some(Boolean) : rewriteMessage(msg);

// Transform one complete SSE event's text; leave framing (event:/id:/comments) intact.
function transformSseEvent(raw) {
  if (!raw.trim()) return raw;
  const lines = raw.split("\n");
  const dataLines = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, ""));
  if (!dataLines.length) return raw;
  let msg;
  try { msg = JSON.parse(dataLines.join("\n")); } catch { return raw; }
  if (!applyRewrite(msg)) return raw;
  const head = lines.filter((l) => !l.startsWith("data:") && l !== "");
  return [...head, `data: ${JSON.stringify(msg)}`].join("\n");
}

const AS_META = {
  issuer: PUBLIC_URL,
  authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
  token_endpoint: `${PUBLIC_URL}/oauth/token`,
  registration_endpoint: `${PUBLIC_URL}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["toolbelt"],
};

const PAGE = (params, err = "") => `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to Toolbelt</title>
<link rel="icon" type="image/png" href="/icon.png">
<body style="font-family:system-ui;max-width:430px;margin:8vh auto;padding:0 20px;color:#111">
${ICON_BUF ? `<img src="/icon.png" alt="Apexti" width="56" height="56" style="border-radius:12px;display:block;margin-bottom:12px">` : ""}
<h2 style="margin-bottom:4px">Connect Claude to Toolbelt</h2>
<p style="color:#555">Enter your Toolbelt API key (Toolbelt → Settings → Connect to Claude).
It is encrypted into your session and never shown to Claude.</p>
${err ? `<p style="color:#c0392b">${err}</p>` : ""}
<form method="POST" action="/oauth/authorize">
${Object.entries(params).filter(([k]) => k !== "api_key").map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}">`).join("\n")}
<input name="api_key" type="password" required placeholder="tb_..." autofocus
 style="width:100%;padding:12px;font-size:15px;border:1px solid #ccc;border-radius:8px;box-sizing:border-box">
<button style="margin-top:12px;width:100%;padding:12px;font-size:15px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer">
Connect</button></form>
<p style="color:#999;font-size:12px;margin-top:24px">Powered by Apexti · apexti.com</p></body>`;

// ---------- request handler ----------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  const path = url.pathname;
  try {
    // --- CORS preflight (claude.ai web) ---
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

    // --- OAuth discovery ---
    if (req.method === "GET" && path.startsWith("/.well-known/oauth-protected-resource")) {
      const resource = path.replace("/.well-known/oauth-protected-resource", "") || "/";
      return json(res, 200, { resource: `${PUBLIC_URL}${resource === "/" ? "" : resource}`, authorization_servers: [PUBLIC_URL], bearer_methods_supported: ["header"] });
    }
    if (req.method === "GET" && (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")))
      return json(res, 200, AS_META);

    // --- Dynamic client registration (stateless: client_id is a sealed blob) ---
    if (req.method === "POST" && path === "/oauth/register") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.slice(0, 10) : [];
      if (!redirect_uris.length) return json(res, 400, { error: "invalid_client_metadata", error_description: "redirect_uris required" });
      const client_id = seal({ t: "client", redirect_uris });
      return json(res, 201, { client_id, redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_name: body.client_name || "mcp-client" });
    }

    // --- Authorize: GET shows the key page, POST issues the code ---
    if (path === "/oauth/authorize" && req.method === "GET") {
      const q = Object.fromEntries(url.searchParams);
      const client = unseal(q.client_id);
      if (!client || client.t !== "client") return html(res, 400, "<p>Unknown client.</p>");
      if (!client.redirect_uris.includes(q.redirect_uri)) return html(res, 400, "<p>redirect_uri not registered.</p>");
      if (q.response_type !== "code" || !q.code_challenge || q.code_challenge_method !== "S256")
        return html(res, 400, "<p>PKCE (S256) authorization code flow required.</p>");
      return html(res, 200, PAGE({ client_id: q.client_id, redirect_uri: q.redirect_uri, state: q.state || "", code_challenge: q.code_challenge, code_challenge_method: "S256" }));
    }
    if (path === "/oauth/authorize" && req.method === "POST") {
      const f = form(await readBody(req));
      const client = unseal(f.client_id);
      if (!client || client.t !== "client" || !client.redirect_uris.includes(f.redirect_uri)) return html(res, 400, "<p>Bad client.</p>");
      const key = (f.api_key || "").trim();
      if (!key) return html(res, 200, PAGE(f, "Please enter an API key."));
      // Validate the key against a KEY-ONLY endpoint (lists the user's workspaces). Do NOT
      // validate against a specific/dummy workspace — a valid key returns 403 for a
      // workspace it can't access, which would wrongly reject good keys. GET /api/workspaces
      // accepts apiKeyAuth and needs no workspace, so only 401 means a bad key.
      const ac = new AbortController();
      const vt = setTimeout(() => ac.abort(), 5000);
      try {
        const r = await fetch(`${TOOLBELT}/api/workspaces`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: ac.signal });
        if (r.status === 401) return html(res, 200, PAGE(f, "Toolbelt rejected that key (401). Get a fresh key from Toolbelt → Settings → Connect to Claude and try again."));
        r.body?.cancel?.().catch?.(() => {});
      } catch { /* Toolbelt unreachable or slow (>5s) — accept; the first real MCP call will surface any issue */ }
      finally { clearTimeout(vt); }
      const code = seal({ t: "code", k: key, cid: f.client_id.slice(-24), ru: f.redirect_uri, cc: f.code_challenge, exp: Date.now() + 5 * 60 * 1000 });
      const loc = new URL(f.redirect_uri);
      loc.searchParams.set("code", code);
      if (f.state) loc.searchParams.set("state", f.state);
      res.writeHead(302, { location: loc.toString() });
      return res.end();
    }

    // --- Token endpoint ---
    if (req.method === "POST" && path === "/oauth/token") {
      const f = form(await readBody(req));
      if (f.grant_type === "authorization_code") {
        const c = unseal(f.code);
        if (!c || c.t !== "code") return json(res, 400, { error: "invalid_grant" });
        if (c.cid !== (f.client_id || "").slice(-24) || c.ru !== f.redirect_uri) return json(res, 400, { error: "invalid_grant" });
        if (!f.code_verifier || sha256b64u(f.code_verifier) !== c.cc) return json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return json(res, 200, {
          access_token: seal({ t: "access", k: c.k, exp: Date.now() + 30 * 864e5 }),
          token_type: "Bearer", expires_in: 30 * 86400, scope: "toolbelt",
          refresh_token: seal({ t: "refresh", k: c.k, exp: Date.now() + 90 * 864e5 }),
        });
      }
      if (f.grant_type === "refresh_token") {
        const r = unseal(f.refresh_token);
        if (!r || r.t !== "refresh") return json(res, 400, { error: "invalid_grant" });
        return json(res, 200, {
          access_token: seal({ t: "access", k: r.k, exp: Date.now() + 30 * 864e5 }),
          token_type: "Bearer", expires_in: 30 * 86400, scope: "toolbelt",
          refresh_token: seal({ t: "refresh", k: r.k, exp: Date.now() + 90 * 864e5 }),
        });
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }

    // --- MCP passthrough: /workspaces/{id}/mcp -> Toolbelt with the real key ---
    const m = path.match(/^\/workspaces\/([^/]+)\/mcp$/);
    if (m) {
      const tok = unseal((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
      if (!tok || tok.t !== "access") {
        return json(res, 401, { error: "invalid_token" }, {
          ...CORS,
          "www-authenticate": `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/workspaces/${m[1]}/mcp"`,
        });
      }
      const fwdHeaders = { authorization: `Bearer ${tok.k}` };
      for (const h of ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"])
        if (req.headers[h]) fwdHeaders[h] = req.headers[h];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const up = await fetch(`${TOOLBELT}/api/workspaces/${m[1]}/mcp`, { method: req.method, headers: fwdHeaders, body });
      const ctype = (up.headers.get("content-type") || "").split(";")[0].trim();
      const outHeaders = { ...CORS };
      for (const h of ["content-type", "mcp-session-id", "mcp-protocol-version"]) {
        const v = up.headers.get(h);
        if (v) outHeaders[h] = v;
      }
      if (!up.body) { res.writeHead(up.status, outHeaders); return res.end(); }

      // application/json: buffer, rewrite tool results, re-serialize.
      if (ctype === "application/json") {
        const buf = Buffer.from(await up.arrayBuffer());
        let out = buf;
        try { const msg = JSON.parse(buf.toString("utf8")); if (applyRewrite(msg)) out = Buffer.from(JSON.stringify(msg)); }
        catch { /* not JSON-RPC we recognize — pass through untouched */ }
        res.writeHead(up.status, outHeaders);
        return res.end(out);
      }

      // text/event-stream: transform per complete event, preserving streaming + framing.
      if (ctype === "text/event-stream") {
        res.writeHead(up.status, outHeaders);
        const dec = new StringDecoder("utf8");
        let bufS = "";
        for await (const chunk of up.body) {
          bufS += dec.write(Buffer.from(chunk));
          let i;
          while ((i = bufS.indexOf("\n\n")) !== -1) {
            res.write(transformSseEvent(bufS.slice(0, i)) + "\n\n");
            bufS = bufS.slice(i + 2);
          }
        }
        bufS += dec.end();
        if (bufS) res.write(transformSseEvent(bufS));
        return res.end();
      }

      // Anything else: stream through unchanged.
      res.writeHead(up.status, outHeaders);
      for await (const chunk of up.body) res.write(chunk);
      return res.end();
    }

    // Brand icon (served for favicon-based clients + the sign-in page <img>).
    if (req.method === "GET" && (path === "/icon.png" || path === "/favicon.png" || path === "/favicon.ico")) {
      if (!ICON_BUF) return json(res, 404, { error: "no_icon" });
      res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" });
      return res.end(ICON_BUF);
    }

    if (path === "/" || path === "/health") return json(res, 200, { ok: true, service: "toolbelt-oauth-gateway", issuer: PUBLIC_URL });
    return json(res, 404, { error: "not_found" });
  } catch (e) {
    log(`error ${req.method} ${path}: ${e.message}`);
    try { json(res, 500, { error: "server_error" }); } catch { /* sent */ }
  }
});

server.listen(PORT, () => log(`toolbelt-oauth-gateway listening on :${PORT} · issuer ${PUBLIC_URL} · upstream ${TOOLBELT}`));

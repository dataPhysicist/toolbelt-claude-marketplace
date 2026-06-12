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
<body style="font-family:system-ui;max-width:430px;margin:8vh auto;padding:0 20px;color:#111">
<h2 style="margin-bottom:4px">Connect Claude to Toolbelt</h2>
<p style="color:#555">Enter your Toolbelt API key (Toolbelt → Settings → Connect to Claude).
It is encrypted into your session and never shown to Claude.</p>
${err ? `<p style="color:#c0392b">${err}</p>` : ""}
<form method="POST" action="/oauth/authorize">
${Object.entries(params).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}">`).join("\n")}
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
      // Light validation against Toolbelt (don't block on transient failures)
      try {
        const r = await fetch(`${TOOLBELT}/api/workspaces/00000000-0000-0000-0000-000000000000/mcp`, {
          method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${key}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "gateway-check", version: "1" } } }),
        });
        if (r.status === 401 || r.status === 403) return html(res, 200, PAGE(f, "Toolbelt rejected that key (401/403). Check it and try again."));
        r.body?.cancel?.().catch?.(() => {});
      } catch { /* Toolbelt unreachable — accept; first real call will surface it */ }
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
          "www-authenticate": `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/workspaces/${m[1]}/mcp"`,
        });
      }
      const fwdHeaders = { authorization: `Bearer ${tok.k}` };
      for (const h of ["content-type", "accept", "mcp-session-id", "mcp-protocol-version", "last-event-id"])
        if (req.headers[h]) fwdHeaders[h] = req.headers[h];
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const up = await fetch(`${TOOLBELT}/api/workspaces/${m[1]}/mcp`, { method: req.method, headers: fwdHeaders, body });
      const outHeaders = {};
      for (const h of ["content-type", "mcp-session-id", "mcp-protocol-version"]) {
        const v = up.headers.get(h);
        if (v) outHeaders[h] = v;
      }
      res.writeHead(up.status, outHeaders);
      if (!up.body) return res.end();
      for await (const chunk of up.body) res.write(chunk); // streams SSE through
      return res.end();
    }

    if (path === "/" || path === "/health") return json(res, 200, { ok: true, service: "toolbelt-oauth-gateway", issuer: PUBLIC_URL });
    return json(res, 404, { error: "not_found" });
  } catch (e) {
    log(`error ${req.method} ${path}: ${e.message}`);
    try { json(res, 500, { error: "server_error" }); } catch { /* sent */ }
  }
});

server.listen(PORT, () => log(`toolbelt-oauth-gateway listening on :${PORT} · issuer ${PUBLIC_URL} · upstream ${TOOLBELT}`));

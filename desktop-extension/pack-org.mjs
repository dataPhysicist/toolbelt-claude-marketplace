#!/usr/bin/env node
/**
 * Build a per-org branded .mcpb so it shows up named in Claude's Settings list
 * (the list label is the manifest `display_name`, which is static per build).
 *
 *   node pack-org.mjs --org "Acme Corp" [--workspace <id>] [--out Acme.mcpb]
 *
 * --org        Required. Stamped into display_name ("Toolbelt — Acme Corp") and baked
 *              into TOOLBELT_ORG_NAME (so the install no longer asks for it).
 * --workspace  Optional. Bakes the hub workspace ID into the endpoint so the user only
 *              enters their API key at install.
 * --out        Optional output filename (default: <slug>.mcpb).
 *
 * Requires `npm install` to have run in this folder (the bundled SDK is packed in).
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[i + 1];
}
const org = opt.org;
if (!org) {
  console.error('Usage: node pack-org.mjs --org "Name" [--workspace <id>] [--out file.mcpb]');
  process.exit(1);
}
const slug = org.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";
const out = opt.out || `${slug}.mcpb`;

const original = readFileSync("manifest.json", "utf8");
const m = JSON.parse(original);

m.display_name = `Toolbelt — ${org}`;
m.name = `toolbelt-${slug}`;
m.server.mcp_config.env.TOOLBELT_ORG_NAME = org; // bake the org name
delete m.user_config.toolbelt_org_name; // …so it isn't asked at install
if (opt.workspace) {
  m.server.mcp_config.env.TOOLBELT_MCP_URL = `https://toolbelt.apexti.com/api/workspaces/${opt.workspace}/mcp`;
  delete m.user_config.toolbelt_workspace_id; // baked in → only the API key remains
}

try {
  writeFileSync("manifest.json", JSON.stringify(m, null, 2) + "\n");
  execSync("npx -y @anthropic-ai/mcpb pack", { stdio: "inherit" });
  renameSync("desktop-extension.mcpb", out); // default pack output → branded name
  console.log(
    `\n✓ Built ${out}  ·  display name "Toolbelt — ${org}"` +
      (opt.workspace ? "  ·  workspace baked in (only API key needed at install)" : ""),
  );
} finally {
  writeFileSync("manifest.json", original); // always restore the base manifest
}

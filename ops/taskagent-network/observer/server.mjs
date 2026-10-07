import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod";

import { normalizeTarget, validateResolvedAddresses, validateServiceQuery } from "./security.mjs";

const execFileAsync = promisify(execFile);
const port = Number(process.env.N9_NETWORK_OBSERVER_PORT ?? "7391");
const inventoryPath = process.env.N9_NETWORK_INVENTORY ?? new URL("./inventory.json", import.meta.url).pathname;
const bearer = process.env.N9_NETWORK_OBSERVER_TOKEN ?? "";

if (!bearer) throw new Error("N9_NETWORK_OBSERVER_TOKEN is required");

function loadInventory() {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  for (const target of Object.values(inventory.targets ?? {})) {
    if (target.urlEnv) target.url = process.env[target.urlEnv];
    if (target.allowedCidrsEnv) target.allowedCidrs = (process.env[target.allowedCidrsEnv] ?? "").split(",").filter(Boolean);
  }
  return inventory;
}

function result(data) {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

async function resolveTarget(inventory, targetId) {
  const url = normalizeTarget(inventory, targetId);
  const target = inventory.targets[targetId];
  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!target.allowPrivate) validateResolvedAddresses(records.map((record) => record.address), target.allowedCidrs ?? []);
  return { url, addresses: records.map((record) => record.address) };
}

async function probePinnedUrl(url, addresses, timeoutSeconds) {
  const client = url.protocol === "https:" ? https : http;
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      method: "GET",
      headers: { host: url.host },
      servername: url.hostname,
      timeout: timeoutSeconds * 1000,
      lookup: (_hostname, _options, callback) => callback(null, address, address.includes(":") ? 6 : 4),
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode, location: response.headers.location ?? null }));
    });
    request.on("timeout", () => request.destroy(new Error("probe timed out")));
    request.on("error", reject);
    request.end();
  });
}

function buildServer() {
  const inventory = loadInventory();
  const server = new McpServer({ name: "n9-network-observer", version: "1.0.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool("network_resolve_host", {
    description: "Resolve an allowlisted logical target and return only its approved addresses.",
    inputSchema: { target_id: z.string().min(1) }, annotations: readOnly,
  }, async ({ target_id }) => {
    const target = await resolveTarget(inventory, target_id);
    return result({ target_id, hostname: target.url.hostname, addresses: target.addresses });
  });

  server.registerTool("network_probe_http", {
    description: "Probe an allowlisted HTTP target without following redirects.",
    inputSchema: { target_id: z.string().min(1), path: z.string().startsWith("/").default("/healthz"), timeout_seconds: z.number().int().min(1).max(30).default(10) },
    annotations: readOnly,
  }, async ({ target_id, path, timeout_seconds }) => {
    const target = await resolveTarget(inventory, target_id);
    const url = new URL(path, target.url);
    const started = performance.now();
    const response = await probePinnedUrl(url, target.addresses, timeout_seconds);
    return result({ target_id, status: response.status, duration_ms: Math.round(performance.now() - started), location: response.location });
  });

  server.registerTool("service_read_status", {
    description: "Read systemd status for one allowlisted TaskAgent service.",
    inputSchema: { service_id: z.string().min(1) }, annotations: readOnly,
  }, async ({ service_id }) => {
    validateServiceQuery(inventory, service_id, 1);
    const { stdout } = await execFileAsync("systemctl", ["show", service_id, "--property=ActiveState,SubState,MainPID", "--no-pager"], { timeout: 5000 });
    return result({ service_id, status: stdout.trim().split("\n") });
  });

  server.registerTool("service_read_logs", {
    description: "Read a bounded, redacted journal window for one allowlisted service.",
    inputSchema: { service_id: z.string().min(1), lines: z.number().int().min(1).max(200).default(100) }, annotations: readOnly,
  }, async ({ service_id, lines }) => {
    validateServiceQuery(inventory, service_id, lines);
    const { stdout } = await execFileAsync("journalctl", ["-u", service_id, "-n", String(lines), "--no-pager", "--output=short-iso"], { timeout: 10000, maxBuffer: 512 * 1024 });
    const redacted = stdout.replace(/(authorization|token|password|secret|api[_-]?key)[=: ]+\S+/gi, "$1=[REDACTED]");
    return result({ service_id, lines: redacted.trim().split("\n").slice(-lines) });
  });

  server.registerTool("storage_check_access", {
    description: "Check configured upload storage metadata and service-account write access without changing data.",
    inputSchema: {}, annotations: readOnly,
  }, async () => {
    const uploadDir = process.env.TASKAGENT_UPLOAD_DIR;
    const user = process.env.TASKAGENT_SERVICE_USER;
    if (!uploadDir || !user) throw new Error("storage contract is not configured");
    const stat = fs.statSync(uploadDir);
    await execFileAsync("runuser", ["-u", user, "--", "test", "-w", uploadDir, "-a", "-x", uploadDir], { timeout: 5000 });
    return result({ path: uploadDir, service_user: user, directory: stat.isDirectory(), writable: true });
  });

  server.registerTool("storage_verify_upload_roundtrip", {
    description: "Upload a small isolated fixture, download it, verify its SHA-256 digest, then delete only that fixture through the TaskAgent API.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async () => {
    const base = process.env.TASKAGENT_INTERNAL_BACKEND_URL;
    const token = process.env.TASKAGENT_NETWORK_PAT;
    const workspaceId = process.env.TASKAGENT_NETWORK_WORKSPACE_ID;
    if (!base || !token || !workspaceId) throw new Error("TaskAgent upload probe is not configured");

    const bytes = crypto.randomBytes(64);
    const expectedSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/octet-stream" }), `n9-network-probe-${crypto.randomUUID()}.bin`);
    const headers = { authorization: `Bearer ${token}`, "x-workspace-id": workspaceId };
    let attachment;
    try {
      const upload = await fetch(new URL("/api/upload-file", base), { method: "POST", headers, body: form });
      if (!upload.ok) throw new Error(`TaskAgent upload API returned ${upload.status}`);
      attachment = await upload.json();
      if (!attachment?.id) throw new Error("TaskAgent upload response omitted attachment id");
      const downloadPath = attachment.download_url || attachment.url || `/api/attachments/${attachment.id}/download`;
      const download = await fetch(new URL(downloadPath, base), { headers });
      if (!download.ok) throw new Error(`TaskAgent download API returned ${download.status}`);
      const actualSha256 = crypto.createHash("sha256").update(Buffer.from(await download.arrayBuffer())).digest("hex");
      if (actualSha256 !== expectedSha256) throw new Error("TaskAgent upload round-trip checksum mismatch");
      return result({ attachment_id: attachment.id, bytes: bytes.length, sha256: actualSha256, cleanup: "performed_before_response" });
    } finally {
      if (attachment?.id) {
        const cleanup = await fetch(new URL(`/api/attachments/${attachment.id}`, base), { method: "DELETE", headers });
        if (!cleanup.ok && cleanup.status !== 404) throw new Error(`TaskAgent fixture cleanup returned ${cleanup.status}`);
      }
    }
  });

  server.registerTool("incident_create_issue", {
    description: "Create a network incident in the single allowlisted TaskAgent workspace/project.",
    inputSchema: { title: z.string().min(1).max(180), description: z.string().min(1).max(12000), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ title, description, fingerprint }) => {
    const base = process.env.TASKAGENT_INTERNAL_BACKEND_URL;
    const token = process.env.TASKAGENT_NETWORK_PAT;
    const workspaceId = process.env.TASKAGENT_NETWORK_WORKSPACE_ID;
    if (!base || !token || !workspaceId) throw new Error("TaskAgent incident writer is not configured");
    const body = { title, description: `${description}\n\n<!-- n9-network-fingerprint:${fingerprint} -->`, project_id: process.env.TASKAGENT_NETWORK_PROJECT_ID || undefined };
    const response = await fetch(new URL("/api/issues", base), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-workspace-id": workspaceId }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`TaskAgent issue API returned ${response.status}`);
    const issue = await response.json();
    return result({ issue_id: issue.id, fingerprint });
  });
  return server;
}

const app = express();
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(provided);
  const right = Buffer.from(bearer);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return res.status(401).json({ error: "unauthorized" });
  next();
});

const transports = new Map();
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID(), onsessioninitialized: (id) => transports.set(id, transport) });
    transport.onclose = () => transport.sessionId && transports.delete(transport.sessionId);
    await buildServer().connect(transport);
  }
  if (!transport) return res.status(400).json({ error: "invalid MCP session" });
  await transport.handleRequest(req, res, req.body);
});
app.listen(port, "127.0.0.1", () => console.log(`n9-network-observer listening on 127.0.0.1:${port}`));

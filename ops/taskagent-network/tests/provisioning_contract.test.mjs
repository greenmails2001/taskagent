import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("taskagent/provisioning-manifest.json", root), "utf8"));
const source = fs.readFileSync(new URL("taskagent/provision.mjs", root), "utf8");

test("declares the complete managed team", () => {
  assert.equal(manifest.squad.name, "n9_network_ops");
  assert.deepEqual(manifest.agents.map((agent) => agent.name), [
    "n9_network_lead", "n9_network_ingress", "n9_network_service",
    "n9_network_storage", "n9_network_runtime", "n9_network_verifier",
    "n9_network_documenter",
  ]);
  assert.equal(manifest.autopilot.name, "n9_network_incident_triage");
  assert.equal(manifest.autopilot.trigger.kind, "webhook");
});

test("provisioner pauses autopilot and disables trigger before activation", () => {
  const createIndex = source.indexOf("createAutopilot");
  const pauseIndex = source.indexOf("pauseAutopilot");
  const triggerIndex = source.indexOf("createTrigger");
  const disableIndex = source.indexOf("disableTrigger");
  assert.ok(createIndex >= 0 && pauseIndex > createIndex);
  assert.ok(triggerIndex > pauseIndex && disableIndex > triggerIndex);
  assert.match(source, /--apply/);
  assert.match(source, /N9_NETWORK_PROVISIONING_STATE is required for --apply/);
  assert.match(source, /managed_by=n9-network-provisioner/);
});

test("deployment gates have a receipt generator and all deterministic timers", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "n9-network-receipt-"));
  const evidence = path.join(temp, "evidence");
  const receiptPath = path.join(temp, "receipt.json");
  fs.mkdirSync(evidence);
  for (const field of ["backup_verified", "restore_verified", "config_verified", "upload_verified", "websocket_verified", "rollback_verified"]) {
    fs.writeFileSync(path.join(evidence, `${field.replace("_verified", "")}.ok`), `${field}\n`);
  }
  execFileSync(fileURLToPath(new URL("scripts/create-deployment-receipt.sh", root)), [evidence, receiptPath]);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  for (const field of ["backup_verified", "restore_verified", "config_verified", "upload_verified", "websocket_verified", "rollback_verified"]) assert.equal(receipt[field], true);
  fs.rmSync(temp, { recursive: true });
  for (const mode of ["health", "upload", "drift", "certificate"]) {
    const timer = fs.readFileSync(new URL(`systemd/n9-network-${mode}.timer`, root), "utf8");
    assert.match(timer, new RegExp(`n9-network-monitor@${mode}\\.service`));
  }
});

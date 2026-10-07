import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  normalizeTarget,
  validateResolvedAddresses,
  validateServiceQuery,
} from "../observer/security.mjs";

const inventory = {
  targets: {
    taskagent_public: {
      url: "https://taskagent.example.com",
      allowedCidrs: ["192.0.2.0/24"],
    },
  },
  services: ["taskagent-backend-native.service", "taskagent-web-native.service"],
};

test("resolves only a configured logical target", () => {
  assert.equal(normalizeTarget(inventory, "taskagent_public").hostname, "taskagent.example.com");
  assert.throws(() => normalizeTarget(inventory, "http://169.254.169.254"), /unknown target_id/);
});

test("rejects metadata, loopback, and addresses outside the allowlist", () => {
  assert.throws(() => validateResolvedAddresses(["169.254.169.254"], ["192.0.2.0/24"]), /blocked address/);
  assert.throws(() => validateResolvedAddresses(["127.0.0.1"], ["192.0.2.0/24"]), /blocked address/);
  assert.throws(() => validateResolvedAddresses(["198.51.100.10"], ["192.0.2.0/24"]), /outside allowed CIDRs/);
  assert.doesNotThrow(() => validateResolvedAddresses(["192.0.2.12"], ["192.0.2.0/24"]));
});

test("accepts only enumerated services and bounded log limits", () => {
  assert.deepEqual(validateServiceQuery(inventory, "taskagent-backend-native.service", 100), {
    service: "taskagent-backend-native.service",
    lines: 100,
  });
  assert.throws(() => validateServiceQuery(inventory, "ssh.service", 100), /unknown service_id/);
  assert.throws(() => validateServiceQuery(inventory, "taskagent-backend-native.service", 1000), /between 1 and 200/);
});

test("observer exposes an isolated upload round-trip with API cleanup", () => {
  const source = fs.readFileSync(new URL("../observer/server.mjs", import.meta.url), "utf8");
  assert.match(source, /storage_verify_upload_roundtrip/);
  assert.match(source, /\/api\/upload-file/);
  assert.match(source, /\/api\/attachments\/\$\{attachment\.id\}/);
  assert.match(source, /crypto\.createHash\("sha256"\)/);
  assert.match(source, /finally/);
});

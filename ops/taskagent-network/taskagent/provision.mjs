import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const manifestPath = new URL("./provisioning-manifest.json", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const base = process.env.TASKAGENT_INTERNAL_BACKEND_URL;
const token = process.env.TASKAGENT_OPERATOR_PAT;
const workspaceId = process.env.TASKAGENT_NETWORK_WORKSPACE_ID;
const runtimeName = process.env[manifest.runtimeNameEnv];
const statePath = process.env.N9_NETWORK_PROVISIONING_STATE;
const marker = `managed_by=n9-network-provisioner manifest_version=${manifest.manifestVersion}`;
const root = new URL("../", import.meta.url);

if (!base || !token || !workspaceId || !runtimeName) throw new Error("provisioning environment is incomplete");
if (apply && !statePath) throw new Error("N9_NETWORK_PROVISIONING_STATE is required for --apply");

async function api(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-workspace-id": workspaceId, ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} returned ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

function planned(action, payload) {
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", action, payload }));
}

function rows(body, key) {
  if (Array.isArray(body)) return body;
  return body?.[key] ?? body?.items ?? [];
}

function assertDeploymentGate() {
  const receiptPath = process.env.N9_NETWORK_DEPLOYMENT_RECEIPT;
  if (!receiptPath) throw new Error("N9_NETWORK_DEPLOYMENT_RECEIPT is required for --apply");
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const required = ["backup_verified", "restore_verified", "config_verified", "upload_verified", "websocket_verified", "rollback_verified"];
  for (const field of required) if (receipt[field] !== true) throw new Error(`deployment gate is not verified: ${field}`);
}

function loadState() {
  if (!statePath) return { manifestVersion: manifest.manifestVersion, resources: {} };
  if (!fs.existsSync(statePath)) return { manifestVersion: manifest.manifestVersion, resources: {} };
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function skillDocument(name) {
  const path = new URL(`../skills/${name}/SKILL.md`, import.meta.url);
  return fs.readFileSync(path, "utf8");
}

function agentInstructions(name) {
  return `${fs.readFileSync(new URL(`../instructions/${name}.md`, import.meta.url), "utf8")}\n\n${marker}`;
}

async function discoverRuntime() {
  const body = await api("/api/runtimes");
  const runtimes = Array.isArray(body) ? body : body.runtimes ?? [];
  const runtime = runtimes.find((item) => item.name === runtimeName);
  if (!runtime) throw new Error(`network_ops_primary runtime not found by name: ${runtimeName}`);
  if (runtime.status && runtime.status !== "online") throw new Error(`runtime is not online: ${runtime.status}`);
  return runtime;
}

async function resolveAI(runtime) {
  const providers = (await api(`/api/workspaces/${workspaceId}/ai-providers/compatible/${encodeURIComponent(runtime.provider)}`)).ai_providers;
  const provider = providers.find((item) => item.provider_key === manifest.providerKey || item.key === manifest.providerKey);
  if (!provider) throw new Error(`provider missing: ${manifest.providerKey}`);
  const models = (await api(`/api/workspaces/${workspaceId}/ai-providers/${provider.id}/models`)).provider_models;
  const model = models.find((item) => item.model_key === manifest.modelKey);
  if (!model) throw new Error(`model missing: ${manifest.modelKey}`);
  const efforts = (await api(`/api/workspaces/${workspaceId}/ai-providers/${provider.id}/models/${model.id}/efforts`)).provider_model_efforts;
  const effort = efforts.find((item) => item.effort_key === manifest.effortKey);
  if (!effort) throw new Error(`effort missing: ${manifest.effortKey}`);
  const accounts = await api(`/api/workspaces/${workspaceId}/ai-providers/${provider.id}/accounts`);
  const account = accounts.ai_provider_accounts.find((item) => item.status === "valid") ?? null;
  if (accounts.credential_mode === "control_plane_managed" && !account) throw new Error("9route has no valid provider account");
  return { provider, model, effort, account };
}

async function createAutopilot(squadId) {
  planned("createAutopilot", manifest.autopilot.name);
  if (!apply) return { id: "dry-run-autopilot" };
  return api("/api/autopilots", { method: "POST", body: JSON.stringify({ title: manifest.autopilot.name, description: marker, assignee_type: "squad", assignee_id: squadId, execution_mode: manifest.autopilot.executionMode }) });
}
async function pauseAutopilot(id) { planned("pauseAutopilot", id); if (apply) await api(`/api/autopilots/${id}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) }); }
async function createTrigger(id) { planned("createTrigger", id); if (!apply) return { id: "dry-run-trigger" }; return api(`/api/autopilots/${id}/triggers`, { method: "POST", body: JSON.stringify(manifest.autopilot.trigger) }); }
async function disableTrigger(autopilotId, triggerId) { planned("disableTrigger", triggerId); if (apply) await api(`/api/autopilots/${autopilotId}/triggers/${triggerId}`, { method: "PATCH", body: JSON.stringify({ enabled: false }) }); }

async function main() {
  const runtime = await discoverRuntime();
  const ai = await resolveAI(runtime);
  planned("resolvedAI", { runtime: runtime.id, provider: ai.provider.id, model: ai.model.id, effort: ai.effort.effort_key });
  if (!apply) {
    for (const skill of manifest.skills) planned("createOrAdoptSkill", skill);
    for (const agent of manifest.agents) planned("createAgent", agent.name);
    planned("createSquad", manifest.squad.name);
    const autopilot = await createAutopilot("dry-run-squad"); await pauseAutopilot(autopilot.id); const trigger = await createTrigger(autopilot.id); await disableTrigger(autopilot.id, trigger.id);
    return;
  }
  assertDeploymentGate();
  const state = loadState();

  const existingSkills = rows(await api("/api/skills"), "skills");
  const skillIds = {};
  for (const name of manifest.skills) {
    let skill = existingSkills.find((item) => item.name === name);
    if (skill && !String(skill.description ?? "").includes("managed_by=n9-network-provisioner")) throw new Error(`unmanaged skill name collision: ${name}`);
    if (!skill) {
      planned("createSkill", name);
      skill = await api("/api/skills", { method: "POST", body: JSON.stringify({ name, description: `${marker}; governed N9 network operations skill`, content: skillDocument(name) }) });
    }
    skillIds[name] = skill.id;
  }

  const mcpServers = rows(await api(`/api/workspaces/${workspaceId}/mcp-servers`), "mcp_servers");
  let mcp = mcpServers.find((item) => item.name === "n9-network-observer");
  if (!mcp) {
    const observerUrl = process.env.N9_NETWORK_OBSERVER_PUBLIC_URL;
    const observerToken = process.env.N9_NETWORK_OBSERVER_TOKEN;
    if (!observerUrl || !observerToken) throw new Error("observer URL/token are required for MCP provisioning");
    mcp = await api(`/api/workspaces/${workspaceId}/mcp-servers`, { method: "POST", body: JSON.stringify({ name: "n9-network-observer", config: { type: "streamable-http", url: observerUrl, headers: { Authorization: `Bearer ${observerToken}` } } }) });
  }

  const existingAgents = rows(await api("/api/agents"), "agents");
  const agents = {};
  for (const definition of manifest.agents) {
    let agent = existingAgents.find((item) => item.name === definition.name);
    if (agent && !String(agent.instructions ?? "").includes("managed_by=n9-network-provisioner")) throw new Error(`unmanaged agent name collision: ${definition.name}`);
    if (!agent) {
      agent = await api("/api/agents", { method: "POST", body: JSON.stringify({ name: definition.name, description: definition.description, instructions: agentInstructions(definition.name), runtime_id: runtime.id, permission_mode: "private", skill_ids: definition.skills.map((name) => skillIds[name]) }) });
    }
    await api(`/api/agents/${agent.id}/ai-configuration`, { method: "PUT", body: JSON.stringify({ ai_provider_id: ai.provider.id, provider_model_id: ai.model.id, provider_account_id: ai.account?.id ?? null, effort_key: ai.effort.effort_key }) });
    const bindings = rows(await api(`/api/agents/${agent.id}/mcp-servers`), "mcp_servers");
    if (!bindings.some((item) => item.id === mcp.id)) await api(`/api/agents/${agent.id}/mcp-servers`, { method: "POST", body: JSON.stringify({ server_id: mcp.id }) });
    agents[definition.name] = agent;
  }

  const existingSquads = rows(await api("/api/squads"), "squads");
  let squad = existingSquads.find((item) => item.name === manifest.squad.name);
  if (squad && !String(squad.description ?? "").includes("managed_by=n9-network-provisioner")) throw new Error(`unmanaged squad name collision: ${manifest.squad.name}`);
  if (!squad) squad = await api("/api/squads", { method: "POST", body: JSON.stringify({ name: manifest.squad.name, description: `${manifest.squad.description} ${marker}`, leader_id: agents[manifest.squad.leader].id }) });
  const members = rows(await api(`/api/squads/${squad.id}/members`), "members");
  for (const definition of manifest.agents) {
    const agent = agents[definition.name];
    if (!members.some((item) => item.member_type === "agent" && item.member_id === agent.id)) await api(`/api/squads/${squad.id}/members`, { method: "POST", body: JSON.stringify({ member_type: "agent", member_id: agent.id, role: definition.name === manifest.squad.leader ? "leader" : "specialist" }) });
  }

  const existingAutopilots = rows(await api("/api/autopilots"), "autopilots");
  let autopilot = existingAutopilots.find((item) => item.title === manifest.autopilot.name);
  if (autopilot && !String(autopilot.description ?? "").includes("managed_by=n9-network-provisioner")) throw new Error(`unmanaged autopilot name collision: ${manifest.autopilot.name}`);
  if (!autopilot) {
    autopilot = await createAutopilot(squad.id);
    await pauseAutopilot(autopilot.id);
  } else if (autopilot.status !== "paused") {
    await pauseAutopilot(autopilot.id);
  }
  const detail = await api(`/api/autopilots/${autopilot.id}`);
  let trigger = rows(detail.triggers ?? [], "triggers").find((item) => item.label === manifest.autopilot.trigger.label);
  if (!trigger) trigger = await createTrigger(autopilot.id);
  if (trigger.enabled !== false) await disableTrigger(autopilot.id, trigger.id);

  state.resources = { skills: skillIds, mcpServerId: mcp.id, agents: Object.fromEntries(Object.entries(agents).map(([name, item]) => [name, item.id])), squadId: squad.id, autopilotId: autopilot.id, triggerId: trigger.id };
  saveState(state);
  console.log(JSON.stringify({ status: "provisioned_paused", statePath, resources: state.resources }));
}

await main();

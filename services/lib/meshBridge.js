/**
 * services/lib/meshBridge.js
 * ---------------------------------------------------------------------------
 * Minimal HERMES -> local MESH execution adapter.
 *
 * The ONLY responsibilities are:
 *   1. Validate that a task is a structured ToolRequest (tool + arguments).
 *   2. Construct the request.
 *   3. Call the local MESH endpoint (POST /api/hermes/execute) with a strict
 *      timeout.
 *   4. Parse the ToolResult.
 *   5. Return success/failure to HERMES.
 *
 * It NEVER executes a tool itself. It contains NO filesystem logic, NO shell
 * execution, NO capability/risk policy, NO secret filtering, NO duplicated
 * audit, and NO model routing. Those belong to MESH (one authority).
 *
 * Raw command fields (command / shell / exec / script / process / cmd /
 * environment) are rejected here and again by MESH.
 * ---------------------------------------------------------------------------
 */

const MESH_BRIDGE_URL = (process.env.MESH_BRIDGE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const MESH_BRIDGE_API_KEY = process.env.MESH_BRIDGE_API_KEY || '';
const MESH_TIMEOUT_MS = Number(process.env.MESH_TIMEOUT_MS || 15000);

/** True when a task is a structured tool task (tool present, or action === 'tool'). */
export function isStructuredToolTask(task) {
  return Boolean(task && (task.tool || task.action === 'tool'));
}

/** Validate a structured ToolRequest. Rejects raw command fields. */
export function validateToolRequest(task) {
  if (!task || typeof task !== 'object') return { ok: false, error: 'task required' };
  const tool = task.tool;
  if (!tool || typeof tool !== 'string') return { ok: false, error: 'tool required' };
  const args = task.arguments || {};
  if (typeof args !== 'object' || Array.isArray(args)) return { ok: false, error: 'arguments must be an object' };
  for (const bad of ['command', 'shell', 'exec', 'script', 'process', 'cmd', 'environment']) {
    if (bad in task || bad in args) return { ok: false, error: `raw command field present: ${bad}` };
  }
  return { ok: true, tool };
}

/**
 * Run a structured tool task through the local MESH endpoint.
 * Bounded timeout; never hangs the worker. Never executes the tool itself.
 * @param {object} task { taskId, tool, arguments }
 * @returns {Promise<object>} { ok, decision, success, reason, evidence }
 */
export async function runStructuredToolTask(task) {
  const v = validateToolRequest(task);
  if (!v.ok) {
    return {
      ok: false,
      decision: 'deny',
      success: false,
      reason: v.error,
      evidence: { verification: 'failed', reason: v.error },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MESH_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (MESH_BRIDGE_API_KEY) headers['x-api-key'] = MESH_BRIDGE_API_KEY;
    const res = await fetch(`${MESH_BRIDGE_URL}/api/hermes/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        taskId: task.taskId || task.id || null,
        tool: task.tool,
        arguments: task.arguments || {},
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, decision: 'transport_error', success: false, reason: `MESH bridge HTTP ${res.status}`, evidence: { verification: 'failed' } };
    }
    const data = await res.json();
    return {
      ok: data.ok,
      decision: data.decision,
      success: data.success,
      reason: data.reason || null,
      evidence: data.evidence || null,
    };
  } catch (err) {
    return {
      ok: false,
      decision: 'transport_error',
      success: false,
      reason: String((err && err.message) || err),
      evidence: { verification: 'failed' },
    };
  } finally {
    clearTimeout(timer);
  }
}

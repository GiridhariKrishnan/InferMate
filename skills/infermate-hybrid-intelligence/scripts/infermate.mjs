#!/usr/bin/env node
/**
 * InferMate Agent Skill CLI helper
 * Usage:
 *   node scripts/infermate.mjs <tool_name> '<json_arguments>'
 *   node scripts/infermate.mjs --list
 *
 * Env:
 *   INFERMATE_BASE_URL      (default: http://localhost:3000)
 *   INFERMATE_AGENT_API_KEY (optional Bearer token)
 */

const baseUrl = (process.env.INFERMATE_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const apiKey = process.env.INFERMATE_AGENT_API_KEY || '';

const headers = { 'Content-Type': 'application/json' };
if (apiKey) {
  headers.Authorization = `Bearer ${apiKey}`;
}

async function main() {
  const [toolName, rawArgs] = process.argv.slice(2);

  if (!toolName || toolName === '--help' || toolName === '-h') {
    console.error('Usage: node scripts/infermate.mjs <tool_name|--list> [json_arguments]');
    process.exit(1);
  }

  let body;
  if (toolName === '--list') {
    body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
  } else {
    let args = {};
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch (err) {
        console.error('Invalid JSON arguments:', err.message);
        process.exit(1);
      }
    }
    body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    };
  }

  const res = await fetch(`${baseUrl}/api/agent/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed.error) {
      console.error(JSON.stringify(parsed.error, null, 2));
      process.exit(1);
    }
    const output = parsed.result?.structuredContent ?? parsed.result ?? parsed;
    console.log(JSON.stringify(output, null, 2));
  } catch {
    console.log(text);
  }
}

main().catch((err) => {
  console.error('InferMate CLI error:', err.message);
  process.exit(1);
});

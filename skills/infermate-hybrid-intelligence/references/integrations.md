# Integrating InferMate with Claude, DeepSeek & Other Agents

## 1. Claude Code (Native Agent Skills)

Install the skill folder so the parent folder name strictly matches `name: infermate-hybrid-intelligence` in `SKILL.md`:

```bash
BASE_URL="${INFERMATE_BASE_URL:-http://localhost:3000}"
SKILL_DIR=".claude/skills/infermate-hybrid-intelligence"
mkdir -p "$SKILL_DIR/references" "$SKILL_DIR/scripts"

curl -fsSL "$BASE_URL/SKILL.md" -o "$SKILL_DIR/SKILL.md"
curl -fsSL "$BASE_URL/skills/infermate-hybrid-intelligence/references/api-reference.md" -o "$SKILL_DIR/references/api-reference.md"
curl -fsSL "$BASE_URL/skills/infermate-hybrid-intelligence/references/integrations.md" -o "$SKILL_DIR/references/integrations.md"
curl -fsSL "$BASE_URL/skills/infermate-hybrid-intelligence/scripts/infermate.mjs" -o "$SKILL_DIR/scripts/infermate.mjs"

export INFERMATE_BASE_URL="$BASE_URL"
```

## 2. Claude Desktop (MCP)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "infermate": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/api/agent/mcp"]
    }
  }
}
```

If `INFERMATE_AGENT_API_KEY` is enabled on the server, pass `--header "Authorization:Bearer YOUR_KEY"` in `args`.

## 3. Anthropic Claude API (Python)

```python
import anthropic, requests

INFERMATE_URL = "http://localhost:3000"
manifest = requests.get(f"{INFERMATE_URL}/api/agent/manifest", timeout=15).json()

client = anthropic.Anthropic()
msg = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=manifest["formats"]["claude"],
    messages=[{"role": "user", "content": "Translate 'Good morning' to Hindi and transliterate it."}]
)

for block in msg.content:
    if block.type == "tool_use":
        res = requests.post(
            f"{INFERMATE_URL}/api/agent/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": block.name, "arguments": block.input}
            },
            timeout=60
        ).json()
        print(res["result"]["structuredContent"])
```

## 4. DeepSeek (`deepseek-chat` / `deepseek-reasoner`)

DeepSeek exposes an OpenAI-compatible Function Calling endpoint at `https://api.deepseek.com`:

```python
import json, requests
from openai import OpenAI

INFERMATE_URL = "http://localhost:3000"
manifest = requests.get(f"{INFERMATE_URL}/api/agent/manifest", timeout=15).json()
tools = manifest["formats"]["openai_deepseek"]

client = OpenAI(api_key="YOUR_DEEPSEEK_API_KEY", base_url="https://api.deepseek.com")

messages = [
    {"role": "system", "content": "Use InferMate tools for translation, OCR, RAG, and document analysis."},
    {"role": "user", "content": "Translate 'Artificial intelligence bridges languages' to Japanese with grammar notes."}
]

resp = client.chat.completions.create(model="deepseek-chat", messages=messages, tools=tools)
assistant_msg = resp.choices[0].message
messages.append(assistant_msg)

if assistant_msg.tool_calls:
    for call in assistant_msg.tool_calls:
        args = json.loads(call.function.arguments)
        mcp_res = requests.post(
            f"{INFERMATE_URL}/api/agent/mcp",
            json={
                "jsonrpc": "2.0",
                "id": call.id,
                "method": "tools/call",
                "params": {"name": call.function.name, "arguments": args}
            },
            timeout=60
        ).json()
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": json.dumps(mcp_res["result"]["structuredContent"])
        })

    final = client.chat.completions.create(model="deepseek-chat", messages=messages)
    print(final.choices[0].message.content)
```

## 5. Cursor / Cline / Roo Code / OpenAI Codex

- **MCP**: Register `<INFERMATE_BASE_URL>/api/agent/mcp` as a Streamable HTTP MCP server.
- **Skills Folder**: Copy `skills/infermate-hybrid-intelligence/` into `.cursor/skills/infermate-hybrid-intelligence/` or `.codex/skills/infermate-hybrid-intelligence/`.

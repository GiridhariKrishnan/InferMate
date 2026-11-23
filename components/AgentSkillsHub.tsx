import React, { useEffect, useMemo, useState } from 'react';
import { AGENT_TOOLS, buildAgentManifest } from '../services/agentTools';

type HubSection = 'connect' | 'playground' | 'spec';
type PlatformTab = 'claude-code' | 'claude-api' | 'deepseek' | 'openai-curl';
type ProtocolMode = 'rest' | 'mcp';

const AgentSkillsHub: React.FC = () => {
  const [section, setSection] = useState<HubSection>('connect');
  const [platform, setPlatform] = useState<PlatformTab>('claude-code');
  const [skillsMarkdown, setSkillsMarkdown] = useState<string>('');
  const [loadingSpec, setLoadingSpec] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Playground state
  const [selectedToolName, setSelectedToolName] = useState<string>(AGENT_TOOLS[0].name);
  const [protocol, setProtocol] = useState<ProtocolMode>('rest');
  const [payloadText, setPayloadText] = useState<string>(
    JSON.stringify(AGENT_TOOLS[0].sampleInput, null, 2)
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runOutput, setRunOutput] = useState<{
    status: number;
    durationMs: number;
    body: string;
    isError: boolean;
  } | null>(null);

  const baseUrl = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  }, []);

  const selectedTool = useMemo(
    () => AGENT_TOOLS.find((t) => t.name === selectedToolName) || AGENT_TOOLS[0],
    [selectedToolName]
  );

  useEffect(() => {
    let active = true;
    const fetchSpec = async () => {
      setLoadingSpec(true);
      try {
        const res = await fetch('/Skills.md');
        if (res.ok) {
          const text = await res.text();
          if (active) setSkillsMarkdown(text);
        }
      } catch (err) {
        console.error('Failed to load Skills.md:', err);
      } finally {
        if (active) setLoadingSpec(false);
      }
    };
    fetchSpec();
    return () => {
      active = false;
    };
  }, []);

  const handleSelectTool = (toolName: string) => {
    setSelectedToolName(toolName);
    const tool = AGENT_TOOLS.find((t) => t.name === toolName);
    if (tool) {
      setPayloadText(JSON.stringify(tool.sampleInput, null, 2));
      setRunOutput(null);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const downloadFile = (filename: string, content: string, mimeType = 'text/markdown') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadManifest = () => {
    const manifest = buildAgentManifest(baseUrl);
    downloadFile(
      'infermate-agent-manifest.json',
      JSON.stringify(manifest, null, 2),
      'application/json'
    );
  };

  const handleRunTool = async () => {
    setIsRunning(true);
    setRunOutput(null);
    const started = performance.now();

    try {
      let parsedArgs: Record<string, unknown> = {};
      if (payloadText.trim()) {
        parsedArgs = JSON.parse(payloadText);
      }

      let res: Response;
      if (protocol === 'mcp') {
        res = await fetch('/api/agent/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: selectedTool.name,
              arguments: parsedArgs
            }
          })
        });
      } else if (selectedTool.httpMethod === 'GET') {
        res = await fetch(selectedTool.endpoint);
      } else {
        res = await fetch(selectedTool.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedArgs)
        });
      }

      const rawText = await res.text();
      let formatted = rawText;
      try {
        formatted = JSON.stringify(JSON.parse(rawText), null, 2);
      } catch {
        // Keep raw text
      }

      setRunOutput({
        status: res.status,
        durationMs: Math.round(performance.now() - started),
        body: formatted,
        isError: !res.ok
      });
    } catch (err) {
      setRunOutput({
        status: 0,
        durationMs: Math.round(performance.now() - started),
        body: err instanceof Error ? err.message : 'Request failed.',
        isError: true
      });
    } finally {
      setIsRunning(false);
    }
  };

  const snippets = useMemo(() => {
    const claudeCodeInstall = `# 1. Install InferMate as a Claude Code Skill
mkdir -p .claude/skills/infermate
curl -s "${baseUrl}/Skills.md" -o .claude/skills/infermate/SKILL.md

# 2. Export your InferMate endpoint (and optional bearer key if set)
export INFERMATE_BASE_URL="${baseUrl}"
# export INFERMATE_AGENT_API_KEY="your-optional-key"

# 3. Ask Claude Code:
# "Use the infermate skill to translate this text to Japanese and index it into Truth Guard RAG."`;

    const claudeDesktopMcp = `{
  "mcpServers": {
    "infermate": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${baseUrl}/api/agent/mcp"
      ]
    }
  }
}`;

    const claudeApiPython = `import anthropic, requests

INFERMATE_URL = "${baseUrl}"
manifest = requests.get(f"{INFERMATE_URL}/api/agent/manifest").json()

client = anthropic.Anthropic()
msg = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    tools=manifest["formats"]["claude"],
    messages=[{"role": "user", "content": "Translate 'Good morning' to Hindi and transliterate it to Latin script."}]
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
            }
        ).json()
        print(res["result"]["structuredContent"])`;

    const deepseekPython = `import json, requests
from openai import OpenAI

INFERMATE_URL = "${baseUrl}"
manifest = requests.get(f"{INFERMATE_URL}/api/agent/manifest").json()
tools = manifest["formats"]["openai_deepseek"]

# DeepSeek uses the OpenAI-compatible SDK
client = OpenAI(api_key="YOUR_DEEPSEEK_API_KEY", base_url="https://api.deepseek.com")

messages = [
    {"role": "system", "content": "Use InferMate tools for translation, OCR, RAG, and document analysis."},
    {"role": "user", "content": "Translate 'Artificial intelligence bridges languages' into Japanese and explain the grammar."}
]

resp = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages,
    tools=tools
)

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
            }
        ).json()
        messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": json.dumps(mcp_res["result"]["structuredContent"])
        })

    final = client.chat.completions.create(model="deepseek-chat", messages=messages)
    print(final.choices[0].message.content)`;

    const curlQuickstart = `# 1. Fetch Skills.md specification
curl -s "${baseUrl}/Skills.md"

# 2. Fetch machine-readable tool schemas (Claude, DeepSeek/OpenAI, MCP)
curl -s "${baseUrl}/api/agent/manifest"

# 3. Call Neural Translator directly
curl -s -X POST "${baseUrl}/api/agent/translate" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello from my AI agent","sourceLang":"en","targetLang":"es","mode":"TRANSLATE"}'

# 4. Call via MCP JSON-RPC 2.0
curl -s -X POST "${baseUrl}/api/agent/mcp" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;

    return {
      claudeCodeInstall,
      claudeDesktopMcp,
      claudeApiPython,
      deepseekPython,
      curlQuickstart
    };
  }, [baseUrl]);

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1">
              Agent-Ready Platform • Skills.md + REST + MCP
            </div>
            <h2 className="text-2xl font-bold mb-1">InferMate Agent &amp; Skills Hub</h2>
            <p className="text-slate-300 text-sm max-w-2xl">
              Connect InferMate as a live tool skill inside Claude Code, Claude Desktop, DeepSeek,
              Cursor, Cline, or OpenAI-compatible agents.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => downloadFile('Skills.md', skillsMarkdown || '# InferMate Skills')}
              disabled={!skillsMarkdown}
              className="bg-white text-slate-900 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <i className="fas fa-download"></i> Download Skills.md
            </button>
            <button
              onClick={() => downloadFile('SKILL.md', skillsMarkdown || '# InferMate Skills')}
              disabled={!skillsMarkdown}
              className="bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-500 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <i className="fas fa-robot"></i> Claude SKILL.md
            </button>
            <button
              onClick={handleDownloadManifest}
              className="bg-white/10 text-white border border-white/20 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-white/20 transition-colors flex items-center gap-2"
            >
              <i className="fas fa-code"></i> Tools JSON
            </button>
          </div>
        </div>

        {/* Discovery URLs */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {[
            { key: 'skill-url', label: 'Skills.md URL', url: `${baseUrl}/Skills.md` },
            { key: 'manifest-url', label: 'Tool Manifest', url: `${baseUrl}/api/agent/manifest` },
            { key: 'mcp-url', label: 'MCP JSON-RPC', url: `${baseUrl}/api/agent/mcp` }
          ].map((item) => (
            <div
              key={item.key}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-indigo-300 font-bold">
                  {item.label}
                </div>
                <div className="font-mono text-slate-200 truncate">{item.url}</div>
              </div>
              <button
                onClick={() => copyText(item.key, item.url)}
                className="text-indigo-200 hover:text-white px-2 py-1 rounded-lg bg-white/10 flex-shrink-0"
                title="Copy URL"
              >
                <i className={`fas ${copiedKey === item.key ? 'fa-check text-emerald-400' : 'fa-copy'}`}></i>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        {[
          { id: 'connect' as HubSection, label: 'Connect Claude & DeepSeek', icon: 'fa-plug' },
          { id: 'playground' as HubSection, label: 'Live Agent Playground', icon: 'fa-terminal' },
          { id: 'spec' as HubSection, label: 'Skills.md & Tool Catalog', icon: 'fa-file-code' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              section === tab.id
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
            }`}
          >
            <i className={`fas ${tab.icon}`}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: CONNECT AGENTS */}
      {section === 'connect' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'claude-code' as PlatformTab, label: 'Claude Code (Skills)' },
              { id: 'claude-api' as PlatformTab, label: 'Claude Desktop & API' },
              { id: 'deepseek' as PlatformTab, label: 'DeepSeek (API / Cline)' },
              { id: 'openai-curl' as PlatformTab, label: 'OpenAI / cURL / Custom' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  platform === p.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {platform === 'claude-code' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-900">Claude Code Agent Skill Setup</h3>
                  <p className="text-xs text-gray-500">
                    Place <code className="font-mono bg-gray-100 px-1 rounded">SKILL.md</code> in{' '}
                    <code className="font-mono bg-gray-100 px-1 rounded">.claude/skills/infermate/</code>{' '}
                    so Claude Code automatically discovers and invokes InferMate tools.
                  </p>
                </div>
                <button
                  onClick={() => copyText('claude-code', snippets.claudeCodeInstall)}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100"
                >
                  <i className={`fas ${copiedKey === 'claude-code' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                  {copiedKey === 'claude-code' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                {snippets.claudeCodeInstall}
              </pre>
            </div>
          )}

          {platform === 'claude-api' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-gray-900">Claude Desktop (MCP Server)</h3>
                    <p className="text-xs text-gray-500">
                      Add to <code className="font-mono bg-gray-100 px-1 rounded">claude_desktop_config.json</code>.
                    </p>
                  </div>
                  <button
                    onClick={() => copyText('claude-mcp', snippets.claudeDesktopMcp)}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100"
                  >
                    <i className={`fas ${copiedKey === 'claude-mcp' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                    {copiedKey === 'claude-mcp' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                  {snippets.claudeDesktopMcp}
                </pre>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-gray-900">Anthropic Claude API (Python)</h3>
                    <p className="text-xs text-gray-500">
                      Loads <code className="font-mono bg-gray-100 px-1 rounded">formats.claude</code> directly from the live manifest.
                    </p>
                  </div>
                  <button
                    onClick={() => copyText('claude-api', snippets.claudeApiPython)}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100"
                  >
                    <i className={`fas ${copiedKey === 'claude-api' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                    {copiedKey === 'claude-api' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed max-h-72">
                  {snippets.claudeApiPython}
                </pre>
              </div>
            </div>
          )}

          {platform === 'deepseek' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-900">DeepSeek Function Calling (`deepseek-chat`)</h3>
                  <p className="text-xs text-gray-500">
                    Uses DeepSeek&apos;s OpenAI-compatible tool calling API with{' '}
                    <code className="font-mono bg-gray-100 px-1 rounded">formats.openai_deepseek</code>.
                    In Cline / Roo Code / Cursor, you can also register{' '}
                    <code className="font-mono bg-gray-100 px-1 rounded">{baseUrl}/api/agent/mcp</code> as a Streamable HTTP MCP server or attach <code className="font-mono bg-gray-100 px-1 rounded">Skills.md</code> as project rules.
                  </p>
                </div>
                <button
                  onClick={() => copyText('deepseek', snippets.deepseekPython)}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 flex-shrink-0"
                >
                  <i className={`fas ${copiedKey === 'deepseek' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                  {copiedKey === 'deepseek' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed max-h-80">
                {snippets.deepseekPython}
              </pre>
            </div>
          )}

          {platform === 'openai-curl' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-gray-900">Direct REST &amp; MCP cURL Reference</h3>
                  <p className="text-xs text-gray-500">
                    Works with OpenAI Agents SDK, LangChain, CrewAI, n8n, or any HTTP-capable agent.
                  </p>
                </div>
                <button
                  onClick={() => copyText('curl', snippets.curlQuickstart)}
                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100"
                >
                  <i className={`fas ${copiedKey === 'curl' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                  {copiedKey === 'curl' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                {snippets.curlQuickstart}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: LIVE AGENT PLAYGROUND */}
      {section === 'playground' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Select Agent Tool ({AGENT_TOOLS.length})
            </h3>
            {AGENT_TOOLS.map((tool) => (
              <button
                key={tool.name}
                onClick={() => handleSelectTool(tool.name)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedTool.name === tool.name
                    ? 'bg-indigo-50 border-indigo-400 shadow-sm'
                    : 'bg-white border-gray-200 hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-indigo-700">{tool.name}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {tool.httpMethod}
                  </span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2">{tool.description}</p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900">{selectedTool.title}</h3>
                <div className="text-xs font-mono text-gray-500">
                  {protocol === 'mcp'
                    ? `POST /api/agent/mcp → tools/call (${selectedTool.name})`
                    : `${selectedTool.httpMethod} ${selectedTool.endpoint}`}
                </div>
              </div>

              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setProtocol('rest')}
                  className={`px-3 py-1 rounded-md text-xs font-bold ${
                    protocol === 'rest' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  REST API
                </button>
                <button
                  onClick={() => setProtocol('mcp')}
                  className={`px-3 py-1 rounded-md text-xs font-bold ${
                    protocol === 'mcp' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600'
                  }`}
                >
                  MCP JSON-RPC
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                Tool Arguments (JSON)
              </label>
              <textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                rows={7}
                disabled={selectedTool.httpMethod === 'GET' && protocol === 'rest'}
                className="w-full font-mono text-xs p-3 rounded-xl border border-gray-300 bg-slate-50 text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setPayloadText(JSON.stringify(selectedTool.sampleInput, null, 2))}
                className="text-xs font-semibold text-gray-500 hover:text-indigo-600"
              >
                Reset Sample Payload
              </button>
              <button
                onClick={handleRunTool}
                disabled={isRunning}
                className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isRunning ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Running...
                  </>
                ) : (
                  <>
                    <i className="fas fa-play"></i> Execute Tool
                  </>
                )}
              </button>
            </div>

            {runOutput && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-bold ${
                      runOutput.isError ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    Status {runOutput.status || 'Error'} • {runOutput.durationMs}ms
                  </span>
                  <button
                    onClick={() => copyText('run-out', runOutput.body)}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold"
                  >
                    <i className={`fas ${copiedKey === 'run-out' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                    Copy Response
                  </button>
                </div>
                <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-72 leading-relaxed">
                  {runOutput.body}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: SKILLS.MD SPEC & CATALOG */}
      {section === 'spec' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {AGENT_TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-indigo-700">{tool.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                    {tool.httpMethod}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-gray-400 mb-2">{tool.endpoint}</div>
                <p className="text-xs text-gray-600">{tool.description}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <i className="fas fa-file-alt text-indigo-600"></i> /Skills.md
              </h3>
              <button
                onClick={() => copyText('full-spec', skillsMarkdown)}
                disabled={!skillsMarkdown}
                className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 disabled:opacity-50"
              >
                <i className={`fas ${copiedKey === 'full-spec' ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                {copiedKey === 'full-spec' ? 'Copied Markdown' : 'Copy Full Skills.md'}
              </button>
            </div>
            <pre className="bg-slate-950 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap leading-relaxed">
              {loadingSpec ? 'Loading Skills.md...' : skillsMarkdown || 'Unable to load Skills.md'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentSkillsHub;

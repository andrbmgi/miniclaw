# Token Usage & Context Optimization Analysis

**Note**: Avoid using CLI - it is bugged and only one command will go through.
Always keep this file up to date. Come back to it after each run.

## ✅ Implemented Optimizations (Phase 1)

### 1. **Default Context Window Reduced** 
- **File**: `src/agents/defaults.ts`
- **Change**: DEFAULT_CONTEXT_TOKENS: 200,000 → 8,192
- **Impact**: System now defaults to 8k context suitable for local models
- **Savings**: Prevents OOM errors, enables local model usage

### 2. **Ultra-Minimal "micro" Prompt Mode**
- **File**: `src/agents/system-prompt.ts`
- **Feature**: New `promptMode: "micro"` option
- **Content**: Only essential tools (read, write, edit, exec, ls, grep, memory_search/get)
- **Estimated size**: 500-2,000 tokens (vs 10k-15k for "full" mode)
- **Usage**: Set `promptMode: "micro"` in config or agent invocation

### 3. **Memory Summary Injection**
- **File**: `src/agents/pi-embedded-helpers/bootstrap.ts`
- **Feature**: `extractMemorySummary()` function
- **Behavior**: 
  - Injects only first ~500 chars of MEMORY.md (or content before `---` separator)
  - Full memory remains searchable via memory_search tool
  - Appends note: "[Full memory searchable via memory_search tool]"
- **Savings**: 1,500-9,500 tokens (inject 200-500 instead of 2k-10k)

### How to Use

**Option 1: Micro mode (ultra-minimal, ~500-2k tokens)**
```json
{
  "agents": {
    "main": {
      "model": "llama3.1:8b",
      "contextTokens": 8192,
      "promptMode": "micro"
    }
  }
}
```

**Option 2: Minimal mode (for subagents, ~3k tokens)**
```json
{
  "agents": {
    "main": {
      "promptMode": "minimal"
    }
  }
}
```

**Option 3: Full mode (original, 10k-15k tokens)**
- Default for main sessions (but now with memory summary instead of full injection)
- Use when you need all features

### MEMORY.md Structure Recommendation

For best results, structure your MEMORY.md with summary at top:

```markdown
# Quick Reference
- Active projects: Project X (blocked), Project Y (done)
- Preferences: TypeScript, tabs, Ollama
- Recent decisions: Disabled skills, using micro mode

---

# Detailed Memory
[Full history, searchable via memory_search tool...]
```

---

## Critical Problem: Massive Token Consumption

This codebase was designed for **Claude Opus 4.5** with **200,000 token context windows** (DEFAULT_CONTEXT_TOKENS). For smaller local models (4k-32k tokens), this is completely unusable without major debloating.

---

## Token Usage Breakdown by Component

### 1. **System Prompt Generation** (`src/agents/system-prompt.ts`)
**Estimated: 5,000-15,000 tokens per invocation**

The `buildAgentSystemPrompt()` function builds massive prompts with:
- Safety instructions
- Tooling documentation (20+ tools with descriptions)
- OpenClaw CLI reference
- Skills section (see below)
- Memory recall instructions
- User identity & timezone
- Reply tags documentation
- Messaging channel instructions
- Voice/TTS hints
- Documentation paths
- Workspace notes
- Sandbox information
- Model aliases
- Runtime info
- Heartbeat instructions
- Reaction guidance

**Modes**: 
- `full`: Everything (default, 10k+ tokens)
- `minimal`: Reduced for subagents (~3k tokens)
- `none`: Basic identity only (~50 tokens)

**Optimization Target**: Use `minimal` or `none` mode by default, or create a new `tiny` mode with only essential tool descriptions.

---

### 2. **Skills System** (`skills/` directory + injection)
**Estimated: 750-3,100 tokens for 10-50 skills (YAML format)**

**How it actually works**:
- Only compact YAML list injected (name, description, location per skill)
- Full SKILL.md files (500-5000 tokens each) are NOT pre-loaded
- Agent reads SKILL.md on-demand using `read` tool (lazy-loading already implemented)
- ~62 tokens per skill in YAML format
- Skills filtered by OS, binaries, config before injection

**Optimization Target**: 
- Reduce number of eligible skills (allowlist)
- Or disable skills completely for minimal mode

---

### 3. **Context Files** (`params.contextFiles`)
**Estimated: Variable, often 5,000-20,000 tokens**

Files injected into "Project Context" section:
- SOUL.md (persona/tone guidance) - **KEEP: Essential for consistent persona**
- TOOLS.md (tool usage instructions) - **KEEP but consider trimming**
- MEMORY.md (conversation memory) - **INJECT SUMMARY ONLY (200-500 tokens), rest searchable**
- IDENTITY.md, USER.md, AGENTS.md, HEARTBEAT.md, BOOTSTRAP.md
- Custom workspace files

All file contents are loaded and embedded in full (up to 20,000 chars per file by default).

**How Memory Search Works**:
- Agent gets instruction: "Before answering about **prior work, decisions, dates, people, preferences, or todos**: run memory_search"
- Agent **decides** when query needs historical context (not automatic)
- `memory_search(query)` → semantic search returns top 6 snippets with paths + line numbers (~500-1500 tokens)
- `memory_get(path, from, lines)` → fetch specific lines on-demand
- Uses embeddings (OpenAI/Gemini/local) + hybrid vector+text search

**Problem**: MEMORY.md injected in full (2k-10k tokens) when only summary needed upfront

**Optimization Target**: 
- ✅ KEEP SOUL.md injected (essential persona, small)
- ✅ KEEP memory_search and memory_get tools (critical for context)
- ✅ KEEP memory instruction in system prompt
- ⚠️ INJECT ONLY MEMORY SUMMARY (first 200-500 tokens: active projects, key preferences, recent decisions)
- 📝 Full memory details searchable on-demand via memory_search tool
- Consider reducing TOOLS.md or making it minimal
- **Savings**: 1,500-9,500 tokens (inject 200-500 instead of 2k-10k)

---

### 4. **Memory System** (Critical - Keep Tools, Optimize Injection)
**Estimated: 200-500 tokens (summary only) + on-demand lookups**

**Current Implementation** (`src/agents/memory-search.ts`, `src/agents/tools/memory-tool.ts`):

**Agent instruction** (from system-prompt.ts line 53):
> "Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search"

**How agent decides to search**:
- Agent analyzes user query
- If query references past context → calls `memory_search(query="...")`
- Reviews top 6 snippets (~500-1500 tokens returned)
- If needs more detail → calls `memory_get(path="...", from=X, lines=Y)`
- **NOT automatic** - agent must recognize when history is relevant

**Tier system** (already optimal):
1. **Tier 1**: Semantic index (not in prompt, ~0 tokens)
2. **Tier 2**: Memory summary injected (active projects, key prefs, recent decisions - 200-500 tokens)
3. **Tier 3**: Search results from `memory_search` (~500-1500 tokens when called)
4. **Tier 4**: Specific details from `memory_get` (only exact lines needed)

**Problem**: Currently injects FULL MEMORY.md (2k-10k tokens) when summary + tools would suffice

**Optimization Target**:
- ✅ KEEP memory_search and memory_get tools (essential!)
- ✅ KEEP memory instruction in system prompt (tells agent when to search)
- ⚠️ Modify bootstrap loader to inject only MEMORY.md summary section (lines 1-30 or similar)
- 📝 Structure MEMORY.md with summary at top, details below
- **Savings**: 1,500-9,500 tokens per request (200-500 summary vs 2k-10k full injection)

---

### 6. **Tool Definitions** (20+ tools)
**Estimated: 1,000-3,000 tokens**

Core tools defined in `coreToolSummaries`:
- File ops: read, write, edit, apply_patch, grep, find, ls
- Execution: exec, process
- Web: web_search, web_fetch, browser
- Messaging: message, cron
- Sessions: agents_list, sessions_list, sessions_history, sessions_send, sessions_spawn
- Meta: gateway, session_status, image, canvas, nodes

Each tool gets a description line injected into system prompt.

**Optimization Target**: 
- Reduce to 5-8 essential tools (read, write, edit, exec, grep)
- Remove all channel/messaging tools
- Remove gateway/update tools
- Remove browser/canvas/nodes tools

---

### 7. **Messaging Channel Integration**
**Estimated: 1,000-5,000 tokens**

Instructions for:
- Multiple channel support (Signal, Telegram, Discord, Slack, WhatsApp, etc.)
- Reply tags: `[[reply_to_current]]`, `[[reply_to:<id>]]`
- Cross-session messaging via `sessions_send()`
- Channel-specific capabilities (inline buttons, reactions, etc.)
- Message tool with action types

**Optimization Target**: Remove all messaging channel instructions

---

### 8. **Session & Multi-Agent System**
**Estimated: 1,000-3,000 tokens**

- Subagent spawning instructions
- Session management (list, history, send)
- Agent-to-agent communication
- Session status with model/usage tracking

**Optimization Target**: Remove all multi-agent/session features

---

### 9. **Model Metadata & Aliases**
**Estimated: 500-2,000 tokens**

- Model alias list (injected via `params.modelAliasLines`)
- Context window lookups
- Model cost calculations
- Usage tracking and reporting

**Optimization Target**: Remove model switching and cost tracking

---

### 10. **Safety Instructions, Heartbeats, Runtime Info**
**Estimated: 1,000-2,000 tokens**

- Constitutional AI safety rules
- Heartbeat polling system
- Runtime metadata (host, OS, arch, node version, channel, capabilities)
- Reasoning level toggles
- Elevated mode instructions

**Optimization Target**: Simplify to minimal safety rules, remove heartbeats and runtime metadata

---

## High-Impact Optimizations (Priority Order)

### **Phase 1: Disable Major Token Sinks** (Target: 90% reduction)

1. **Disable Skills System** 
   - Remove `params.skillsPrompt` from all agent invocations
   - Comment out skills directory entirely
   - **Savings**: 10,000-50,000 tokens

2. **Disable Context Files Auto-Injection**
   - Set `params.contextFiles = []`
   - Don't auto-load SOUL.md, TOOLS.md, MEMORY.md
   - **Savings**: 5,000-20,000 tokens

3. **Use Minimal Prompt Mode**
   - Change default from `promptMode: "full"` to `promptMode: "minimal"`
   - Or create new `"tiny"` mode
   - **Savings**: 7,000-12,000 tokens

4. **Disable Memory System**
   - Remove memory_search and memory_get from available tools
   - Remove memory instructions from system prompt
   - **Savings**: 2,000-5,000 tokens

5. **Remove Messaging Channel Support**
   - Remove message tool
   - Remove channel-specific instructions
   - **Savings**: 1,000-5,000 tokens

**Total Phase 1 Savings: ~25,000-90,000 tokens → Down to 5,000-15,000 tokens**

---

### **Phase 2: Streamline Core Functionality** (Target: 50% more reduction)

6. **Reduce Tool Set**
   - Keep only: read, write, edit, exec, ls
   - Remove: browser, canvas, nodes, cron, gateway, sessions, image
   - **Savings**: 500-1,500 tokens

7. **Remove Documentation References**
   - No docs paths in prompt
   - **Savings**: 500-1,000 tokens

8. **Simplify Safety & Runtime**
   - 2-3 line safety statement instead of full section
   - Remove heartbeat system
   - Minimal runtime info
   - **Savings**: 1,000-2,000 tokens

9. **Remove Model Switching**
   - Single model mode
   - No aliases
   - **Savings**: 500-1,000 tokens

**Total Phase 2 Savings: ~2,500-5,500 tokens → Down to 2,000-10,000 tokens**

---

### **Phase 3: Create Ultra-Minimal Mode** (Target: ~500-2,000 tokens)

10. **New `"micro"` prompt mode**:
```typescript
if (promptMode === "micro") {
  return `You are a coding assistant.

Tools:
- read: Read files
- write: Create/overwrite files  
- edit: Edit files
- exec: Run shell commands
- ls: List directory

Workspace: ${params.workspaceDir}

Be concise. No narration unless complex task.`;
}
```

---

## Key Files to Modify

1. **`src/agents/defaults.ts`**
   - Change `DEFAULT_CONTEXT_TOKENS` from 200,000 to 4,096 or 8,192
   - Change `DEFAULT_MODEL` to local model identifier

2. **`src/agents/system-prompt.ts`**
   - Add new `"micro"` prompt mode
   - Make `minimal` the default
   - Disable sections by default

3. **`src/auto-reply/reply/agent-runner.ts`**
   - Modify to not load skills
   - Modify to not load context files
   - Pass minimal prompt mode

4. **`src/config/config.ts`** & **`src/config/types.js`**
   - Disable skills by default
   - Disable memory by default
   - Disable messaging channels

5. **Remove/Disable Extensions**
   - Delete or comment out `extensions/` loading

---

## Testing Strategy

1. Create minimal config with single local model
2. Test with 4k, 8k, 16k, 32k context windows
3. Measure actual token usage per request
4. Incrementally add back features if needed

---

## Estimated Final Token Usage

- **Before**: 30,000-100,000 tokens per request
- **After Phase 1**: 5,000-15,000 tokens
- **After Phase 2**: 2,000-10,000 tokens  
- **After Phase 3 (micro mode)**: 500-2,000 tokens

**Target for 8k local models**: <2,000 tokens system prompt, leaving 6k for conversation history.

---

## Current Multi-Agent Architecture Analysis

### ✅ Good News: Your Proposed Architecture Already Exists!

The system **already implements** a sophisticated multi-agent architecture with context splitting. Here's what's built-in:

### **Current Implementation**

#### 1. **Session System** (`src/config/sessions.ts`)
- Each session has its own isolated context and conversation history
- Session keys format: `agent:agentId:scope` (e.g., `agent:main:main`, `agent:main:subagent:task1`)
- Supports main sessions, subagent sessions, cron sessions, hook sessions, group sessions

#### 2. **Subagent Spawning** (`sessions_spawn` tool)
**Location**: `src/agents/tools/sessions-spawn-tool.ts`

**How it works**:
```typescript
// Parent agent calls:
sessions_spawn({
  task: "Analyze this log file and extract errors",
  label: "LogAnalyzer", 
  agentId: "ops",  // Optional: route to different agent
  model: "llama3.1:8b",  // Optional: use different model
  thinking: "off",
  runTimeoutSeconds: 300,
  cleanup: "delete"  // or "keep" to preserve session
})
```

**Features**:
- Spawns isolated background session with separate context
- Runs asynchronously and announces result back to parent
- Can target different agent IDs (cross-agent spawning)
- Can use different models per subagent
- Subagents use `promptMode: "minimal"` (3k vs 10k tokens)
- Parent continues working while subagent runs

#### 3. **Agent-to-Agent Communication** (`sessions_send` tool)
**Location**: `src/agents/tools/sessions-send-tool.ts`

**How it works**:
```typescript
// Send message to another session:
sessions_send({
  sessionKey: "agent:main:subagent:task1",  // or use label
  label: "LogAnalyzer",  // lookup by label instead
  message: "What's the status?"
})
```

**Features**:
- Send messages between any sessions
- Can query by `sessionKey` or `label`
- Supports cross-agent messaging (configurable via `tools.agentToAgent`)
- Gating policies for security (sandbox restrictions)

#### 4. **Session Listing & History** 
**Tools**: `sessions_list`, `sessions_history`

```typescript
// List active sessions:
sessions_list({
  kinds: ["main", "subagent", "cron"],
  limit: 10,
  activeMinutes: 60,
  messageLimit: 5
})

// Get history from another session:
sessions_history({
  sessionKey: "agent:main:subagent:task1",
  limit: 20
})
```

#### 5. **Context Splitting by Prompt Mode**
**Location**: `src/agents/system-prompt.ts`

Already implemented:
- `"full"` mode (10k-15k tokens): For main agents
- `"minimal"` mode (~3k tokens): **Auto-applied to subagents**
- `"none"` mode (~50 tokens): Basic identity only

**Code**: When spawning subagent, system automatically detects it:
```typescript
// From src/agents/pi-embedded-runner/run/attempt.ts:340
const promptMode = isSubagentSessionKey(params.sessionKey) ? "minimal" : "full";
```

Minimal mode removes:
- Skills section
- Memory instructions
- Documentation
- Model aliases
- Heartbeats
- Reply tags
- Silent replies
- Most safety instructions

#### 6. **Result Announcement System**
**Location**: `src/agents/subagent-announce.ts`

When subagent completes:
1. Captures final assistant reply
2. Extracts usage stats (tokens, cost, duration)
3. Announces back to parent session with formatted summary
4. Parent can choose to respond to user directly or pass through "compiler" agent

---

### **Your Proposed Architecture vs Current Implementation**

| Your Proposal | Current Implementation | Status |
|--------------|----------------------|--------|
| Main agent receives request | ✅ Main session handles initial messages | **EXISTS** |
| Route to specialized sub-agent | ✅ `sessions_spawn(agentId="specialist")` | **EXISTS** |
| Sub-agent has isolated context | ✅ Separate session with minimal prompt | **EXISTS** |
| Result back to user OR compiler | ✅ Announce to parent, parent decides | **EXISTS** |
| Agent chains | ✅ Subagent can spawn more subagents | **EXISTS** |
| Context splitting | ✅ `minimal` mode auto-applied | **EXISTS** |

---

### **Does Your Approach Make Sense?**

**YES**, and here's why it's already validated:

#### ✅ **Pros** (already proven in this codebase):
1. **Massive token savings**: Subagents use 3k vs 10k-15k tokens (70% reduction)
2. **Parallel execution**: Spawn multiple subagents simultaneously
3. **Model flexibility**: Different models per agent (e.g., large for planning, small for execution)
4. **Isolation**: Each subagent failure doesn't crash parent
5. **Reusability**: Specialized agents (logger, debugger, coder) can be reused
6. **Cost optimization**: Use cheap models for simple tasks

#### ⚠️ **Cons** (to watch out for):

1. **Coordination overhead**: 
   - Each `sessions_spawn` call costs tokens to send task description
   - Each announcement back costs tokens
   - For small tasks, overhead > savings

2. **Latency**:
   - Sequential subagent calls add latency
   - Need async patterns to maximize parallelism

3. **Context loss**:
   - Subagent doesn't have full conversation history
   - Must pass relevant context in task description
   - Can lead to repeated information

4. **Complexity**:
   - Debugging multi-agent flows is harder
   - Need good observability (session logs, traces)
   - Error propagation needs careful handling

5. **Model confusion**:
   - Some models struggle with tool calling
   - May over-spawn or under-spawn subagents
   - Need clear guidelines on when to delegate

---

### **Optimization Strategy for Local Models**

Given this architecture exists, here's how to leverage it:

#### **Phase 1: Basic Multi-Agent**
```typescript
// Main agent (Llama 3.1 70B or similar "smart" model)
// - Receives user request
// - Decides what to delegate
// - Coordinates responses

// Subagents (Llama 3.1 8B or Phi-3 models)
// - Execute specific tasks
// - Use minimal prompt mode (3k tokens)
// - Return focused results
```

#### **Phase 2: Specialized Agent Pool**
Create agent configs with specialized purposes:
- `agent:coder` - File operations, code generation
- `agent:searcher` - Web search, information gathering  
- `agent:analyzer` - Log analysis, debugging
- `agent:writer` - Documentation, summaries

Each agent gets minimal tools (3-5 tools max).

#### **Phase 3: Response Compilation**
Add a "compiler" agent that:
- Takes multiple subagent outputs
- Synthesizes into coherent response
- Uses very minimal prompt (~500 tokens)
- Just formats and combines, doesn't think

---

### **Recommended Configuration for Local Models**

#### **Main Agent** (8k-32k context):
```json
{
  "agents": {
    "main": {
      "model": "llama3.1:70b",  // Smart orchestrator
      "contextTokens": 32000,
      "promptMode": "minimal",  // Even for main!
      "subagents": {
        "allowAgents": ["coder", "searcher", "analyzer"],
        "model": "llama3.1:8b"  // Default for spawned
      }
    }
  }
}
```

#### **Subagents** (4k-8k context):
```json
{
  "agents": {
    "coder": {
      "model": "qwen2.5-coder:7b",
      "contextTokens": 8192,
      "tools": {
        "allow": ["read", "write", "edit", "exec", "ls"]  // Only 5 tools
      }
    },
    "searcher": {
      "model": "llama3.1:8b",
      "contextTokens": 4096,
      "tools": {
        "allow": ["web_search", "web_fetch", "read"]
      }
    }
  }
}
```

---

### **Implementation Steps**

1. **Modify `src/agents/defaults.ts`**:
   ```typescript
   export const DEFAULT_CONTEXT_TOKENS = 8_192;  // Down from 200k
   export const DEFAULT_PROMPT_MODE = "minimal";  // Force minimal
   ```

2. **Create specialized agent configs** in your config file

3. **Add auto-delegation logic** to main agent prompt:
   ```
   ## Task Delegation
   For complex tasks, spawn specialized agents:
   - File operations: sessions_spawn(agentId="coder", task="...")
   - Research: sessions_spawn(agentId="searcher", task="...")
   - Analysis: sessions_spawn(agentId="analyzer", task="...")
   ```

4. **Test with small models** (8B-13B parameter range)

---

### **Measuring Success**

Track these metrics:
- Tokens per request (target: <8k for main, <4k for subagents)
- Subagent spawn rate (should be >50% of complex tasks)
- End-to-end latency (spawning should be faster than monolithic)
- Cost per request (should be significantly lower)

---

## Bottom Line

**Your architecture makes perfect sense AND it already exists!** The system was built with exactly this pattern in mind. You just need to:

1. Enable it by setting appropriate agent IDs and models
2. Reduce token usage via Phase 1-3 optimizations above
3. Configure tool allowlists per agent
4. Set main agent to actively use `sessions_spawn`

The multi-agent pattern will work **much better** for local models than trying to cram everything into one agent's context.


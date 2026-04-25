# 🧠 REX Cognitive Engine

Enhanced sequential thinking MCP server with real-time analysis. Built on the simplicity of [sequential-thinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking), plus actual feedback on your reasoning quality.

## What It Does

REX Cognitive works like `sequential-thinking` — you feed it numbered thoughts and it tracks your reasoning chain. But unlike vanilla sequential-thinking, **it actually analyzes what you're saying**:

| Feature | sequential-thinking | REX Cognitive |
|---------|:-------------------:|:-------------:|
| Thought storage | ✅ | ✅ |
| Branch & revise | ✅ | ✅ |
| Contradiction detection | ❌ | ✅ |
| Repetition / paraphrase detection | ❌ | ✅ |
| Quality scoring | ❌ | ✅ |
| Topic drift detection | ❌ | ✅ |
| Hypothesis tracking | ❌ | ✅ |
| Branch merging | ❌ | ✅ |
| Actionable directives | ❌ | ✅ |

## How It Works

### Contradiction Detection
Catches both syntactic contradictions (`"X is Y"` vs `"X is not Y"`) and **semantic contradictions** using an antonym dictionary (`"increases productivity"` vs `"destroys productivity"` on the same topic).

### Paraphrase Repetition Detection
Uses a **3-signal composite scorer** to detect when you're saying the same thing with different words:
- **Causal Structure Decomposition** — splits arguments on `because/since/due to`, compares claim vs reasons separately
- **TF-IDF Weighted Jaccard** — rare domain terms weighted higher than common words
- **SimHash Fingerprinting** — FNV-1a 32-bit fuzzy matching as safety net

### Quality Scoring
Evaluates each thought on vocabulary diversity, evidence markers, specificity, novelty, and meaningful content ratio. Gibberish and low-effort input get flagged.

### Topic Drift Detection
Tracks an accumulated global topic from all thoughts. Flags when new thoughts diverge significantly from the established context.

### Hypothesis Lifecycle
Mark thoughts as hypotheses, then confirm or bust them as reasoning progresses.

## Installation

```bash
git clone https://github.com/Charonn/rex-cognitive-engine.git
cd rex-cognitive-engine
npm install
npm run build
```

## MCP Configuration

Add to your MCP client config (e.g., Claude Desktop, Gemini, etc.):

```json
{
  "mcpServers": {
    "rex-cognitive": {
      "command": "node",
      "args": ["path/to/rex-cognitive-engine/dist/index.js"]
    }
  }
}
```

## Tools

### `rex_think`

Main reasoning tool. Send a thought and get back analysis.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `thought` | string | ✅ | Your current thinking step |
| `thoughtNumber` | number | ✅ | Current thought number (1-based) |
| `totalThoughts` | number | ✅ | Estimated total thoughts needed |
| `nextThoughtNeeded` | boolean | ✅ | Whether another thought follows |
| `sessionId` | string | | Session identifier (default: `"default"`) |
| `isRevision` | boolean | | Whether this revises a previous thought |
| `revisesThought` | number | | Which thought number is being revised |
| `branchFromThought` | number | | Branching point thought number |
| `branchId` | string | | Branch identifier |
| `mergeFrom` | number[] | | Thought numbers to merge insights from |
| `hypothesis` | string | | Mark this thought as a hypothesis |
| `hypothesisAction` | string | | `"confirm"`, `"bust"`, or `"test"` |
| `hypothesisTarget` | number | | Which hypothesis to update |

**Response includes:**

```typescript
{
  thoughtNumber: number,
  totalThoughts: number,
  nextThoughtNeeded: boolean,
  thought: string,              // echoed back
  quality: number,              // 0-1 score
  qualityTrend: number,         // EWMA trend
  contradictions: Contradiction[],
  coherenceDrift: number,       // 0 = on topic, 1 = completely off
  repetitionWarning: string | null,
  hypotheses: Hypothesis[],
  mergedInsights: string[] | null,
  directive: string             // actionable feedback
}
```

### `rex_reset_session`

Clear all thoughts and state for a session.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string | Session to reset (default: `"default"`) |

### `rex_session_summary`

Get stats for a session — total thoughts, quality trend, hypotheses, topic stems.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string | Session to summarize (default: `"default"`) |

## Example Usage

```
Thought 1: "Remote work increases productivity because employees save commute time."
→ ✅ Quality: 85%

Thought 2: "Working from home boosts output since people avoid wasting time on commuting."
→ 🔄 Structural repetition (55%) with thought 1. Same argument, different words.

Thought 3: "Remote work destroys productivity because employees lack discipline."
→ ⚠️ CONTRADICTION with thought 1: "destroys" vs "increases" on [remote, work, productivity]

Thought 4: "blah blah blah blah blah"
→ 📉 Low quality (35%). Add evidence, specifics, or deeper analysis.
```

## Architecture

```
rex-cognitive-engine/
├── src/
│   ├── engine.ts    # Core analysis engine (all logic)
│   └── index.ts     # MCP server wrapper (stdio transport)
├── package.json
└── tsconfig.json
```

- **Zero external APIs** — everything runs locally
- **Zero heavy dependencies** — only `@modelcontextprotocol/sdk`
- **Deterministic** — no AI/ML, no hallucination, pure algorithmic analysis
- **Sub-millisecond** — all analysis completes in <1ms per thought

## Language Support

Currently optimized for **English** text. The synonym clusters, antonym dictionary, stop words, and causal markers are all English. Works best when AI models reason in English (which most do internally, regardless of conversation language).

## License

MIT

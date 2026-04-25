#!/usr/bin/env node
/**
 * REX Cognitive Engine v4.0 — "The Thinking Weapon"
 * Sequential-thinking foundation + contradiction detection, quality scoring,
 * coherence tracking, hypothesis management, and branch merging.
 * No regex fallacy detection. No external AI. Pure local brain-assist.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RexEngine } from "./engine.js";

const engine = new RexEngine();

// ─── MCP SERVER ─────────────────────────────────────────────────────────

const server = new Server(
  { name: "rex-cognitive", version: "4.0.0" },
  { capabilities: { tools: {} } }
);

// ─── TOOL DEFINITIONS ───────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "rex_think",
      description: `REX Cognitive Engine — Enhanced sequential thinking with analysis.
Built on sequential-thinking's simplicity, plus:
- Contradiction detection across all previous thoughts
- Quality scoring with EWMA trend tracking
- Topic coherence drift detection
- Repetition detection (warns when you're repeating yourself)
- Hypothesis tracking (mark, confirm, bust)
- Branch merge (synthesize insights from multiple thoughts)
- Actionable directives based on analysis

Use this for any multi-step reasoning, planning, analysis, or problem-solving.
Works exactly like sequential-thinking but gives you actual feedback.

Modes: just use it — no mode selection needed. Always analyzes.`,
      inputSchema: {
        type: "object" as const,
        required: ["thought", "thoughtNumber", "totalThoughts", "nextThoughtNeeded"],
        properties: {
          thought: { type: "string", description: "Your current thinking step" },
          thoughtNumber: { type: "number", description: "Current thought number (1-based)" },
          totalThoughts: { type: "number", description: "Estimated total thoughts needed (adjustable)" },
          nextThoughtNeeded: { type: "boolean", description: "Whether another thought step follows" },
          sessionId: { type: "string", description: "Session identifier (default: 'default')" },
          isRevision: { type: "boolean", description: "Whether this revises a previous thought" },
          revisesThought: { type: "number", description: "Which thought number is being revised" },
          branchFromThought: { type: "number", description: "Branching point thought number" },
          branchId: { type: "string", description: "Branch identifier" },
          mergeFrom: { type: "array", items: { type: "number" }, description: "Thought numbers to merge insights from" },
          hypothesis: { type: "string", description: "Mark this thought as a hypothesis" },
          hypothesisAction: { type: "string", enum: ["confirm", "bust", "test"], description: "Update hypothesis status" },
          hypothesisTarget: { type: "number", description: "Which hypothesis # to update" },
        },
      },
    },
    {
      name: "rex_reset_session",
      description: "Reset a thinking session, clearing all thoughts and state.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sessionId: { type: "string", description: "Session to reset (default: 'default')" },
        },
      },
    },
    {
      name: "rex_session_summary",
      description: "Get a summary of the current thinking session — quality trend, hypotheses, stats.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sessionId: { type: "string", description: "Session to summarize (default: 'default')" },
        },
      },
    },
  ],
}));

// ─── TOOL HANDLERS ──────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "rex_think") {
    const result = engine.processThought({
      thought: args?.thought as string,
      thoughtNumber: args?.thoughtNumber as number,
      totalThoughts: args?.totalThoughts as number,
      nextThoughtNeeded: args?.nextThoughtNeeded as boolean,
      sessionId: (args?.sessionId as string) || "default",
      isRevision: args?.isRevision as boolean | undefined,
      revisesThought: args?.revisesThought as number | undefined,
      branchFromThought: args?.branchFromThought as number | undefined,
      branchId: args?.branchId as string | undefined,
      mergeFrom: args?.mergeFrom as number[] | undefined,
      hypothesis: args?.hypothesis as string | undefined,
      hypothesisAction: args?.hypothesisAction as "confirm" | "bust" | "test" | undefined,
      hypothesisTarget: args?.hypothesisTarget as number | undefined,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === "rex_reset_session") {
    const sessionId = (args?.sessionId as string) || "default";
    engine.resetSession(sessionId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ status: "reset", sessionId }) }],
    };
  }

  if (name === "rex_session_summary") {
    const sessionId = (args?.sessionId as string) || "default";
    const summary = engine.getSessionSummary(sessionId);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  }

  return {
    content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// ─── START ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🧠 REX Cognitive Engine v4.0.0 — The Thinking Weapon — Online");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

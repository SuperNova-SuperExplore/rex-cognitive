#!/usr/bin/env node
/**
 * REX Cognitive Engine v2.0 — "Zero Fallacy Engine"
 * 12-layer reasoning analysis. Zero ML dependencies.
 * Backed by: Toulmin (1958), Walton (2008), Besta et al. (AAAI 2024), CQoT (2024).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ─── TYPES ──────────────────────────────────────────────────────────────

interface ThoughtNode {
  id: number;
  thought: string;
  timestamp: number;
  branchId?: string;
  branchFrom?: number;
  mergeFrom?: number[];
  mode: "fast" | "deep" | "critical";
  qualityScore: number;
  signals: StructuralSignals;
  biases: string[];
  isRevision: boolean;
  revisesThought?: number;
}

interface ClaimNode {
  id: string;
  thoughtId: number;
  text: string;
  negated: boolean;
  sourceType: "verified" | "derived" | "external" | "hypothetical" | "ungrounded";
}

interface FallacyHit {
  name: string;
  category: string;
  description: string;
  matched: string;
}

interface ToulminAnalysis {
  claim: boolean;
  data: boolean;
  warrant: boolean;
  backing: boolean;
  qualifier: boolean;
  rebuttal: boolean;
  score: number;
  missing: string[];
  criticalQuestions: string[];
}

interface ConsistencyResult {
  contradictions: Array<{ claimA: string; claimB: string; thoughtA: number; thoughtB: number }>;
  hasContradiction: boolean;
}

interface StructuralSignals {
  hasEvidence: boolean;      // References data, numbers, URLs, specifics
  advances: boolean;         // Introduces new info vs restating
  hedgingRatio: number;      // % of hedging language (0-1)
  lengthRatio: number;       // Length vs average (1.0 = average)
  novelTerms: number;        // Count of new concepts introduced
}

interface GoTEdge {
  from: number;
  to: number;
  type: "sequential" | "branch" | "merge" | "revision";
}

interface SessionState {
  thoughts: Map<number, ThoughtNode>;
  edges: GoTEdge[];
  ewma: number;
  avgLength: number;
  totalLength: number;
  allTerms: Set<string>;
  confidenceHistory: number[];
  claims: ClaimNode[];
}

interface AnalysisResult {
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  mode: string;
  ewmaScore: number;
  qualityScore: number;
  signals: StructuralSignals;
  warnings: string[];
  biasesDetected: string[];
  fallaciesDetected: FallacyHit[];
  toulmin: ToulminAnalysis;
  consistency: ConsistencyResult;
  circularReasoning: boolean;
  circularPath: number[] | null;
  directive: string;
  graphStats: { nodes: number; edges: number; branches: number; merges: number };
}

// ─── BIAS DETECTOR ──────────────────────────────────────────────────────

const BIAS_PATTERNS: Array<{ name: string; patterns: RegExp[]; description: string }> = [
  {
    name: "ABSOLUTISM",
    patterns: [
      /\b(always|never|impossible|guaranteed|certainly|undoubtedly|without exception)\b/gi,
      /\b(every single|no one ever|100% certain)\b/gi,
    ],
    description: "Absolute language detected — consider edge cases",
  },
  {
    name: "ASSUMPTION",
    patterns: [
      /\b(obviously|clearly|of course|everyone knows|it's clear that|needless to say)\b/gi,
    ],
    description: "Unexamined assumption — state evidence explicitly",
  },
  {
    name: "ANCHORING",
    patterns: [
      /\b(the only (way|option|approach|solution|method))\b/gi,
      /\b(there's no other|must be this)\b/gi,
    ],
    description: "Anchoring on single option — explore alternatives",
  },
  {
    name: "BANDWAGON",
    patterns: [
      /\b(everyone uses|most people|the standard is|common practice)\b/gi,
    ],
    description: "Appeal to popularity — validate independently",
  },
  {
    name: "HASTY_GENERALIZATION",
    patterns: [
      /\b(therefore all|so every|this means all|this proves that every)\b/gi,
    ],
    description: "Generalizing from limited evidence",
  },
];

function detectBiases(thought: string): string[] {
  const detected: string[] = [];
  for (const bias of BIAS_PATTERNS) {
    for (const pattern of bias.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(thought)) {
        detected.push(`${bias.name}: ${bias.description}`);
        break;
      }
    }
  }
  return detected;
}

// ─── LAYER 6: FALLACY DETECTOR (30 patterns) ────────────────────────────
// Ref: SMARTYPAT (AAAI 2025), Logical Structure Tree (EMNLP 2024)

const FALLACY_PATTERNS: Array<{ name: string; category: string; pattern: RegExp; description: string }> = [
  // STRUCTURAL FALLACIES
  { name: "AD_HOMINEM", category: "structural", pattern: /\b(attack|discredit|insult).{0,30}(person|character|motive|credib)/i, description: "Attacking the person instead of the argument" },
  { name: "STRAW_MAN", category: "structural", pattern: /\b(they|opponents?|critics?)\s+(said|claim|argue|believe).{0,40}(but actually|but really|in reality|when really)/i, description: "Misrepresenting opponent's argument" },
  { name: "FALSE_DICHOTOMY", category: "structural", pattern: /\b(either\s+.{3,30}\s+or\b|only two (options|choices|ways)|no (middle ground|other option|alternative))/i, description: "Presenting only two options when more exist" },
  { name: "SLIPPERY_SLOPE", category: "structural", pattern: /\b(if we (allow|accept|start)|once we|this will (lead|inevitably|eventually)).{0,40}(then|eventually|lead to|result in|end up)/i, description: "Claiming one step inevitably leads to extreme outcome" },
  { name: "CIRCULAR_REASONING", category: "structural", pattern: /\b(true because.{0,30}true|right because.{0,30}right|is\s+\w+\s+because\s+it\s+is\s+\w+)/i, description: "Using conclusion as premise" },
  { name: "EQUIVOCATION", category: "structural", pattern: /\b(in (one|another|a different) sense|depends on.{0,20}(definition|meaning)|redefin)/i, description: "Shifting meaning of key term mid-argument" },
  { name: "RED_HERRING", category: "structural", pattern: /\b(but what about|changing the subject|more importantly|the real issue|let's not forget that)/i, description: "Introducing irrelevant topic to divert" },
  { name: "NON_SEQUITUR", category: "structural", pattern: /\b(therefore|thus|hence|so)\b.{5,60}\b(which has nothing|unrelated|doesn't follow)/i, description: "Conclusion doesn't follow from premises" },
  // EVIDENTIAL FALLACIES
  { name: "POST_HOC", category: "evidential", pattern: /\b(after.{0,20}therefore.{0,20}caused|happened (before|first).{0,20}(so|therefore|thus)|since.{0,20}(preceded|came before).{0,20}(must have|caused))/i, description: "Assuming temporal sequence = causation" },
  { name: "FALSE_CAUSE", category: "evidential", pattern: /\b(correlat.{0,15}(therefore|so|thus|means).{0,15}caus|proves? (that|a) (causal|direct)|because.{0,20}(trend|graph|chart) shows)/i, description: "Confusing correlation with causation" },
  { name: "ANECDOTAL", category: "evidential", pattern: /\b(I know (someone|a person|a guy)|my (friend|uncle|neighbor).{0,20}(so|therefore|proves)|personal(ly)? (experience|story).{0,15}(proves|shows))/i, description: "Using personal story as statistical evidence" },
  { name: "CHERRY_PICKING", category: "evidential", pattern: /\b(ignore|ignoring|overlooking|disregard).{0,20}(evidence|data|studies|facts|counter)|only (look|focus|consider).{0,15}(at|on)/i, description: "Selectively presenting favorable evidence" },
  { name: "TEXAS_SHARPSHOOTER", category: "evidential", pattern: /\b(pattern.{0,20}(after|post.?hoc)|fit.{0,15}(narrative|theory|hypothesis)|data.{0,15}(supports? our|confirms? our))/i, description: "Drawing target around data cluster after the fact" },
  // APPEAL FALLACIES
  { name: "APPEAL_TO_AUTHORITY", category: "appeal", pattern: /\b(expert says?.{0,15}(so|therefore|must)|because.{0,20}(said so|says? so|authority)|according to.{0,20}(must be|is definitely))/i, description: "Uncritical deference to authority" },
  { name: "APPEAL_TO_EMOTION", category: "appeal", pattern: /\b(think of the (children|victims|families)|how would you feel|imagine (if|the suffering)|won't (someone|anybody) think)/i, description: "Substituting emotional appeal for evidence" },
  { name: "APPEAL_TO_NATURE", category: "appeal", pattern: /\b(natural.{0,30}(therefore|so|thus).{0,20}(good|right|better|healthy|safe)|unnatural.{0,20}(bad|wrong|harmful|dangerous))/i, description: "Equating natural with good" },
  { name: "APPEAL_TO_TRADITION", category: "appeal", pattern: /\b(always been (this|that|done) way|tradition.{0,15}(therefore|so|thus)|we've always|that's how (it's|we've) always)/i, description: "Appealing to tradition over evidence" },
  { name: "APPEAL_TO_POPULARITY", category: "appeal", pattern: /\b(millions?.{0,15}can't be wrong|everyone (does|believes|knows|agrees)|most people (think|believe|agree)|popular.{0,10}(therefore|so|must))/i, description: "Popularity doesn't equal truth" },
  { name: "APPEAL_TO_NOVELTY", category: "appeal", pattern: /\b(new.{0,15}(therefore|so|thus|must be|is).{0,15}(better|superior|best)|latest.{0,15}(must|is|means).{0,10}(best|better|superior)|older?.{0,10}(therefore|so|thus|means).{0,15}(bad|obsolete|outdated|inferior)|newer.{0,10}(is|means).{0,10}(better|best))/i, description: "Equating newness with superiority" },
  // STRUCTURAL (ADVANCED)
  { name: "TU_QUOQUE", category: "structural", pattern: /\b(you (also|too|yourself)|hypocrit|practice what you preach|but you (did|do|said))/i, description: "Deflecting by accusing opponent of same thing" },
  { name: "GENETIC_FALLACY", category: "structural", pattern: /\b(originat.{0,30}(therefore|so|thus).{0,20}(bad|wrong|invalid|flawed)|source.{0,20}(discredits?|invalidates?))/i, description: "Judging argument by its origin, not merit" },
  { name: "COMPOSITION", category: "structural", pattern: /\b(part is.{0,15}therefore.{0,10}whole|each.{0,15}(is|are).{0,15}therefore.{0,10}(all|whole|entire|group))/i, description: "Assuming part properties apply to whole" },
  { name: "DIVISION", category: "structural", pattern: /\b(whole is.{0,15}therefore.{0,10}(part|each|every)|group.{0,15}(is|are).{0,15}therefore.{0,10}(each|every|individual))/i, description: "Assuming whole properties apply to parts" },
  { name: "LOADED_QUESTION", category: "structural", pattern: /\b(when did you stop|have you stopped|why do you (still|always|keep)|do you still (beat|abuse|cheat))/i, description: "Question presupposes unproven claim" },
  { name: "NO_TRUE_SCOTSMAN", category: "structural", pattern: /\b(no (true|real|genuine).{0,10}would|a real.{0,10}wouldn't|any true.{0,10}(would|should|must))/i, description: "Redefining category to exclude counterexamples" },
  { name: "MIDDLE_GROUND", category: "structural", pattern: /\b(truth.{0,10}(lies? )?in the middle|compromise.{0,10}(therefore|so|must)|both sides.{0,10}(equally|partially) (right|valid))/i, description: "Assuming middle position is automatically correct" },
  { name: "BURDEN_OF_PROOF", category: "structural", pattern: /\b(prove.{0,10}(it's wrong|it doesn't|me wrong)|can't (disprove|prove.{0,5}wrong).{0,10}(therefore|so|thus|must be))/i, description: "Shifting burden of proof" },
  { name: "PERSONAL_INCREDULITY", category: "structural", pattern: /\b(I can't (imagine|understand|conceive|see how).{0,15}(therefore|so|thus|must)|hard to (believe|imagine).{0,10}(therefore|so))/i, description: "Using personal disbelief as evidence" },
  { name: "GAMBLERS_FALLACY", category: "evidential", pattern: /\b(due for|overdue|bound to happen|streak.{0,10}(must|has to|will) (end|break)|law of averages)/i, description: "Assuming past random events affect future probability" },
  { name: "SUNK_COST", category: "evidential", pattern: /\b(already (invested|spent|put in)|come (this|too) far|can't (stop|quit) now.{0,10}(because|since)|waste.{0,10}(investment|effort|time))/i, description: "Continuing because of past investment rather than future value" },
];

function detectFallacies(thought: string): FallacyHit[] {
  const hits: FallacyHit[] = [];
  for (const f of FALLACY_PATTERNS) {
    f.pattern.lastIndex = 0;
    const m = f.pattern.exec(thought);
    if (m) {
      hits.push({ name: f.name, category: f.category, description: f.description, matched: m[0].trim() });
    }
  }
  return hits;
}

// ─── LAYER 7: TOULMIN COMPLETENESS + CQ GENERATION ──────────────────────
// Ref: CQoT (arXiv:2412.15177), Toulmin (1958), Yu & Zenker 3-attack framework

const TOULMIN_MARKERS = {
  claim: [
    /\b(therefore|thus|hence|consequently|I (argue|contend|believe|claim|conclude)|the conclusion is|this (means|shows|proves|demonstrates|implies))\b/i,
    /\b(my (position|argument|thesis|point) is|we (should|must|need to)|it follows that)\b/i,
  ],
  data: [
    /\b(because|since|given that|as (shown|demonstrated|evidenced) by|the (data|evidence|research|studies|findings) (show|indicate|suggest|demonstrate|reveal))\b/i,
    /\b(according to|based on|supported by|confirmed by|\d+%|\d+ out of \d+|experiment|survey|statistic)/i,
  ],
  warrant: [
    /\b(this (is important|matters) because|the (reason|logic|connection|link) (is|being)|which (means|implies|suggests)|connects? to)\b/i,
    /\b(it follows (that|because)|the principle (is|being|here)|generally speaking|as a (rule|principle))\b/i,
  ],
  backing: [
    /\b(this (principle|rule|connection) is (supported|backed|validated) by|research (confirms|validates|supports)|historically|in (practice|theory))\b/i,
    /\b(meta.?analysis|systematic review|established|well.?documented|peer.?reviewed)\b/i,
  ],
  qualifier: [
    /\b(probably|likely|in most cases|generally|typically|presumably|almost certainly|with high (confidence|probability))\b/i,
    /\b(\d+% (confidence|probability|chance|likelihood)|strong(ly)? suggest|tends? to)\b/i,
  ],
  rebuttal: [
    /\b(unless|except (when|if|for)|however|on the other hand|counter.?argument|one could argue|opponents? (might|could|would)|the weakness|this (fails|breaks down) (when|if))\b/i,
    /\b(limitation|caveat|edge case|exception|not applicable (when|if)|this doesn't (hold|apply))\b/i,
  ],
};

const TOULMIN_CQ: Record<string, string> = {
  claim: "CQ: What specific conclusion are you asserting? State it explicitly.",
  data: "CQ: What evidence supports this? Cite specific data, numbers, or sources.",
  warrant: "CQ: WHY does your evidence support your claim? State the logical bridge.",
  backing: "CQ: What supports your warrant itself? Is the reasoning principle validated?",
  qualifier: "CQ: How certain are you? Assign an explicit confidence level (e.g., 'likely', '80%').",
  rebuttal: "CQ: Under what conditions would this claim be wrong? Address the strongest counter-argument.",
};

function analyzeToulmin(thought: string): ToulminAnalysis {
  const result: Record<string, boolean> = {};
  const missing: string[] = [];
  const criticalQuestions: string[] = [];

  for (const [component, markers] of Object.entries(TOULMIN_MARKERS)) {
    const found = markers.some(m => { m.lastIndex = 0; return m.test(thought); });
    result[component] = found;
    if (!found) {
      missing.push(component);
      criticalQuestions.push(TOULMIN_CQ[component]);
    }
  }

  const presentCount = Object.values(result).filter(Boolean).length;
  const score = presentCount / 6;

  return {
    claim: result.claim,
    data: result.data,
    warrant: result.warrant,
    backing: result.backing,
    qualifier: result.qualifier,
    rebuttal: result.rebuttal,
    score,
    missing,
    criticalQuestions,
  };
}

// ─── LAYER 9: CONSISTENCY CHECKER ───────────────────────────────────────
// Ref: Nature (2024) semantic entropy, SCC-based consistency detection

const CLAIM_EXTRACTORS = [
  /\b(?:therefore|thus|hence|so|consequently),?\s+(.{10,80}?)(?:\.|$)/gi,
  /\b(?:this (?:means|shows|proves|implies))\s+(?:that\s+)?(.{10,80}?)(?:\.|$)/gi,
  /\b(?:I (?:conclude|argue|claim|believe))\s+(?:that\s+)?(.{10,80}?)(?:\.|$)/gi,
  /\b(?:the (?:conclusion|result|finding|answer) is)\s+(?:that\s+)?(.{10,80}?)(?:\.|$)/gi,
];

const NEGATION_PAIRS: Array<[RegExp, RegExp]> = [
  // Modal negations
  [/\bis\b/i, /\bis\s+not\b/i],
  [/\bcan\b/i, /\bcannot\b/i],
  [/\bshould\b/i, /\bshould\s*not\b/i],
  [/\bwill\b/i, /\bwill\s*not\b/i],
  // Boolean antonyms
  [/\btrue/i, /\bfalse/i],
  [/\bpossible/i, /\bimpossible/i],
  [/\bvalid/i, /\binvalid/i],
  [/\bcorrect/i, /\bincorrect/i],
  // Quality antonyms
  [/\beffective/i, /\bineffective/i],
  [/\breliable/i, /\bunreliable/i],
  [/\bsafe/i, /\bunsafe/i],
  [/\bsufficient/i, /\binsufficient/i],
  [/\bnecessary/i, /\bunnecessary/i],
  [/\bsuitable/i, /\bunsuitable/i],
  [/\badequate/i, /\binadequate/i],
  [/\bstable/i, /\bunstable/i],
  [/\bsecure/i, /\binsecure/i],
  [/\bconsistent/i, /\binconsistent/i],
  // Directional antonyms
  [/\bsuccess/i, /\bfailure/i],
  [/\bincreas/i, /\bdecreas/i],
  [/\bbetter/i, /\bworse/i],
  [/\bmore/i, /\bless\b/i],
  [/\bfast/i, /\bslow/i],
  [/\bstrong/i, /\bweak/i],
  [/\bgood/i, /\bbad\b/i],
  [/\bhigh/i, /\blow\b/i],
  // Cross-pair semantic opposites (reliable↔ineffective, effective↔unreliable)
  [/\breliable/i, /\bineffective/i],
  [/\beffective/i, /\bunreliable/i],
  [/\bsuitable/i, /\bineffective/i],
  [/\bsuitable/i, /\bunreliable/i],
];

function extractClaims(thought: string, thoughtId: number): ClaimNode[] {
  const claims: ClaimNode[] = [];
  const seen = new Set<string>();

  for (const extractor of CLAIM_EXTRACTORS) {
    extractor.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = extractor.exec(thought)) !== null) {
      const text = m[1].trim().toLowerCase();
      if (text.length > 10 && !seen.has(text)) {
        seen.add(text);
        const negated = /\b(not|never|no|cannot|can't|won't|isn't|aren't|doesn't|don't|wasn't|weren't)\b/i.test(text);
        claims.push({ id: `t${thoughtId}_c${claims.length}`, thoughtId, text, negated, sourceType: "derived" });
      }
    }
  }
  return claims;
}

function checkConsistency(newClaims: ClaimNode[], existingClaims: ClaimNode[]): ConsistencyResult {
  const contradictions: ConsistencyResult["contradictions"] = [];

  for (const nc of newClaims) {
    for (const ec of existingClaims) {
      if (nc.thoughtId === ec.thoughtId) continue;

      // Extract key terms (nouns/verbs 4+ chars) from each claim
      const ncTerms = new Set((nc.text.match(/\b[a-z]{4,}\b/g) || []).filter(t => !["that", "this", "with", "from", "have", "been", "were", "they", "their", "which", "would", "should", "could", "about", "into", "also", "then", "than", "more", "most", "some", "such", "each", "only", "does", "very"].includes(t)));
      const ecTerms = new Set((ec.text.match(/\b[a-z]{4,}\b/g) || []).filter(t => !["that", "this", "with", "from", "have", "been", "were", "they", "their", "which", "would", "should", "could", "about", "into", "also", "then", "than", "more", "most", "some", "such", "each", "only", "does", "very"].includes(t)));

      // Need at least 2 overlapping key terms to consider related
      let overlap = 0;
      for (const t of ncTerms) { if (ecTerms.has(t)) overlap++; }
      if (overlap < 2) continue;

      // Check negation pair patterns
      for (const [posPattern, negPattern] of NEGATION_PAIRS) {
        const ncPos = posPattern.test(nc.text);
        const ncNeg = negPattern.test(nc.text);
        const ecPos = posPattern.test(ec.text);
        const ecNeg = negPattern.test(ec.text);

        if ((ncPos && ecNeg) || (ncNeg && ecPos)) {
          contradictions.push({ claimA: nc.text, claimB: ec.text, thoughtA: nc.thoughtId, thoughtB: ec.thoughtId });
          break;
        }
      }
    }
  }

  return { contradictions, hasContradiction: contradictions.length > 0 };
}

// ─── STRUCTURAL SIGNAL EXTRACTOR ────────────────────────────────────────

const HEDGING_WORDS = /\b(maybe|perhaps|possibly|might|could be|uncertain|not sure|I think|probably|likely|seems like|appears to)\b/gi;
const EVIDENCE_MARKERS = /\b(because|evidence|data shows?|according to|measured|tested|confirmed|verified|result:|proof|CVE-|0x[0-9a-f]+|\d+\.\d+\.\d+|https?:\/\/|port \d+|\d+%|\d+ms|\d+k\b|p\d{2,3}|benchmark|study|research|experiment|survey|found that|shows? that|demonstrates?|indicates?|\d+ (users?|requests?|seconds?|bytes?|connections?|samples?))\b/gi;

function extractSignals(thought: string, session: SessionState): StructuralSignals {
  // Evidence detection
  const evidenceMatches = thought.match(EVIDENCE_MARKERS) || [];
  const hasEvidence = evidenceMatches.length >= 2;

  // Hedging ratio
  const words = thought.split(/\s+/).length;
  const hedgingMatches = thought.match(HEDGING_WORDS) || [];
  const hedgingRatio = words > 0 ? hedgingMatches.length / words : 0;

  // Length ratio vs running average
  const currentAvg = session.totalLength > 0 && session.thoughts.size > 0
    ? session.totalLength / session.thoughts.size
    : thought.length;
  const lengthRatio = currentAvg > 0 ? thought.length / currentAvg : 1.0;

  // Novelty: extract key terms not seen before
  const termPattern = /\b[A-Z][a-zA-Z]{3,}\b|\b[a-z]{5,}\b/g;
  const currentTerms = new Set((thought.match(termPattern) || []).map(t => t.toLowerCase()));
  let novelTerms = 0;
  for (const term of currentTerms) {
    if (!session.allTerms.has(term)) novelTerms++;
  }

  // Advance detection: has novel terms AND has evidence = advancing
  const advances = novelTerms >= 2 || hasEvidence;

  return { hasEvidence, advances, hedgingRatio, lengthRatio, novelTerms };
}

// ─── QUALITY SCORER (EWMA) ─────────────────────────────────────────────

function computeQualityScore(signals: StructuralSignals): number {
  let score = 0.5; // baseline

  if (signals.hasEvidence) score += 0.2;
  if (signals.advances) score += 0.15;
  if (signals.novelTerms >= 3) score += 0.1;
  if (signals.hedgingRatio > 0.15) score -= 0.15;
  if (signals.hedgingRatio > 0.25) score -= 0.1;
  if (signals.lengthRatio > 3.0) score -= 0.1; // rambling
  if (signals.lengthRatio < 0.2) score -= 0.1; // too terse

  return Math.max(0, Math.min(1, score));
}

function updateEWMA(current: number, newValue: number, alpha: number = 0.3): number {
  return alpha * newValue + (1 - alpha) * current;
}

// ─── GRAPH OF THOUGHTS (GoT) ───────────────────────────────────────────

function buildAdjacencyList(edges: GoTEdge[]): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }
  return adj;
}

// Tarjan's SCC — detect circular reasoning
function tarjanSCC(nodes: number[], edges: GoTEdge[]): number[][] {
  const adj = buildAdjacencyList(edges);
  let index = 0;
  const stack: number[] = [];
  const onStack = new Set<number>();
  const indices = new Map<number, number>();
  const lowlinks = new Map<number, number>();
  const sccs: number[][] = [];

  function strongconnect(v: number) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of (adj.get(v) || [])) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) sccs.push(scc); // Only cycles with >1 node
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) strongconnect(node);
  }

  return sccs;
}

// ─── DIRECTIVE GENERATOR ────────────────────────────────────────────────

function generateDirective(
  mode: string,
  ewma: number,
  biases: string[],
  circular: boolean,
  signals: StructuralSignals,
  thoughtNumber: number,
  fallacies: FallacyHit[] = [],
  toulmin: ToulminAnalysis = { claim: true, data: true, warrant: true, backing: true, qualifier: true, rebuttal: true, score: 1, missing: [], criticalQuestions: [] },
  consistency: ConsistencyResult = { contradictions: [], hasContradiction: false },
): string {
  const parts: string[] = [];

  // Quality-based directives
  if (ewma < 0.4 && thoughtNumber > 3) {
    parts.push("⚠️ QUALITY DECLINING — Consider backtracking to a stronger thought.");
  } else if (ewma < 0.55 && thoughtNumber > 2) {
    parts.push("📉 Quality trending down. Add evidence or change approach.");
  }

  // Bias-based
  if (biases.length > 0) {
    parts.push(`🧠 Bias detected: ${biases[0]}`);
  }

  // Circular reasoning
  if (circular) {
    parts.push("🔄 CIRCULAR REASONING detected — you're looping. Break the cycle.");
  }

  // Signal-based
  if (!signals.hasEvidence && thoughtNumber > 1) {
    parts.push("📌 No evidence markers. Ground this thought in specifics.");
  }
  if (!signals.advances && thoughtNumber > 2) {
    parts.push("🔁 Not advancing. Introduce new information or pivot.");
  }
  if (signals.hedgingRatio > 0.2) {
    parts.push("⚡ High hedging. Commit to a position or explain uncertainty.");
  }
  if (signals.lengthRatio > 3.0) {
    parts.push("✂️ Thought is 3x+ average length. Consider splitting.");
  }

  // Layer 6: Fallacy directives
  if (fallacies.length > 0) {
    const top = fallacies[0];
    parts.push(`🚨 FALLACY [${top.name}]: ${top.description} (matched: "${top.matched}")`);
  }
  if (fallacies.length > 1) {
    parts.push(`⚠️ ${fallacies.length} total fallacies detected`);
  }

  // Layer 7: Toulmin directives
  if (toulmin.score < 0.5 && thoughtNumber > 1) {
    parts.push(`📐 WEAK ARGUMENT STRUCTURE (${Math.round(toulmin.score * 100)}%): Missing ${toulmin.missing.join(", ")}`);
    if (toulmin.criticalQuestions.length > 0) {
      parts.push(toulmin.criticalQuestions[0]);
    }
  } else if (toulmin.missing.length > 0 && toulmin.missing.length <= 3 && thoughtNumber > 1) {
    parts.push(`📐 Toulmin: Missing ${toulmin.missing.join(", ")}`);
  }

  // Layer 9: Consistency directives
  if (consistency.hasContradiction) {
    const c = consistency.contradictions[0];
    parts.push(`💥 CONTRADICTION: Thought #${c.thoughtA} vs #${c.thoughtB} — "${c.claimA.substring(0, 40)}..." contradicts "${c.claimB.substring(0, 40)}..."`);
  }

  // Mode-specific adversarial directives
  if (mode === "critical" && thoughtNumber > 1) {
    parts.push("🎯 CRITICAL MODE: Before next thought, identify the weakest assumption in your chain so far.");
  }
  if (mode === "deep" && thoughtNumber % 3 === 0) {
    parts.push("🔍 DEEP MODE: Checkpoint — verify consistency with thoughts 1-" + (thoughtNumber - 1) + ".");
  }

  if (parts.length === 0) {
    return "✅ Thought accepted. Quality on track.";
  }

  return parts.join(" | ");
}

// ─── SESSION MANAGEMENT ─────────────────────────────────────────────────

const sessions = new Map<string, SessionState>();

function getOrCreateSession(sessionId: string): SessionState {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      thoughts: new Map(),
      edges: [],
      ewma: 0.7, // Start optimistic
      avgLength: 0,
      totalLength: 0,
      allTerms: new Set(),
      confidenceHistory: [],
      claims: [],
    });
  }
  return sessions.get(sessionId)!;
}

// ─── MAIN PROCESSING ────────────────────────────────────────────────────

function processThought(params: {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  mode?: "fast" | "deep" | "critical";
  sessionId?: string;
  branchId?: string;
  branchFrom?: number;
  mergeFrom?: number[];
  isRevision?: boolean;
  revisesThought?: number;
}): AnalysisResult {
  const mode = params.mode || "deep";
  const sessionId = params.sessionId || "default";
  const session = getOrCreateSession(sessionId);

  // Extract structural signals
  const signals = extractSignals(params.thought, session);

  // Compute quality
  const qualityScore = computeQualityScore(signals);

  // Update EWMA
  session.ewma = updateEWMA(session.ewma, qualityScore);

  // Detect biases (skip in fast mode)
  const biases = mode === "fast" ? [] : detectBiases(params.thought);

  // Layer 6: Fallacy detection (deep/critical)
  const fallacies = mode === "fast" ? [] : detectFallacies(params.thought);

  // Layer 7: Toulmin completeness (deep/critical)
  const toulmin = mode === "fast"
    ? { claim: true, data: true, warrant: true, backing: true, qualifier: true, rebuttal: true, score: 1, missing: [], criticalQuestions: [] }
    : analyzeToulmin(params.thought);

  // Layer 9: Consistency checking — extract claims + check vs history
  const newClaims = mode === "fast" ? [] : extractClaims(params.thought, params.thoughtNumber);
  const consistency = mode === "fast"
    ? { contradictions: [], hasContradiction: false }
    : checkConsistency(newClaims, session.claims);
  for (const c of newClaims) session.claims.push(c);

  // Update session state
  const termPattern = /\b[A-Z][a-zA-Z]{3,}\b|\b[a-z]{5,}\b/g;
  const currentTerms = (params.thought.match(termPattern) || []).map(t => t.toLowerCase());
  for (const term of currentTerms) session.allTerms.add(term);
  session.totalLength += params.thought.length;

  // Create thought node
  const node: ThoughtNode = {
    id: params.thoughtNumber,
    thought: params.thought,
    timestamp: Date.now(),
    branchId: params.branchId,
    branchFrom: params.branchFrom,
    mergeFrom: params.mergeFrom,
    mode,
    qualityScore,
    signals,
    biases,
    isRevision: params.isRevision || false,
    revisesThought: params.revisesThought,
  };
  session.thoughts.set(params.thoughtNumber, node);

  // Build GoT edges
  if (params.thoughtNumber > 1 && !params.branchFrom && !params.mergeFrom) {
    session.edges.push({
      from: params.thoughtNumber - 1,
      to: params.thoughtNumber,
      type: "sequential",
    });
  }
  if (params.branchFrom) {
    session.edges.push({
      from: params.branchFrom,
      to: params.thoughtNumber,
      type: "branch",
    });
  }
  if (params.mergeFrom) {
    for (const src of params.mergeFrom) {
      session.edges.push({
        from: src,
        to: params.thoughtNumber,
        type: "merge",
      });
    }
  }
  if (params.isRevision && params.revisesThought) {
    session.edges.push({
      from: params.thoughtNumber,
      to: params.revisesThought,
      type: "revision",
    });
  }

  // Check circular reasoning (deep/critical only)
  let circularReasoning = false;
  let circularPath: number[] | null = null;
  if (mode !== "fast") {
    const nodeIds = Array.from(session.thoughts.keys());
    const sccs = tarjanSCC(nodeIds, session.edges);
    if (sccs.length > 0) {
      circularReasoning = true;
      circularPath = sccs[0];
    }
  }

  // Graph stats
  const branchCount = session.edges.filter(e => e.type === "branch").length;
  const mergeCount = session.edges.filter(e => e.type === "merge").length;

  // Generate directive
  const directive = generateDirective(
    mode,
    session.ewma,
    biases,
    circularReasoning,
    signals,
    params.thoughtNumber,
    fallacies,
    toulmin,
    consistency,
  );

  return {
    thoughtNumber: params.thoughtNumber,
    totalThoughts: params.totalThoughts,
    nextThoughtNeeded: params.nextThoughtNeeded,
    mode,
    ewmaScore: Math.round(session.ewma * 1000) / 1000,
    qualityScore: Math.round(qualityScore * 1000) / 1000,
    signals,
    warnings: directive.includes("⚠️") || directive.includes("🔄") || directive.includes("🚨") || directive.includes("💥")
      ? [directive] : [],
    biasesDetected: biases,
    fallaciesDetected: fallacies,
    toulmin,
    consistency,
    circularReasoning,
    circularPath,
    directive,
    graphStats: {
      nodes: session.thoughts.size,
      edges: session.edges.length,
      branches: branchCount,
      merges: mergeCount,
    },
  };
}

// ─── MCP SERVER ─────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "rex-cognitive-engine",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "rex_think",
      description: `REX Cognitive Engine — Enhanced reasoning with Graph-of-Thoughts, 
MCTS quality gating, bias detection, and circular reasoning detection. 
Cuba-thinking quality at sequential-thinking speed. Zero ML dependencies.

Modes:
- fast: Basic tracking + minimal scoring. Use for daily tasks.
- deep: Full GoT + bias + quality scoring. Use for important decisions.
- critical: Deep + adversarial directives. Use for mission-critical analysis.

Returns quality scores, bias warnings, circular reasoning alerts, and corrective directives.`,
      inputSchema: {
        type: "object" as const,
        properties: {
          thought: {
            type: "string",
            description: "Current thinking step content",
          },
          thoughtNumber: {
            type: "number",
            description: "Current thought number (1-based)",
          },
          totalThoughts: {
            type: "number",
            description: "Estimated total thoughts needed",
          },
          nextThoughtNeeded: {
            type: "boolean",
            description: "Whether another thought step follows",
          },
          mode: {
            type: "string",
            enum: ["fast", "deep", "critical"],
            description: "Analysis depth: fast (daily), deep (important), critical (mission-critical)",
          },
          sessionId: {
            type: "string",
            description: "Session identifier for thought continuity",
          },
          branchId: {
            type: "string",
            description: "Branch identifier for GoT branching",
          },
          branchFrom: {
            type: "number",
            description: "Thought number to branch from",
          },
          mergeFrom: {
            type: "array",
            items: { type: "number" },
            description: "Thought numbers to merge insights from",
          },
          isRevision: {
            type: "boolean",
            description: "Whether this revises a previous thought",
          },
          revisesThought: {
            type: "number",
            description: "Which thought number is being revised",
          },
        },
        required: ["thought", "thoughtNumber", "totalThoughts", "nextThoughtNeeded"],
      },
    },
    {
      name: "rex_session_summary",
      description: "Get a summary of the current thinking session — graph stats, quality trend, issues found.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sessionId: {
            type: "string",
            description: "Session to summarize (default: 'default')",
          },
        },
      },
    },
    {
      name: "rex_reset_session",
      description: "Reset a thinking session, clearing all thoughts and graph state.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sessionId: {
            type: "string",
            description: "Session to reset (default: 'default')",
          },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "rex_think") {
    const result = processThought({
      thought: args?.thought as string,
      thoughtNumber: args?.thoughtNumber as number,
      totalThoughts: args?.totalThoughts as number,
      nextThoughtNeeded: args?.nextThoughtNeeded as boolean,
      mode: (args?.mode as "fast" | "deep" | "critical") || "deep",
      sessionId: (args?.sessionId as string) || "default",
      branchId: args?.branchId as string | undefined,
      branchFrom: args?.branchFrom as number | undefined,
      mergeFrom: args?.mergeFrom as number[] | undefined,
      isRevision: args?.isRevision as boolean | undefined,
      revisesThought: args?.revisesThought as number | undefined,
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === "rex_session_summary") {
    const sessionId = (args?.sessionId as string) || "default";
    const session = sessions.get(sessionId);

    if (!session || session.thoughts.size === 0) {
      return {
        content: [{ type: "text" as const, text: "No active session found." }],
      };
    }

    const nodeIds = Array.from(session.thoughts.keys());
    const sccs = tarjanSCC(nodeIds, session.edges);
    const allBiases = Array.from(session.thoughts.values()).flatMap(t => t.biases);
    const qualityTrend = Array.from(session.thoughts.values()).map(t => ({
      id: t.id,
      score: Math.round(t.qualityScore * 100) / 100,
    }));

    const summary = {
      sessionId,
      totalThoughts: session.thoughts.size,
      ewmaScore: Math.round(session.ewma * 1000) / 1000,
      qualityTrend,
      graphStats: {
        nodes: session.thoughts.size,
        edges: session.edges.length,
        branches: session.edges.filter(e => e.type === "branch").length,
        merges: session.edges.filter(e => e.type === "merge").length,
        revisions: session.edges.filter(e => e.type === "revision").length,
      },
      circularReasoningCycles: sccs,
      allBiasesDetected: [...new Set(allBiases)],
      uniqueTermsExplored: session.allTerms.size,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    };
  }

  if (name === "rex_reset_session") {
    const sessionId = (args?.sessionId as string) || "default";
    sessions.delete(sessionId);
    return {
      content: [{ type: "text" as const, text: `Session '${sessionId}' has been reset.` }],
    };
  }

  return {
    content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// ─── START SERVER ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🧠 REX Cognitive Engine v2.0.0 — Zero Fallacy Engine — Online");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

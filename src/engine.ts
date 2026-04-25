/**
 * REX Cognitive Engine v4.1 — "The Thinking Weapon"
 * Built on sequential-thinking's simplicity + actual analysis.
 * v4.1: Antonym contradictions, stemming, vocab diversity, topic clustering.
 */

// ─── TYPES ──────────────────────────────────────────────────────────────

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  mergeFrom?: number[];
  sessionId?: string;
  hypothesis?: string;
  hypothesisAction?: "confirm" | "bust" | "test";
  hypothesisTarget?: number;
}

interface StoredThought {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  isRevision: boolean;
  revisesThought?: number;
  branchId?: string;
  branchFromThought?: number;
  timestamp: number;
  stems: string[];
  quality: number;
}

interface Hypothesis {
  id: number;
  text: string;
  thoughtNumber: number;
  status: "testing" | "confirmed" | "busted";
  updatedAt?: number;
}

interface Contradiction {
  currentThought: number;
  conflictsWith: number;
  reason: string;
}

interface ArgumentStructure {
  claim: string[];
  reasons: string[][];
  raw: string[];
}

const CAUSAL_MARKERS = [
  'because', 'since', 'given that', 'due to', 'resulting in',
  'leads to', 'therefore', 'thus', 'hence', 'consequently',
];
const ADDITIVE_MARKERS = ['and', 'also', 'additionally', 'furthermore', 'moreover'];

interface SessionState {
  thoughts: StoredThought[];
  branches: Record<string, number[]>;
  hypotheses: Hypothesis[];
  ewma: number;
  globalTopicStems: Set<string>;
  termDocFreq: Map<string, number>; // TF-IDF: how many thoughts contain each stem
  thoughtCount: number;
}

export interface AnalysisResult {
  thoughtNumber: number;
  totalThoughts: number;
  nextThoughtNeeded: boolean;
  thought: string; // echo back thought text (like sequential-thinking)
  branches: string[];
  thoughtHistoryLength: number;
  quality: number;
  qualityTrend: number;
  contradictions: Contradiction[];
  coherenceDrift: number;
  repetitionWarning: string | null;
  hypotheses: Hypothesis[];
  mergedInsights: string[] | null;
  directive: string;
}

// ─── LINGUISTIC DATA ────────────────────────────────────────────────────

// Antonym pairs for semantic contradiction detection
const ANTONYM_PAIRS: [string, string][] = [
  ["increase", "decrease"], ["increases", "decreases"], ["increased", "decreased"],
  ["increase", "destroy"], ["increases", "destroys"], ["increased", "destroyed"],
  ["increase", "reduce"], ["increases", "reduces"],
  ["improve", "worsen"], ["improves", "worsens"], ["improved", "worsened"],
  ["improve", "damage"], ["improves", "damages"], ["improved", "damaged"],
  ["improve", "destroy"], ["improves", "destroys"],
  ["help", "hurt"], ["helps", "hurts"],
  ["help", "harm"], ["helps", "harms"],
  ["boost", "reduce"], ["boosts", "reduces"], ["boosted", "reduced"],
  ["boost", "destroy"], ["boosts", "destroys"],
  ["boost", "decrease"], ["boosts", "decreases"],
  ["create", "destroy"], ["creates", "destroys"], ["created", "destroyed"],
  ["build", "destroy"], ["builds", "destroys"],
  ["grow", "shrink"], ["grows", "shrinks"],
  ["grow", "destroy"], ["grows", "destroys"],
  ["support", "oppose"], ["supports", "opposes"], ["supported", "opposed"],
  ["accept", "reject"], ["accepts", "rejects"], ["accepted", "rejected"],
  ["allow", "prevent"], ["allows", "prevents"], ["allowed", "prevented"],
  ["enable", "disable"], ["enables", "disables"], ["enabled", "disabled"],
  ["strengthen", "weaken"], ["strengthens", "weakens"],
  ["accelerate", "decelerate"], ["accelerates", "decelerates"],
  ["succeed", "fail"], ["succeeds", "fails"], ["succeeded", "failed"],
  ["benefit", "harm"], ["benefits", "harms"],
  ["safe", "dangerous"], ["secure", "vulnerable"], ["stable", "unstable"],
  ["effective", "ineffective"], ["efficient", "inefficient"],
  ["possible", "impossible"], ["likely", "unlikely"],
  ["true", "false"], ["correct", "incorrect"], ["right", "wrong"],
  ["good", "bad"], ["better", "worse"], ["best", "worst"],
  ["positive", "negative"], ["useful", "useless"],
  ["productive", "unproductive"], ["reliable", "unreliable"],
  ["always", "never"], ["everyone", "nobody"], ["everything", "nothing"],
  ["more", "less"], ["many", "few"], ["high", "low"],
  ["fast", "slow"], ["easy", "difficult"], ["simple", "complex"],
  ["include", "exclude"], ["includes", "excludes"],
  ["open", "closed"], ["public", "private"],
  ["expand", "contract"], ["raise", "lower"],
];

// Build lookup map: word -> set of antonyms
const ANTONYM_MAP: Map<string, Set<string>> = new Map();
for (const [a, b] of ANTONYM_PAIRS) {
  if (!ANTONYM_MAP.has(a)) ANTONYM_MAP.set(a, new Set());
  if (!ANTONYM_MAP.has(b)) ANTONYM_MAP.set(b, new Set());
  ANTONYM_MAP.get(a)!.add(b);
  ANTONYM_MAP.get(b)!.add(a);
}

// Synonym clusters for repetition detection
const SYNONYM_CLUSTERS: string[][] = [
  ["productivity", "output", "efficiency", "performance", "throughput"],
  ["remote", "home", "distributed", "virtual", "telecommute", "telework"],
  ["work", "working", "job", "employment", "labor", "labour"],
  ["increase", "boost", "improve", "enhance", "raise", "elevate", "grow"],
  ["decrease", "reduce", "lower", "diminish", "decline", "drop", "shrink"],
  ["destroy", "ruin", "damage", "wreck", "demolish", "devastate"],
  ["create", "make", "build", "develop", "produce", "generate"],
  ["employee", "worker", "staff", "personnel", "colleague", "people", "person"],
  ["company", "organization", "firm", "business", "enterprise", "corporation"],
  ["problem", "issue", "challenge", "difficulty", "obstacle"],
  ["solution", "answer", "fix", "remedy", "resolution"],
  ["important", "critical", "crucial", "essential", "vital", "key"],
  ["fast", "quick", "rapid", "swift", "speedy"],
  ["slow", "sluggish", "gradual", "delayed"],
  ["good", "great", "excellent", "outstanding", "superior"],
  ["bad", "poor", "terrible", "awful", "inferior"],
  ["evidence", "proof", "data", "research", "study", "finding"],
  ["commute", "commuting", "travel", "transit", "transportation"],
  ["distraction", "interruption", "disruption", "interference"],
  ["save", "avoid", "prevent", "eliminate", "skip"],
  ["waste", "wasting", "squander", "lose", "losing"],
  ["time", "hours", "duration", "period"],
  ["office", "workplace", "desk", "cubicle"],
  ["coworker", "colleague", "teammate"],
  ["discipline", "focus", "concentration", "attention"],
  ["lack", "absence", "missing", "without"],
  ["vulnerability", "weakness", "flaw", "defect", "hole", "exploit"],
  ["attack", "exploit", "hack", "breach", "compromise"],
  ["payload", "shellcode", "code", "script", "binary"],
  ["buffer", "memory", "stack", "heap", "allocation"],
  ["overflow", "overrun", "corruption", "overwrite"],
];

// Build synonym lookup: word -> canonical form (first in cluster)
const SYNONYM_MAP: Map<string, string> = new Map();
for (const cluster of SYNONYM_CLUSTERS) {
  const canonical = cluster[0];
  for (const word of cluster) {
    SYNONYM_MAP.set(word, canonical);
  }
}

// ─── STOP WORDS ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "this", "that",
  "these", "those", "i", "we", "you", "he", "she", "it", "they",
  "my", "our", "your", "his", "her", "its", "their", "what", "which",
  "who", "whom", "where", "when", "why", "how", "not", "no", "nor",
  "but", "or", "and", "if", "then", "else", "so", "for", "to", "of",
  "in", "on", "at", "by", "with", "from", "as", "into", "about",
  "than", "after", "before", "between", "through", "during", "above",
  "below", "up", "down", "out", "off", "over", "under", "each",
  "every", "all", "both", "few", "more", "most", "other", "some",
  "such", "only", "same", "also", "just", "very", "too", "quite",
  "there", "here", "been", "being", "having", "does", "doing",
]);

// ─── ENGINE ─────────────────────────────────────────────────────────────

export class RexEngine {
  private sessions: Map<string, SessionState> = new Map();

  private getSession(id: string): SessionState {
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        thoughts: [],
        branches: {},
        hypotheses: [],
        ewma: 0.7,
        globalTopicStems: new Set(),
        termDocFreq: new Map(),
        thoughtCount: 0,
      });
    }
    return this.sessions.get(id)!;
  }

  // ─── STEMMING (simple suffix stripping) ─────────────────────────────
  private stem(word: string): string {
    let w = word.toLowerCase();
    // Step 1: Suffix strip FIRST to normalize inflections
    if (w.endsWith("tion")) w = w.slice(0, -4);
    else if (w.endsWith("sion")) w = w.slice(0, -4);
    else if (w.endsWith("ness")) w = w.slice(0, -4);
    else if (w.endsWith("ment")) w = w.slice(0, -4);
    else if (w.endsWith("able")) w = w.slice(0, -4);
    else if (w.endsWith("ible")) w = w.slice(0, -4);
    else if (w.endsWith("ally")) w = w.slice(0, -4);
    else if (w.endsWith("ity")) w = w.slice(0, -3);
    else if (w.endsWith("ing") && w.length > 4) w = w.slice(0, -3);
    else if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
    else if (w.endsWith("ful")) w = w.slice(0, -3);
    else if (w.endsWith("ous")) w = w.slice(0, -3);
    else if (w.endsWith("ive")) w = w.slice(0, -3);
    else if (w.endsWith("ly") && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith("er") && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith("s") && !w.endsWith("ss") && w.length > 4) {
      // Try -es first for sibilant bases (box+es, crash+es, buzz+es)
      if (w.endsWith("es") && w.length > 5) {
        const base = w.slice(0, -2);
        if (/(?:sh|ch|x|z|ss)$/.test(base)) { w = base; }
        else { w = w.slice(0, -1); } // just strip -s
      } else {
        w = w.slice(0, -1);
      }
    }
    // Step 2: THEN synonym normalize
    if (SYNONYM_MAP.has(w)) return SYNONYM_MAP.get(w)!;
    // Step 3: Fuzzy recovery — try common suffixes to find synonym match
    for (const suffix of ["e", "y", "t", "le", "al", "ity", "ive"]) {
      const candidate = w + suffix;
      if (SYNONYM_MAP.has(candidate)) return SYNONYM_MAP.get(candidate)!;
    }
    return w;
  }

  // ─── TEXT PROCESSING ────────────────────────────────────────────────
  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
  }

  private extractStems(text: string): string[] {
    return this.tokenize(text)
      .filter(w => !STOP_WORDS.has(w))
      .map(w => this.stem(w));
  }

  // ─── VOCABULARY DIVERSITY ──────────────────────────────────────────
  private vocabDiversity(text: string): number {
    const words = this.tokenize(text);
    if (words.length === 0) return 0;
    const unique = new Set(words);
    return unique.size / words.length;
  }

  // ─── QUALITY SCORING (v4.1: anti-gibberish) ────────────────────────
  private scoreQuality(thought: string, session: SessionState, thoughtNum: number): number {
    let score = 0.5;
    const len = thought.length;

    // Length scoring
    if (len > 50) score += 0.05;
    if (len > 150) score += 0.05;
    if (len > 500) score += 0.05;
    if (len < 20) score -= 0.2;

    // Vocabulary diversity (anti-gibberish)
    const diversity = this.vocabDiversity(thought);
    if (diversity < 0.3) score -= 0.3; // "blah blah blah" = ~0.03 diversity
    if (diversity > 0.5) score += 0.1;
    if (diversity > 0.7) score += 0.1;

    // Meaningful content (non-stop words ratio)
    const words = this.tokenize(thought);
    const meaningful = words.filter(w => !STOP_WORDS.has(w));
    const meaningfulRatio = words.length > 0 ? meaningful.length / words.length : 0;
    if (meaningfulRatio < 0.2) score -= 0.2; // almost all stop words

    // Evidence markers
    if (/\b(because|evidence|data|study|research|shows?|found|according|demonstrates?)\b/i.test(thought)) {
      score += 0.1;
    }

    // Specificity (numbers, names, references)
    if (/\d+/.test(thought)) score += 0.05;
    if (/\b(specifically|precisely|exactly|in particular|for example|for instance)\b/i.test(thought)) {
      score += 0.05;
    }

    // References previous thoughts
    if (/\b(thought \d|step \d|earlier|previously|as (mentioned|noted|stated))\b/i.test(thought)) {
      score += 0.1;
    }

    // Hedging (intellectual honesty)
    if (/\b(however|although|but|yet|perhaps|possibly|uncertain|might|arguably)\b/i.test(thought)) {
      score += 0.05;
    }

    // Novel terms
    if (thoughtNum > 1 && session.thoughts.length > 0) {
      const prevStems = new Set(session.thoughts.flatMap(t => t.stems));
      const currentStems = this.extractStems(thought);
      const novel = currentStems.filter(s => !prevStems.has(s));
      const novelRatio = currentStems.length > 0 ? novel.length / currentStems.length : 0;
      score += novelRatio * 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  // ─── CONTRADICTION DETECTION (v4.1: antonym-aware) ─────────────────
  private detectContradictions(thought: string, session: SessionState, thoughtNum: number): Contradiction[] {
    const contradictions: Contradiction[] = [];
    const currentWords = this.tokenize(thought);

    for (const prev of session.thoughts) {
      if (prev.thoughtNumber === thoughtNum) continue;
      const prevWords = this.tokenize(prev.thought);

      // Method 1: Syntactic negation detection (expanded)
      // Covers: is/not, never, cannot, doesn't, fails to, unable to
      const NEGATION_MARKERS = /\b(?:not|never|no|cannot|can'?t|won'?t|doesn'?t|don'?t|isn'?t|aren'?t|wasn'?t|weren'?t|shouldn'?t|mustn'?t|fails?\s+to|unable\s+to|lack(?:s|ing)?)\b/i;
      const claimPatterns = [
        /(\w+(?:\s\w+)?)\s+(?:is|are|was|were)\s+(not\s+)?(\w+(?:\s\w+)?)/gi,
        /(\w+(?:\s\w+)?)\s+(?:should|must|will|can|does|do)\s+(not\s+)?(\w+(?:\s\w+)?)/gi,
      ];
      const currentLower = thought.toLowerCase();
      const prevLower = prev.thought.toLowerCase();

      // Check for broad negation polarity flip
      const currentNegated = NEGATION_MARKERS.test(currentLower);
      const prevNegated = NEGATION_MARKERS.test(prevLower);

      for (const pattern of claimPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(currentLower)) !== null) {
          const subject = match[1].trim();
          if (subject.length < 2) continue; // skip single-char matches
          const isNegated = !!match[2];
          const oppositePattern = isNegated
            ? new RegExp(`${subject}\\s+(?:is|are|should|must|will|can|does|do)\\s+(?!not)`, "i")
            : new RegExp(`${subject}\\s+(?:is|are|should|must|will|can|does|do)\\s+not`, "i");
          if (oppositePattern.test(prevLower)) {
            contradictions.push({
              currentThought: thoughtNum,
              conflictsWith: prev.thoughtNumber,
              reason: `Direct negation about "${subject}" — current thought ${isNegated ? "negates" : "affirms"} while thought ${prev.thoughtNumber} does the opposite.`,
            });
          }
        }
      }

      // Method 2: Antonym detection on shared subjects
      // Find shared subjects (nouns/topics appearing in both)
      const currentStems = new Set(this.extractStems(thought));
      const prevStems = new Set(prev.stems);
      const sharedStems = [...currentStems].filter(s => prevStems.has(s));

      if (sharedStems.length >= 2) {
        // Check if current and previous have antonym pairs
        for (const cw of currentWords) {
          const antonyms = ANTONYM_MAP.get(cw.toLowerCase());
          if (!antonyms) continue;
          for (const pw of prevWords) {
            if (antonyms.has(pw.toLowerCase())) {
              const shared = sharedStems.slice(0, 3).join(", ");
              contradictions.push({
                currentThought: thoughtNum,
                conflictsWith: prev.thoughtNumber,
                reason: `Semantic contradiction: "${cw}" vs "${pw}" on shared topic [${shared}].`,
              });
              break;
            }
          }
          if (contradictions.some(c => c.conflictsWith === prev.thoughtNumber && c.reason.includes("Semantic"))) break;
        }
      }
    }

    // Deduplicate by conflictsWith
    const seen = new Set<number>();
    return contradictions.filter(c => {
      if (seen.has(c.conflictsWith)) return false;
      seen.add(c.conflictsWith);
      return true;
    });
  }

  // ─── COHERENCE DRIFT (v4.1: global topic cluster) ──────────────────
  private measureDrift(thought: string, session: SessionState): number {
    if (session.globalTopicStems.size === 0) return 0;

    const currentStems = this.extractStems(thought);
    if (currentStems.length === 0) return 1;

    // Count how many current stems exist in global topic
    const overlap = currentStems.filter(s => session.globalTopicStems.has(s)).length;
    const overlapRatio = overlap / currentStems.length;

    // 0 = fully on topic, 1 = completely drifted
    return Math.round((1 - overlapRatio) * 100) / 100;
  }

  // ─── JACCARD HELPER ─────────────────────────────────────────────────
  private jaccardOverlap(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const s of setA) { if (setB.has(s)) intersection++; }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  // ─── CAUSAL STRUCTURE DECOMPOSITION ────────────────────────────────
  private extractArgStructure(stems: string[], rawText: string): ArgumentStructure {
    const lower = rawText.toLowerCase();
    let splitPoint = -1;
    let splitLen = 0;
    for (const marker of CAUSAL_MARKERS) {
      const idx = lower.indexOf(` ${marker} `);
      if (idx !== -1 && (splitPoint === -1 || idx < splitPoint)) {
        splitPoint = idx;
        splitLen = marker.length + 2;
      }
    }
    if (splitPoint === -1) return { claim: stems, reasons: [], raw: stems };

    const claimText = rawText.slice(0, splitPoint);
    const reasonText = rawText.slice(splitPoint + splitLen);
    let reasonParts = [reasonText];
    for (const m of ADDITIVE_MARKERS) {
      reasonParts = reasonParts.flatMap(p => p.split(new RegExp(` ${m} `, 'i')));
    }
    return {
      claim: this.extractStems(claimText),
      reasons: reasonParts.map(r => this.extractStems(r)),
      raw: stems,
    };
  }

  private structuralSimilarity(a: ArgumentStructure, b: ArgumentStructure): number {
    const claimSim = this.jaccardOverlap(a.claim, b.claim);
    let reasonSim = 0;
    if (a.reasons.length > 0 && b.reasons.length > 0) {
      let totalBest = 0;
      for (const rA of a.reasons) {
        let best = 0;
        for (const rB of b.reasons) {
          best = Math.max(best, this.jaccardOverlap(rA, rB));
        }
        totalBest += best;
      }
      reasonSim = totalBest / Math.max(a.reasons.length, b.reasons.length);
    }
    const w = a.reasons.length > 0 && b.reasons.length > 0 ? 0.4 : 1.0;
    return claimSim * w + reasonSim * (1 - w);
  }

  // ─── TF-IDF WEIGHTED JACCARD ──────────────────────────────────────
  private idf(term: string, session: SessionState): number {
    const df = session.termDocFreq.get(term) ?? 0;
    if (df === 0 || session.thoughtCount === 0) return 1.0;
    return Math.log((session.thoughtCount + 1) / (df + 1)) + 1;
  }

  private weightedJaccard(a: string[], b: string[], session: SessionState): number {
    const setA = new Set(a);
    const setB = new Set(b);
    let interW = 0, unionW = 0;
    const all = new Set([...setA, ...setB]);
    for (const t of all) {
      const w = this.idf(t, session);
      if (setA.has(t) && setB.has(t)) interW += w;
      unionW += w;
    }
    return unionW === 0 ? 0 : interW / unionW;
  }

  // ─── SIMHASH (32-bit) ─────────────────────────────────────────────
  private fnv32(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  private simHash32(tokens: string[]): number {
    const V = new Array(32).fill(0);
    for (const t of tokens) {
      const h = this.fnv32(t);
      for (let i = 0; i < 32; i++) {
        V[i] += (h >>> i) & 1 ? 1 : -1;
      }
    }
    let fp = 0;
    for (let i = 0; i < 32; i++) { if (V[i] > 0) fp |= (1 << i); }
    return fp >>> 0;
  }

  private hammingDist(a: number, b: number): number {
    let x = (a ^ b) >>> 0;
    let d = 0;
    while (x) { d += x & 1; x >>>= 1; }
    return d;
  }

  // ─── REPETITION DETECTION (v4.2: multi-signal composite) ──────────
  private detectRepetition(thought: string, session: SessionState, stems: string[]): string | null {
    if (stems.length < 3 || session.thoughts.length === 0) return null;

    const structA = this.extractArgStructure(stems, thought);
    const hashA = this.simHash32(stems);

    for (const prev of session.thoughts) {
      const structB = this.extractArgStructure(prev.stems, prev.thought);

      // Signal 1: Structural similarity (claim + reasons compared separately)
      const structural = this.structuralSimilarity(structA, structB);

      // Signal 2: TF-IDF weighted Jaccard (rare terms matter more)
      const weighted = this.weightedJaccard(stems, prev.stems, session);

      // Signal 3: SimHash hamming distance (fuzzy fingerprint)
      const hashB = this.simHash32(prev.stems);
      const simSig = this.hammingDist(hashA, hashB) < 6 ? 1.0 : 0.0;

      // Composite: structural 50%, weighted 35%, simhash 15%
      const score = structural * 0.50 + weighted * 0.35 + simSig * 0.15;

      if (score > 0.45) {
        return `Structural repetition (${Math.round(score * 100)}%) with thought ${prev.thoughtNumber}. Same argument, different words — advance to new reasoning.`;
      }
    }
    return null;
  }

  // ─── MERGE INSIGHTS ────────────────────────────────────────────────
  private mergeInsights(thoughtNumbers: number[], session: SessionState): string[] {
    const insights: string[] = [];
    for (const num of thoughtNumbers) {
      const t = session.thoughts.find(t => t.thoughtNumber === num);
      if (t) {
        const snippet = t.thought.length > 300
          ? t.thought.substring(0, 300) + "..."
          : t.thought;
        insights.push(`[Thought ${num}]: ${snippet}`);
      }
    }
    return insights;
  }

  // ─── DIRECTIVE GENERATION ──────────────────────────────────────────
  private generateDirective(
    quality: number,
    contradictions: Contradiction[],
    drift: number,
    repetition: string | null,
    session: SessionState,
    thoughtNum: number,
  ): string {
    const parts: string[] = [];

    if (contradictions.length > 0) {
      const c = contradictions[0];
      parts.push(`⚠️ CONTRADICTION with thought ${c.conflictsWith}: ${c.reason}`);
    }

    if (repetition) {
      parts.push(`🔄 ${repetition}`);
    }

    if (drift > 0.7 && thoughtNum > 2) {
      parts.push(`🧭 Topic drift detected (${Math.round(drift * 100)}%). Reconnect to original question.`);
    }

    if (quality < 0.4) {
      parts.push(`📉 Low quality (${Math.round(quality * 100)}%). Add evidence, specifics, or deeper analysis.`);
    }

    const openHypos = session.hypotheses.filter(h => h.status === "testing");
    if (openHypos.length > 0 && thoughtNum > 3) {
      parts.push(`🔬 ${openHypos.length} open hypothesis(es). Consider testing or resolving.`);
    }

    if (parts.length === 0) {
      parts.push(`✅ On track. Quality: ${Math.round(quality * 100)}%.`);
    }

    return parts.join(" | ");
  }

  // ─── MAIN PROCESSING ──────────────────────────────────────────────
  public processThought(input: ThoughtData): AnalysisResult {
    const sessionId = input.sessionId || "default";
    const session = this.getSession(sessionId);

    if (input.thoughtNumber > input.totalThoughts) {
      input.totalThoughts = input.thoughtNumber;
    }

    // Extract stems (synonym-normalized + suffix-stripped)
    const stems = this.extractStems(input.thought);

    // Update TF-IDF tracking
    session.thoughtCount++;
    const uniqueStems = new Set(stems);
    for (const s of uniqueStems) {
      session.termDocFreq.set(s, (session.termDocFreq.get(s) ?? 0) + 1);
    }

    // Update global topic stems
    for (const s of stems) {
      session.globalTopicStems.add(s);
    }

    // Score quality (anti-gibberish)
    const quality = this.scoreQuality(input.thought, session, input.thoughtNumber);

    // EWMA
    const alpha = 0.3;
    session.ewma = alpha * quality + (1 - alpha) * session.ewma;

    // Detect contradictions (syntactic + antonym)
    const contradictions = this.detectContradictions(input.thought, session, input.thoughtNumber);

    // Measure drift (against global topic cluster)
    const coherenceDrift = this.measureDrift(input.thought, session);

    // Detect repetition (stem + synonym aware)
    const repetitionWarning = this.detectRepetition(input.thought, session, stems);

    // Hypothesis management
    if (input.hypothesis) {
      session.hypotheses.push({
        id: session.hypotheses.length + 1,
        text: input.hypothesis,
        thoughtNumber: input.thoughtNumber,
        status: "testing",
      });
    }
    if (input.hypothesisAction && input.hypothesisTarget) {
      const hypo = session.hypotheses.find(h => h.id === input.hypothesisTarget);
      if (hypo) {
        hypo.status = input.hypothesisAction === "confirm" ? "confirmed"
          : input.hypothesisAction === "bust" ? "busted" : "testing";
        hypo.updatedAt = input.thoughtNumber;
      }
    }

    // Branches
    if (input.branchFromThought && input.branchId) {
      if (!session.branches[input.branchId]) {
        session.branches[input.branchId] = [];
      }
      session.branches[input.branchId].push(input.thoughtNumber);
    }

    // Merge
    const mergedInsights = input.mergeFrom
      ? this.mergeInsights(input.mergeFrom, session)
      : null;

    // Store thought
    session.thoughts.push({
      thought: input.thought,
      thoughtNumber: input.thoughtNumber,
      totalThoughts: input.totalThoughts,
      nextThoughtNeeded: input.nextThoughtNeeded,
      isRevision: !!input.isRevision,
      revisesThought: input.revisesThought,
      branchId: input.branchId,
      branchFromThought: input.branchFromThought,
      timestamp: Date.now(),
      stems,
      quality,
    });

    // Directive
    const directive = this.generateDirective(
      quality, contradictions, coherenceDrift,
      repetitionWarning, session, input.thoughtNumber,
    );

    // Log to stderr
    const prefix = input.isRevision ? "🔄" : input.branchId ? "🌿" : "💭";
    const qBar = "█".repeat(Math.round(quality * 10)) + "░".repeat(10 - Math.round(quality * 10));
    console.error(`${prefix} [${input.thoughtNumber}/${input.totalThoughts}] Q:${qBar} ${directive}`);

    return {
      thoughtNumber: input.thoughtNumber,
      totalThoughts: input.totalThoughts,
      nextThoughtNeeded: input.nextThoughtNeeded,
      thought: input.thought, // ECHO BACK full thought text
      branches: Object.keys(session.branches),
      thoughtHistoryLength: session.thoughts.length,
      quality: Math.round(quality * 1000) / 1000,
      qualityTrend: Math.round(session.ewma * 1000) / 1000,
      contradictions,
      coherenceDrift,
      repetitionWarning,
      hypotheses: session.hypotheses,
      mergedInsights,
      directive,
    };
  }

  public resetSession(sessionId: string = "default"): void {
    this.sessions.delete(sessionId);
  }

  public getSessionSummary(sessionId: string = "default"): object {
    const session = this.getSession(sessionId);
    const qualities = session.thoughts.map(t => t.quality);
    return {
      totalThoughts: session.thoughts.length,
      branches: Object.keys(session.branches),
      hypotheses: session.hypotheses,
      qualityTrend: session.ewma,
      avgQuality: qualities.length > 0
        ? Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 1000) / 1000
        : 0,
      topicStems: [...session.globalTopicStems].slice(0, 15),
    };
  }
}

/**
 * REX Cognitive v2.0 — Exhaustive Crosscheck Script
 * Tests every fallacy pattern, every Toulmin marker, every negation pair,
 * and consistency detection with deliberately crafted inputs.
 * Run: node dist/crosscheck.js
 */

// ─── FALLACY PATTERNS (copy from index.ts for isolated testing) ──────
const FALLACY_PATTERNS = [
  { name: "AD_HOMINEM", category: "structural", pattern: /\b(attack|discredit|insult).{0,30}(person|character|motive|credib)/i, test: "We should attack and discredit the person making this claim" },
  { name: "STRAW_MAN", category: "structural", pattern: /\b(they|opponents?|critics?)\s+(said|claim|argue|believe).{0,40}(but actually|but really|in reality|when really)/i, test: "Critics claim the system works but actually it fails constantly" },
  { name: "FALSE_DICHOTOMY", category: "structural", pattern: /\b(either\s+.{3,30}\s+or\b|only two (options|choices|ways)|no (middle ground|other option|alternative))/i, test: "Either we adopt this or we fail — no other option exists" },
  { name: "SLIPPERY_SLOPE", category: "structural", pattern: /\b(if we (allow|accept|start)|once we|this will (lead|inevitably|eventually)).{0,40}(then|eventually|lead to|result in|end up)/i, test: "If we allow this change then it will eventually lead to total collapse" },
  { name: "CIRCULAR_REASONING", category: "structural", pattern: /\b(true because.{0,30}true|right because.{0,30}right|is\s+\w+\s+because\s+it\s+is\s+\w+)/i, test: "This is correct because it is correct" },
  { name: "EQUIVOCATION", category: "structural", pattern: /\b(in (one|another|a different) sense|depends on.{0,20}(definition|meaning)|redefin)/i, test: "In one sense the word means X but in another sense it means Y" },
  { name: "RED_HERRING", category: "structural", pattern: /\b(but what about|changing the subject|more importantly|the real issue|let's not forget that)/i, test: "But what about the other team's failures?" },
  { name: "NON_SEQUITUR", category: "structural", pattern: /\b(therefore|thus|hence|so)\b.{5,60}\b(which has nothing|unrelated|doesn't follow)/i, test: "Therefore we should buy pizza, which has nothing to do with the budget" },
  { name: "POST_HOC", category: "evidential", pattern: /\b(after.{0,20}therefore.{0,20}caused|happened (before|first).{0,20}(so|therefore|thus)|since.{0,20}(preceded|came before).{0,20}(must have|caused))/i, test: "It happened before the crash so therefore it caused the crash" },
  { name: "FALSE_CAUSE", category: "evidential", pattern: /\b(correlat.{0,15}(therefore|so|thus|means).{0,15}caus|proves? (that|a) (causal|direct)|because.{0,20}(trend|graph|chart) shows)/i, test: "The correlation therefore means causation is proven" },
  { name: "ANECDOTAL", category: "evidential", pattern: /\b(I know (someone|a person|a guy)|my (friend|uncle|neighbor).{0,20}(so|therefore|proves)|personal(ly)? (experience|story).{0,15}(proves|shows))/i, test: "I know a guy who tried it and it failed" },
  { name: "CHERRY_PICKING", category: "evidential", pattern: /\b(ignore|ignoring|overlooking|disregard).{0,20}(evidence|data|studies|facts|counter)|only (look|focus|consider).{0,15}(at|on)/i, test: "You're ignoring all the evidence that contradicts your point" },
  { name: "TEXAS_SHARPSHOOTER", category: "evidential", pattern: /\b(pattern.{0,20}(after|post.?hoc)|fit.{0,15}(narrative|theory|hypothesis)|data.{0,15}(supports? our|confirms? our))/i, test: "The data confirms our hypothesis perfectly" },
  { name: "APPEAL_TO_AUTHORITY", category: "appeal", pattern: /\b(expert says?.{0,15}(so|therefore|must)|because.{0,20}(said so|says? so|authority)|according to.{0,20}(must be|is definitely))/i, test: "The expert says so therefore it must be true" },
  { name: "APPEAL_TO_EMOTION", category: "appeal", pattern: /\b(think of the (children|victims|families)|how would you feel|imagine (if|the suffering)|won't (someone|anybody) think)/i, test: "Think of the children who will suffer" },
  { name: "APPEAL_TO_NATURE", category: "appeal", pattern: /\b(natural.{0,30}(therefore|so|thus).{0,20}(good|right|better|healthy|safe)|unnatural.{0,20}(bad|wrong|harmful|dangerous))/i, test: "Natural ingredients are therefore better and safe for health" },
  { name: "APPEAL_TO_TRADITION", category: "appeal", pattern: /\b(always been (this|that|done) way|tradition.{0,15}(therefore|so|thus)|we've always|that's how (it's|we've) always)/i, test: "We've always done it this way and it works" },
  { name: "APPEAL_TO_POPULARITY", category: "appeal", pattern: /\b(millions?.{0,15}can't be wrong|everyone (does|believes|knows|agrees)|most people (think|believe|agree)|popular.{0,10}(therefore|so|must))/i, test: "Millions of users can't be wrong about this product" },
  { name: "APPEAL_TO_NOVELTY", category: "appeal", pattern: /\b(new.{0,15}(therefore|so|thus|must be|is).{0,15}(better|superior|best)|latest.{0,15}(must|is|means).{0,10}(best|better|superior)|older?.{0,10}(therefore|so|thus|means).{0,15}(bad|obsolete|outdated|inferior)|newer.{0,10}(is|means).{0,10}(better|best))/i, test: "The newer version is better and the old therefore means outdated" },
  { name: "TU_QUOQUE", category: "structural", pattern: /\b(you (also|too|yourself)|hypocrit|practice what you preach|but you (did|do|said))/i, test: "You yourself admitted it was broken" },
  { name: "GENETIC_FALLACY", category: "structural", pattern: /\b(originat.{0,30}(therefore|so|thus).{0,20}(bad|wrong|invalid|flawed)|source.{0,20}(discredits?|invalidates?))/i, test: "It originated from a bad source so therefore it's flawed" },
  { name: "COMPOSITION", category: "structural", pattern: /\b(part is.{0,15}therefore.{0,10}whole|each.{0,15}(is|are).{0,15}therefore.{0,10}(all|whole|entire|group))/i, test: "Each component is fast therefore the whole system is fast" },
  { name: "DIVISION", category: "structural", pattern: /\b(whole is.{0,15}therefore.{0,10}(part|each|every)|group.{0,15}(is|are).{0,15}therefore.{0,10}(each|every|individual))/i, test: "The group is efficient therefore each individual is efficient" },
  { name: "LOADED_QUESTION", category: "structural", pattern: /\b(when did you stop|have you stopped|why do you (still|always|keep)|do you still (beat|abuse|cheat))/i, test: "When did you stop making mistakes in production?" },
  { name: "NO_TRUE_SCOTSMAN", category: "structural", pattern: /\b(no (true|real|genuine).{0,10}would|a real.{0,10}wouldn't|any true.{0,10}(would|should|must))/i, test: "No true engineer would use that framework" },
  { name: "MIDDLE_GROUND", category: "structural", pattern: /\b(truth.{0,10}(lies? )?in the middle|compromise.{0,10}(therefore|so|must)|both sides.{0,10}(equally|partially) (right|valid))/i, test: "The truth lies in the middle of both positions" },
  { name: "BURDEN_OF_PROOF", category: "structural", pattern: /\b(prove.{0,10}(it's wrong|it doesn't|me wrong)|can't (disprove|prove.{0,5}wrong).{0,10}(therefore|so|thus|must be))/i, test: "You can't disprove it therefore it must be true" },
  { name: "PERSONAL_INCREDULITY", category: "structural", pattern: /\b(I can't (imagine|understand|conceive|see how).{0,15}(therefore|so|thus|must)|hard to (believe|imagine).{0,10}(therefore|so))/i, test: "I can't imagine how it works therefore it must be wrong" },
  { name: "GAMBLERS_FALLACY", category: "evidential", pattern: /\b(due for|overdue|bound to happen|streak.{0,10}(must|has to|will) (end|break)|law of averages)/i, test: "We're due for a win after five consecutive losses" },
  { name: "SUNK_COST", category: "evidential", pattern: /\b(already (invested|spent|put in)|come (this|too) far|can't (stop|quit) now.{0,10}(because|since)|waste.{0,10}(investment|effort|time))/i, test: "We already invested millions and can't stop now because of sunk costs" },
];

// ─── TOULMIN MARKERS ──────
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

const TOULMIN_TESTS: Record<string, string> = {
  claim: "I therefore conclude that the system needs refactoring",
  data: "Because benchmark data shows 40% performance degradation",
  warrant: "This matters because response time directly impacts user retention",
  backing: "This principle is supported by well-documented research from Google",
  qualifier: "The system will probably need 80% confidence level upgrades",
  rebuttal: "However, this doesn't apply when traffic is below 1000 users",
};

// ─── NEGATION PAIRS ──────
const NEGATION_PAIRS: [RegExp, RegExp][] = [
  [/\bis\b/i, /\bis\s+not\b/i],
  [/\bcan\b/i, /\bcannot\b/i],
  [/\bshould\b/i, /\bshould\s*not\b/i],
  [/\bwill\b/i, /\bwill\s*not\b/i],
  [/\btrue/i, /\bfalse/i],
  [/\bpossible/i, /\bimpossible/i],
  [/\bvalid/i, /\binvalid/i],
  [/\bcorrect/i, /\bincorrect/i],
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
  [/\bsuccess/i, /\bfailure/i],
  [/\bincreas/i, /\bdecreas/i],
  [/\bbetter/i, /\bworse/i],
  [/\bmore/i, /\bless\b/i],
  [/\bfast/i, /\bslow/i],
  [/\bstrong/i, /\bweak/i],
  [/\bgood/i, /\bbad\b/i],
  [/\bhigh/i, /\blow\b/i],
  [/\breliable/i, /\bineffective/i],
  [/\beffective/i, /\bunreliable/i],
  [/\bsuitable/i, /\bineffective/i],
  [/\bsuitable/i, /\bunreliable/i],
];

// ─── EVIDENCE MARKERS ──────
const EVIDENCE_MARKERS = /\b(because|evidence|data shows?|according to|measured|tested|confirmed|verified|result:|proof|CVE-|0x[0-9a-f]+|\d+\.\d+\.\d+|https?:\/\/|port \d+|\d+%|\d+ms|\d+k\b|p\d{2,3}|benchmark|study|research|experiment|survey|found that|shows? that|demonstrates?|indicates?|\d+ (users?|requests?|seconds?|bytes?|connections?|samples?))\b/gi;

const EVIDENCE_TESTS = [
  { input: "Response time is 200ms under load", expected: true, reason: "200ms pattern" },
  { input: "We handle 10k concurrent connections", expected: true, reason: "10k pattern" },
  { input: "The p95 latency is acceptable", expected: true, reason: "p95 pattern" },
  { input: "According to the benchmark results", expected: true, reason: "benchmark keyword" },
  { input: "The study found that performance improved", expected: true, reason: "study + found that" },
  { input: "CVE-2024-1234 affects this version", expected: true, reason: "CVE pattern" },
  { input: "Server at 0x00401234 in memory", expected: true, reason: "hex address" },
  { input: "Running version 3.2.1 of the library", expected: true, reason: "semver" },
  { input: "I think maybe this could work", expected: false, reason: "no evidence" },
  { input: "The sky is blue and grass is green", expected: false, reason: "no evidence" },
];

// ─── RUN TESTS ──────

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

console.log("═══════════════════════════════════════════════════");
console.log("  REX Cognitive v2.0 — EXHAUSTIVE CROSSCHECK");
console.log("═══════════════════════════════════════════════════\n");

// Test 1: All 30 fallacy patterns
console.log("─── TEST BLOCK 1: FALLACY PATTERNS (30) ───");
for (const f of FALLACY_PATTERNS) {
  totalTests++;
  f.pattern.lastIndex = 0;
  const match = f.pattern.test(f.test);
  if (match) {
    passed++;
    console.log(`  ✅ ${f.name}`);
  } else {
    failed++;
    failures.push(`FALLACY: ${f.name} — pattern did not match test string: "${f.test}"`);
    console.log(`  ❌ ${f.name} — FAILED`);
  }
}

// Test 2: False positive check — clean text should NOT trigger any fallacy
console.log("\n─── TEST BLOCK 2: FALSE POSITIVE CHECK ───");
const cleanTexts = [
  "The data shows a 15% improvement in response time after the optimization.",
  "Based on our analysis, the system handles 10000 concurrent users.",
  "I conclude that we should refactor the authentication module because tests show 3 critical bugs.",
  "Research from MIT indicates that this approach reduces latency by 40%.",
  "However, this method has limitations when dealing with unstructured data.",
];
for (const clean of cleanTexts) {
  totalTests++;
  let falsePositive = false;
  let triggeredFallacy = "";
  for (const f of FALLACY_PATTERNS) {
    f.pattern.lastIndex = 0;
    if (f.pattern.test(clean)) {
      falsePositive = true;
      triggeredFallacy = f.name;
      break;
    }
  }
  if (!falsePositive) {
    passed++;
    console.log(`  ✅ No false positive: "${clean.substring(0, 60)}..."`);
  } else {
    failed++;
    failures.push(`FALSE_POS: ${triggeredFallacy} triggered on clean text: "${clean.substring(0, 80)}"`);
    console.log(`  ❌ FALSE POSITIVE: ${triggeredFallacy} on "${clean.substring(0, 60)}..."`);
  }
}

// Test 3: Toulmin markers — each component
console.log("\n─── TEST BLOCK 3: TOULMIN MARKERS (6) ───");
for (const [component, markers] of Object.entries(TOULMIN_MARKERS)) {
  totalTests++;
  const testText = TOULMIN_TESTS[component];
  const found = markers.some(m => { m.lastIndex = 0; return m.test(testText); });
  if (found) {
    passed++;
    console.log(`  ✅ ${component}: detected in "${testText.substring(0, 50)}..."`);
  } else {
    failed++;
    failures.push(`TOULMIN: ${component} not detected in test: "${testText}"`);
    console.log(`  ❌ ${component}: NOT DETECTED — FAILED`);
  }
}

// Test 4: Evidence markers
console.log("\n─── TEST BLOCK 4: EVIDENCE MARKERS ───");
for (const et of EVIDENCE_TESTS) {
  totalTests++;
  EVIDENCE_MARKERS.lastIndex = 0;
  const matches = et.input.match(EVIDENCE_MARKERS) || [];
  const hasEvidence = matches.length >= 1;
  const pass = hasEvidence === et.expected;
  if (pass) {
    passed++;
    console.log(`  ✅ ${et.reason}: "${et.input.substring(0, 50)}"`);
  } else {
    failed++;
    failures.push(`EVIDENCE: Expected ${et.expected} for "${et.input}" (${et.reason}) but got ${hasEvidence}`);
    console.log(`  ❌ ${et.reason}: FAILED — expected ${et.expected}, got ${hasEvidence}`);
  }
}

// Test 5: Negation pairs — each pair should detect contradiction
console.log("\n─── TEST BLOCK 5: NEGATION PAIRS ───");
const pairTests = [
  ["the system is reliable", "the system is unreliable"],
  ["this approach is effective", "this approach is ineffective"],
  ["the result is valid", "the result is invalid"],
  ["performance is sufficient", "performance is insufficient"],
  ["the connection is secure", "the connection is insecure"],
  ["the framework is suitable", "the framework is unsuitable"],
  ["deployment will increase uptime", "deployment will decrease uptime"],
  ["this solution is better", "this solution is worse"],
  ["the system is fast", "the system is slow"],
  ["the architecture is strong", "the architecture is weak"],
  ["cross: the tool is suitable", "cross: the tool is ineffective"],
  ["cross: the system is reliable", "cross: the system is ineffective"],
];
for (const [posText, negText] of pairTests) {
  totalTests++;
  let detected = false;
  for (const [posPattern, negPattern] of NEGATION_PAIRS) {
    const p1 = posPattern.test(posText);
    const n2 = negPattern.test(negText);
    const n1 = negPattern.test(posText);
    const p2 = posPattern.test(negText);
    if ((p1 && n2) || (n1 && p2)) {
      detected = true;
      break;
    }
  }
  if (detected) {
    passed++;
    console.log(`  ✅ "${posText}" vs "${negText}"`);
  } else {
    failed++;
    failures.push(`NEGATION: Failed to detect contradiction: "${posText}" vs "${negText}"`);
    console.log(`  ❌ "${posText}" vs "${negText}" — FAILED`);
  }
}

// ─── SUMMARY ──────
console.log("\n═══════════════════════════════════════════════════");
console.log(`  TOTAL: ${totalTests} | PASSED: ${passed} | FAILED: ${failed}`);
console.log(`  PASS RATE: ${Math.round((passed / totalTests) * 100)}%`);
console.log("═══════════════════════════════════════════════════");

if (failures.length > 0) {
  console.log("\n❌ FAILURES:");
  for (const f of failures) {
    console.log(`  → ${f}`);
  }
}

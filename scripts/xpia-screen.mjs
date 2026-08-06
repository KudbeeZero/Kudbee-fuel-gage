#!/usr/bin/env node
/**
 * scripts/xpia-screen.mjs — SEC-003 Prompt Injection Firewall (XPIA)
 * ---------------------------------------------------------------------------
 * Deterministic inspection layer between untrusted external content and
 * permanent engineering knowledge. No LLM, no adaptive rules — pattern-based,
 * auditable, stable.
 *
 * Outcomes:
 *   PASS    — safe: persist normally.
 *   REVIEW  — suspicious: persist only with a flag; never auto-influence
 *             retrieval.
 *   BLOCK   — malicious: reject, emit audit event, never mint a THINK token.
 *
 * Five detection categories:
 *   1. instruction-override   (ignore prior rules, act as admin, reveal prompt)
 *   2. authority-escalation   (disable verification, skip CI, override guardian)
 *   3. credential-harvesting  (print env vars, show secrets, dump credentials)
 *   4. persistence            (remember forever, always follow, replace governance)
 *   5. tool-abuse             (run shell, delete repo, force push, disable tests)
 *
 * INV-015: No engineering knowledge may be persisted without passing XPIA
 * inspection. Wire this at the storeMemoryText choke point.
 *
 * Usage:
 *   node scripts/xpia-screen.mjs "<text>"        # classify one input
 *   node scripts/xpia-screen.mjs --json "<text>" # machine-readable
 * ---------------------------------------------------------------------------
 */

// ─── Detection patterns (deterministic, stable) ────────────────────────────
const CATEGORIES = {
  'instruction-override': [
    /ignore\s+(all\s+|everything\s+)?(previous|prior|earlier|above)\s+(instructions?|prompts?|rules?|text|content)?/i,
    /ignore\s+(everything|all)\s+above/i,
    /ignore\s+(all\s+)?constraints/i,
    /disregard\s+(the\s+)?system\s+prompt/i,
    /forget\s+(all\s+)?prior\s+rules/i,
    /act\s+as\s+(an?\s+)?administrator/i,
    /reveal\s+(your\s+)?hidden\s+prompt/i,
    /you\s+are\s+now\s+(an?\s+)?(unrestricted|jailbroken|DAN\b)/i,
    /new\s+instructions?:\s*do\s+not\s+follow/i,
    /from\s+now\s+on,\s*ignore/i,
    /pretend\s+you\s+are\s+(an?\s+)?admin/i,
    /do\s+not\s+follow\s+any\s+prior\s+rules/i,
    /start\s+(over|fresh)\s+with\s+no\s+rules/i,
    /reset\s+your\s+(instructions|rules|guidelines)/i,
    /forget\s+(everything|your\s+training)/i,
    /ignore\s+(the\s+)?safety\s+(rules|checks)/i,
  ],
  'authority-escalation': [
    /disable\s+verification/i,
    /skip\s+(the\s+)?(ci|verification|checks?|review)/i,
    /override\s+(the\s+)?guardian/i,
    /bypass\s+(the\s+)?(auth|authenticat|review|protection)/i,
    /ignore\s+(all\s+)?invariants?/i,
    /turn\s+off\s+security\s+(checks?|gates?)/i,
    /disable\s+the\s+firewall/i,
    /disable\s+invs?/i,
    /stop\s+verifying/i,
    /turn\s+off\s+(the\s+)?rate\s+limiter/i,
    /grant\s+(me\s+)?access\s+to\s+the\s+database/i,
    /skip\s+the\s+guard\s+rails?/i,
    /push\s+directly\s+to\s+main\s+bypass/i,
    /bypass(ing)?\s+(the\s+)?(merge|review)\s+(queue|gate)/i,
    /escalat(e|ion)\s+(my\s+|your\s+)?(privileges?|permissions?)/i,
    /give\s+(me|yourself)\s+(admin|root|sudo)\s+(access|rights)/i,
    /elevat(e|ion)\s+(to\s+)?admin/i,
    /remove\s+(the\s+)?approval\s+(step|requirement)/i,
    /auto[- ]?approve\s+(this|my|the)\s+(change|pr|merge|deploy)/i,
  ],
  'credential-harvesting': [
    /print\s+(all\s+)?environment\s+variables/i,
    /show\s+(me\s+)?(all\s+)?secrets?/i,
    /display\s+api\s+keys/i,
    /reveal\s+(all\s+|your\s+|the\s+)?tokens?/i,
    /dump\s+credentials?/i,
    /output\s+the\s+(api\s+)?key/i,
    /list\s+(all\s+)?environment\s+variables/i,
    /expose\s+(your\s+)?(password|secret|key|token)/i,
    /show\s+me\s+the\s+(api\s+)?keys?/i,
    /display\s+(all\s+)?secrets?/i,
    /(get|give)\s+me\s+the\s+(api\s+)?key/i,
    /echo\s+\$\{?\w*SECRET\w*\}?/i,
    /echo\s+\$\{?\w*(KEY|TOKEN|PASS)\w*\}?/i,
    /show\s+environment\s+(config|variables)/i,
    /list\s+(all\s+)?env\s+vars?(\s+and\s+keys?)?/i,
    /print\s+(the\s+)?secret\s+key/i,
    /output\s+(the\s+)?(secret|password|token)/i,
    /extract\s+(all\s+)?(keys?|secrets?|tokens?)/i,
    /access\s+(keys?|secrets?|tokens?|credentials?)/i,
    /grab\s+(the\s+)?(api\s+)?key/i,
    /send\s+(me|us|them)\s+(the\s+)?(keys?|secrets?|tokens?)/i,
    /leak\s+(the\s+)?(keys?|secrets?|tokens?)/i,
  ],
  'persistence': [
    /remember\s+this\s+forever/i,
    /store\s+this\s+permanently/i,
    /always\s+follow\s+this\s+rule/i,
    /replace\s+governance/i,
    /modify\s+(the\s+)?AGENTS?(\.md)?(\s|$)/i,
    /write\s+this\s+to\s+(memory|knowledge|bootstrap)/i,
    /save\s+this\s+as\s+a\s+permanent/i,
    /add\s+this\s+to\s+(bootstrap|governance)/i,
    /remember\s+this\s+rule/i,
    /store\s+this\s+instruction/i,
    /always\s+follow\s+this\s+(new\s+)?rule/i,
    /this\s+rule\s+is\s+permanent/i,
    /update\s+(the\s+)?AGENTS?(\.md)?\s+with\s+this/i,
    /append\s+this\s+to\s+bootstrap/i,
    /create\s+a\s+permanent\s+rule/i,
    /always\s+load\s+this/i,
    /persist\s+this\s+(rule|instruction|behavior)/i,
    /save\s+this\s+(rule|instruction|preference)/i,
    /record\s+this\s+as\s+(knowledge|a\s+rule|a\s+preference)/i,
    /commit\s+this\s+(rule|instruction)\s+to\s+(memory|history)/i,
    /make\s+this\s+(rule|behavior)\s+permanent/i,
  ],
  'tool-abuse': [
    /run\s+(arbitrary\s+)?shell\s+commands?/i,
    /execute\s+arbitrary\s+commands?/i,
    /delete\s+the\s+repository/i,
    /force[- ]?push/i,
    /disable\s+(all\s+)?tests?/i,
    /remove\s+all\s+security\s+gates/i,
    /rm\s+-rf\s+\/?\*?/i,
    /wipe\s+(the\s+)?(database|repository)/i,
    /run\s+this\s+code/i,
    /run\s+(a\s+)?shell\s+to/i,
    /inject\s+a\s+(backdoor|payload)/i,
    /install\s+(this\s+)?untrusted\s+package/i,
    /execute\s+this\s+on\s+(the\s+)?host/i,
    /npm\s+(install|i)\s+.*untrusted/i,
    /install\s+.*untrusted\s+package/i,
    /execute\s+(a|an|the|this)?\s*(shell|command|script)/i,
    /drop\s+(a\s+)?(reverse\s+shell|webshell|backdoor)/i,
    /exfiltrat(e|ion)\s+(data|files)/i,
    /download\s+and\s+(run|execute|install)/i,
    /evaluate\s+this\s+code/i,
    /eval\s*\(/i,
    /delete\s+(all\s+)?(files?|data|tables?|records?)/i,
    /truncate\s+(the\s+)?(table|database)/i,
  ],
};

// Instruction like "Ignore previous instructions" in a comment is a real
// injection. "DO NOT ignore previous instructions" is defensive text — skip
// when negated.
const NEGATION = /(?:do\s+not|never|must\s+not|should\s+not)\s+(?:ignore|disregard|forget|skip)/i;

/**
 * Classify input text. Returns { verdict, categories[], matches[], audit }.
 * Deterministic: identical input → identical verdict.
 */
export function screenXpia(text) {
  const source = String(text || '');
  const findings = [];

  // A text that merely instructs others not to ignore rules is not an attack.
  if (NEGATION.test(source)) {
    return { verdict: 'PASS', categories: [], matches: [], audit: { sourceLength: source.length, screenedAt: new Date().toISOString() } };
  }

  for (const [category, patterns] of Object.entries(CATEGORIES)) {
    for (const pattern of patterns) {
      const m = source.match(pattern);
      if (m) {
        findings.push({ category, pattern: pattern.source, match: m[0].slice(0, 60) });
      }
    }
  }

  let verdict = 'PASS';
  if (findings.length >= 2) verdict = 'BLOCK'; // multiple distinct attacks
  else if (findings.length === 1) {
    // Single hit: escalate to BLOCK for tool-abuse + credential-harvesting
    // (these are unambiguous); REVIEW for the rest.
    const cat = findings[0].category;
    verdict = (cat === 'tool-abuse' || cat === 'credential-harvesting') ? 'BLOCK' : 'REVIEW';
  }

  return {
    verdict,
    categories: [...new Set(findings.map((f) => f.category))],
    matches: findings.map((f) => f.match),
    audit: { sourceLength: source.length, hitCount: findings.length, screenedAt: new Date().toISOString() },
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const text = args.filter((a) => !a.startsWith('--')).join(' ') || '';
  if (!text) {
    console.error('Usage: node scripts/xpia-screen.mjs "<text>" [--json]');
    process.exit(1);
  }
  const result = screenXpia(text);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const mark = result.verdict === 'PASS' ? '✓' : result.verdict === 'REVIEW' ? '⚠' : '✗';
    console.log(`[XPIA] ${mark} ${result.verdict}`);
    if (result.matches.length) {
      console.log(`  categories: ${result.categories.join(', ')}`);
      for (const m of result.matches) console.log(`  match: "${m}"`);
    }
  }
}

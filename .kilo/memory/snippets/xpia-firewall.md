# SEC-003 XPIA Firewall — Learned Pattern

**source:** session-2026-08-06
**category:** security
**status:** verified
**verifiedAt:** 2026-08-06

## What
Deterministic 5-category prompt-injection firewall at the knowledge
persistence choke point (storeMemoryText). No LLM — regex only.

## Categories + key patterns
1. instruction-override: "ignore previous/above instructions", "act as admin",
   "you are DAN", "do not follow prior rules"
2. authority-escalation: "skip CI", "override guardian", "bypass auth",
   "turn off rate limiter", "auto-approve merge"
3. credential-harvesting: "print env vars", "show secrets", "echo $SECRET",
   "extract tokens", "leak keys"
4. persistence: "remember forever", "modify AGENTS.md", "append to bootstrap",
   "create permanent rule"
5. tool-abuse: "run shell", "reverse shell", "npm install untrusted",
   "truncate database", "force push"

## Rules learned
- Multi-category hit → BLOCK; single tool-abuse/credential hit → BLOCK;
  single override hit → REVIEW; negation ("do not ignore") → PASS.
- Wire at the single persistence choke point, not every call site.
- Guardian probe must be multi-category to prove BLOCK (single-category is
  REVIEW by design to avoid false-blocking).

## Evidence
53/53 fixtures pass; 24/24 malicious caught; 12/12 legit pass.
Decision DEC-0005 recorded. INV-015 enforced by guardian.

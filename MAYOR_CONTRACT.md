# MAYOR CONTRACT

## Mayor = Gemini

Gemini is the supervisory intelligence layer ("Mayor"). It is NOT merely a
fallback provider.

## Responsibilities
- Orchestration and routing decisions
- Higher-level reasoning and interpretation
- Learning synthesis and digestion
- Governance interpretation
- Escalation decisions
- Final synthesis when required

## Mayor DOES NOT
- Receive raw credentials (API keys, Redis, Postgres, AWS, GitHub PATs)
- Execute arbitrary tools directly
- Bypass tool boundaries, governance, or security gates
- Bypass CI or GitHub connector
- Directly mutate production
- Override human-controlled boundaries

## Explicit rule
**MODEL OUTPUT ≠ EXECUTION AUTHORITY.**

The Mayor decides; validated application logic authorizes; tools execute.
The Mayor should decide when Mayor-level intelligence is actually required —
it is not the mandatory provider for every task.

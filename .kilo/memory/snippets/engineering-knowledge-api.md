# Engineering Knowledge API — Query Layer for Verified Knowledge

## Vision
Turn the Kudbee repository from a collection of code into an **Engineering Knowledge Platform** where every decision, deployment, and design choice is queryable, explainable, and traceable.

## Core Concept
Not another agent. Not another command. A **query layer** that answers:

```
WHY middlewareGuard?
SHOW decisions that created it.
SHOW deployments affected.
SHOW evidence.
SHOW missions.
SHOW confidence changes.
SHOW alternatives considered.
SHOW current health.
```

## Architecture

### Query Interface
```typescript
interface KnowledgeQuery {
  entity: string;        // "middlewareGuard", "bearerAuth", etc.
  question: string;      // "WHY", "SHOW", "EXPLAIN", "COMPARE"
  filters?: {
    timeRange?: string;
    confidence?: number;
    status?: string;
  };
}

interface KnowledgeResponse {
  entity: string;
  evidence: Evidence[];
  decisions: Decision[];
  deployments: Deployment[];
  confidence: number;
  alternatives: Alternative[];
  health: HealthStatus;
}
```

### Data Sources
1. **DTHINK Pipeline** — Decision trail, mission outcomes
2. **think_tokens** — Verified reasoning, DPO annotations
3. **Serial Bus** — Event history, state transitions
4. **Git History** — Commits, PRs, code changes
5. **CI/CD Logs** — Build status, test results, deploy events
6. **MiddlewareGuard Stats** — Failure counts, bypass events
7. **Disruption Layer** — Attack patterns, countermeasures

### Implementation Plan

#### Phase 1: Query Parser (Week 1)
Create `services/lib/knowledgeQueryParser.ts`:
- Parse natural language queries: "WHY middlewareGuard?"
- Map to structured query: `{entity: "middlewareGuard", question: "WHY"}`
- Support question types: WHY, SHOW, EXPLAIN, COMPARE, HISTORY

#### Phase 2: Evidence Aggregator (Week 2)
Create `services/lib/evidenceAggregator.ts`:
- Query DTHINK for decisions related to entity
- Query think_tokens for verified reasoning
- Query git log for code changes
- Query CI logs for test/build status
- Aggregate into unified evidence package

#### Phase 3: API Endpoint (Week 3)
Add `/api/knowledge/query` endpoint:
```javascript
app.post('/api/knowledge/query', async (req, res) => {
  const { entity, question, filters } = req.body;
  const response = await queryKnowledge(entity, question, filters);
  res.json(response);
});
```

#### Phase 4: Control Tower UI (Week 4)
Add "Knowledge Query" panel to OBSERVABILITY tab:
- Natural language input
- Structured response display
- Evidence timeline visualization
- Confidence score indicator

### Example Queries

| Query | Response |
|-------|----------|
| `WHY middlewareGuard?` | Decisions from PR #224, failure counts, bypass events, alternatives (retry, circuit breaker) |
| `SHOW bearerAuth decisions` | List of auth-related decisions, confidence scores, deployment impacts |
| `EXPLAIN rate limiter bypass` | Timeline of bypass events, root cause analysis, countermeasures applied |
| `COMPARE Opus5 vs Fable5` | Benchmark results, cost analysis, reasoning quality metrics |
| `HISTORY think_tokens` | Token creation timeline, compaction events, DPO annotations |

### Benefits
1. **Onboarding**: New engineers can query "WHY this pattern?" and get full context
2. **Debugging**: "SHOW failures for middlewareGuard" reveals root cause instantly
3. **Architecture Review**: "COMPARE middlewareGuard vs circuit breaker" shows tradeoffs
4. **Compliance**: "SHOW evidence for auth decisions" provides audit trail
5. **Continuous Learning**: System accumulates verified knowledge over time

### Integration with Existing Systems
- **DTHINK**: Source of decision trail and mission outcomes
- **think_tokens**: Verified reasoning with confidence scores
- **Serial Bus**: Event history for state transitions
- **Disruption Layer**: Attack patterns and countermeasures
- **THINK Benchmark**: Model comparison data
- **MiddlewareGuard**: Failure/bypass statistics

## Key Files
- `services/lib/knowledgeQueryParser.ts` (to create)
- `services/lib/evidenceAggregator.ts` (to create)
- `services/ingestion/routes/knowledge.ts` (to create)
- `.kilo/memory/snippets/engineering-knowledge-api.md` (this file)

## Related Patterns
- KILO: Session checkpointing, DTHINK pipeline
- Lemonade: Decision traces, model routing
- Crush: Session hierarchy, LSP integration
- TNS: Opus 5 vs Fable 5 benchmark methodology

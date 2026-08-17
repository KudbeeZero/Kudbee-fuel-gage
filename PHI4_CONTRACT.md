# PHI-4 CONTRACT

## Role
Local, free external API spend, routine worker. Runs via LM Studio
(`http://localhost:1234/v1`, model `microsoft/phi-4-mini`, Q4_K_M, 8K context).

## Validated workloads (empirically tested)
- classification
- extraction
- summarization
- prioritization
- compression
- guarded normalization (with deterministic schema validation)

## Known limitation
Normalization may omit required envelope fields — must be validated
deterministically; escalate on missing required metadata.

## Escalation conditions
- schema failure
- timeout
- provider error / LM Studio unavailable
- non-routine task
- context/size constraint

## Cost
External inference spend = **$0** (local). Do not claim universal reliability
for tasks not empirically validated.

# Upstash Redis for Agents

A zero-config Redis database for AI agents — no signup, no UI.

To create a database, generate a fresh UUIDv4 and POST it as the
`Idempotency-Key` header:

  curl -X POST -H "Idempotency-Key: <uuidv4>" https://upstash.com/start-redis

The UUIDv4 you send becomes the database id. POSTing again with the
same UUID returns the same database (retry-safe, also useful for
re-fetching credentials).

The header is optional: omitting it mints a new database with a
server-generated id (returned in the response — you can re-fetch
later by passing that id back as the Idempotency-Key). Sending your
own UUID is still recommended because it makes the *first* call
retry-safe — if the response is lost, retrying with the same UUID
returns the same database instead of creating a duplicate. Only
UUIDv4 is accepted.

The response is markdown with credentials, an inline quickstart, and
a console URL the agent can share with the user (where they view
usage and click Claim to keep the database).

Databases live for 3 days unless claimed.

## Install as a skill

To install this as a reusable skill, run:

  npx ctx7 skills install /upstash/skills upstash-redis-start

Skill source: https://github.com/upstash/skills/blob/main/skills/upstash-redis-start/SKILL.md

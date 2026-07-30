# /box — Upstash Box Operations

Manage sandboxed AI agent containers for KUDBEE.

## Usage
/box create [runtime] — Create a new Box (node, python)
/box run <box-id> <command> — Execute a shell command
/box agent <box-id> <prompt> — Run AI agent on a task
/box verify — Run browser verification on staging
/box list — List all active Boxes
/box ssh <box-id> — Get SSH connection string
/box delete <box-id> — Delete a Box

## Examples
/box verify                    # closes frontend-runtime gate
/box run coherent-beagle-67807 "npm test"
/box agent my-box "fix the bug in App.tsx"

## Integration
Uses UPSTASH_BOX_API_KEY from Heroku config vars.
Boxes are ephemeral by default (auto-freeze when idle).
Keep-alive boxes require paid plan.

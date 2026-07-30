# KUDBEE Operator Manual — IOX-1
## One-page guide to operating the Engineering Operating System

### What is this?
KUDBEE is an Engineering Operating System. It plans, executes, verifies, and governs software engineering work across 11 specialized agents, using evidence from a temporal knowledge graph (DTHINK), intelligence scheduling (ISE), and constitutional governance.

### How do I open it?

1. Open `https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/` — this loads the main application with System Spine boot, Suspense fallback during load, and the full React dashboard.
2. Open `https://kudbee-fuel-gage-staging-99f1b73b65b2.herokuapp.com/mission-control.html` — this opens Mission Control, the standalone engineering cockpit.

### What is DTHINK?
DTHINK is the temporal knowledge graph — KUDBEE's memory. Every engineering event (deployment, decision, certificate, investigation) is a node. Relationships are edges. Ask "Why is PR #228 blocked?" and DTHINK traverses the graph to answer from evidence, not logs.

### What is Mission Control?
Mission Control is the operational dashboard. 10 live panels show system health, agent fleet, governance gates, Redis budget, intelligence models, patch lifecycle, live events, a knowledge graph, and an interactive terminal.

### How do I launch work?
Type a command in the Mission Control terminal:
- `status` — current system state
- `agents` — fleet overview
- `gates` — governance status
- `why blocked` — PR #228 blocker explanation
- `deploy` — deployment status
- `demo` — 7-step autonomous mission replay

### How do I inspect agents?
Open Mission Control → Agent Fleet panel. 11 agents shown with roles: Gastown (Chief Orchestrator), Pipeline Guardian (Architecture), Sentinel (Governance), Hermes (Memory), Monitor (Fleet Ops), CI Watcher (Build Guard), and more.

### How do I understand governance?
Open Mission Control → Governance Gates panel. 7 gates listed with PASS/FAIL/UNKNOWN. Article VI of the Constitution: promotion blocked if any gate is UNKNOWN. Currently 6 PASS, 1 UNKNOWN (frontend-runtime-verified — requires browser observation).

### How do I deploy?
Deployments are controlled via the Heroku Platform API. The PR #228 branch is the single active lane. Production is FROZEN (f423c14/v342) — explicit authorization required. Staging deploys via `POST /apps/kudbee-fuel-gage-staging/builds`.

### Three questions every panel answers:
1. **What is happening?** → System Status, Agent Fleet, Live Events
2. **Why is it happening?** → DTHINK Graph, Governance Gates
3. **What should I do next?** → Terminal, Mission Queue, Command Bar

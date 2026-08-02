# WORKFLOW_MATRIX.md

| Workflow | File | Trigger | Blocking | Duplicate? | Owner | Lifecycle |
|---|---|---|---|---|---|---|
| Kudbee Bounded CI | verify.yml | PR, push main | Yes | No | Engineering | Draft: fast; Ready/Main: full |
| CodeQL | codeql.yml | PR, push main/staging, weekly | No | Yes — default setup | Security | Ready PR, Main, Nightly |
| Deploy to Heroku Staging | deploy-staging.yml | Push staging/* | No | No | DevOps | Main promotion |
| Session Logger | session-log.yml | Session events | No | No | Engineering | Nightly/event |
| Copilot | dynamic | PR | No | No | GitHub Copilot | Ready PR |
| Copilot cloud agent | dynamic | PR/manual | No | No | GitHub Copilot | Ready PR |
| Dependabot Updates | dynamic | Dependabot PR | No | No | Dependabot | Draft |
| CodeQL | dynamic (default) | PR, push | No | Yes — custom | GitHub/GHAS | Ready PR, Main |

## Recommendations
- **Kudbee Bounded CI:** Slim draft execution; keep full for Ready PR and main.
- **CodeQL:** Disable GitHub default setup; keep custom as single authority.
- **Deploy to Heroku Staging:** Verify functionality; recent runs show all failure.
- **Session Logger:** Evaluate cost vs value; consider removal or event-only trigger.

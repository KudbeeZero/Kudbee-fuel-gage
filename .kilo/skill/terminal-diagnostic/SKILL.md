# Terminal Diagnostic Skill

## Purpose
Diagnose terminal mounting failures and track agent credentials, qualifications, and access levels.

## Usage
Run `/terminal-diag` in the interactive terminal to execute a full diagnostic sweep.

## What it checks:
1. **React Version Compatibility** - Verifies react and react-dom versions match
2. **Agent Credentials** - Lists all agents with their credentials, qualifications, and access levels
3. **Intelligence Layer Status** - Checks think tokens, reason IDs, and EQ scores
4. **Mount Timeout Analysis** - Identifies why terminal failed to mount within 12 seconds
5. **Dependency Health** - Verifies all required packages are installed correctly
6. **Build Artifacts** - Checks if terminal bundle exists and is properly formatted

## Agent Card Structure
Each agent has:
- **Agent ID**: Unique identifier
- **Credentials**: Authentication tokens and keys (masked)
- **Qualifications**: Skills and capabilities
- **Access Level**: What systems they can access
- **Intelligence Layer**: Think token status, reason ID, EQ score
- **Status**: Active/inactive/error state

## Diagnostic Process
1. Run `/terminal-diag` to capture current state
2. Review agent cards for credential issues
3. Check intelligence layer for think token problems
4. Analyze mount timeout for React/dependency issues
5. Document findings in `.kilo/memory/terminal-diagnostics.json`
6. Generate fix recommendations

## Repeatable Process
This diagnostic can be run:
- After every deployment
- When terminal fails to mount
- When agents fail to authenticate
- When intelligence layer shows errors

## Output Format
```
╔══════════════════════════════════════════╗
║  TERMINAL DIAGNOSTIC REPORT             ║
╠══════════════════════════════════════════╣
║  Timestamp: 2026-07-31T14:32:11Z        ║
║  Status: FAILING / HEALTHY              ║
╠══════════════════════════════════════════╣
║  React Version: 19.2.8 ✓               ║
║  React-DOM Version: 19.2.8 ✓           ║
║  Mount Time: 12.5s (TIMEOUT)           ║
╠══════════════════════════════════════════╣
║  Agents: 11                             ║
║  Active: 9                              ║
║  Inactive: 2                            ║
╠══════════════════════════════════════════╣
║  Intelligence Layer:                    ║
║  Think Tokens: 45                       ║
║  Reason IDs: 12                         ║
║  Avg EQ: 0.87                           ║
╚══════════════════════════════════════════╝
```

## Fix Recommendations
Based on diagnostics, the skill will suggest:
- Version pinning fixes
- Credential rotation
- Access level adjustments
- Intelligence layer repairs
- Build artifact regeneration

## Integration
This skill is integrated into the terminal via `.kilo/command/terminal-diag.md`

# Terminal Diagnostic Command

## Description
Run a comprehensive diagnostic sweep of the terminal, checking React versions, agent credentials, intelligence layer status, and mount timeout issues.

## Usage
```
/terminal-diag
```

## What it does
1. Checks React and react-dom version compatibility
2. Lists all agents with their credentials, qualifications, and access levels
3. Verifies intelligence layer status (think tokens, reason IDs, EQ scores)
4. Analyzes mount timeout causes
5. Checks dependency health
6. Verifies build artifacts
7. Generates fix recommendations
8. Saves diagnostic report to `.kilo/memory/terminal-diagnostics.json`

## Output
Displays a formatted diagnostic report showing:
- System status (HEALTHY/FAILING)
- React version compatibility
- Mount time and timeout status
- Agent count and status
- Intelligence layer metrics
- Specific issues found
- Recommended fixes

## When to use
- Terminal fails to mount within 12 seconds
- After every deployment
- When agents fail to authenticate
- When intelligence layer shows errors
- To document debugging process

## Integration
This command is available in the interactive terminal and can be run repeatedly to track issues over time.

/**
 * services/thinkbox/src/index.ts
 * ---------------------------------------------------------------------------
 * THINKBOX CLI entry point.
 *
 * Usage:
 *   npx tsx services/thinkbox/src/index.ts detect <git-url|zip|directory>
 *   npx tsx services/thinkbox/src/index.ts list
 *
 * `detect` runs the full Objective-001 intake pipeline and prints the
 * canonical manifest summary. `list` prints registered workspace ids.
 * ---------------------------------------------------------------------------
 */

import { intakeAndDetect } from './orchestrator.ts';
import { listWorkspaces } from './registry.ts';

function printManifest(outcome: ReturnType<typeof intakeAndDetect>): void {
  const { workspace, manifestPath } = outcome;
  console.log(JSON.stringify(
    {
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      sourceType: workspace.sourceType,
      state: workspace.state,
      languages: workspace.detection?.languages ?? [],
      frameworks: workspace.detection?.frameworks ?? [],
      packageManagers: workspace.detection?.packageManagers ?? [],
      confidence: workspace.detection?.confidence ?? 0,
      recommendedNextAction: workspace.summary?.recommendedNextAction ?? null,
      manifestPath,
    },
    null,
    2
  ));
}

const [command, arg] = process.argv.slice(2);

switch (command) {
  case 'detect': {
    if (!arg) {
      console.error('Usage: thinkbox detect <git-url|zip|directory>');
      process.exit(1);
    }
    const outcome = intakeAndDetect(arg);
    printManifest(outcome);
    break;
  }
  case 'list': {
    const workspaces = listWorkspaces();
    for (const w of workspaces) {
      console.log(`${w.workspaceId}  ${w.name}  [${w.sourceType}]  ${w.state}`);
    }
    break;
  }
  default: {
    console.error(`
THINKBOX — Universal Workspace Detection

Commands:
  detect <git-url|zip|directory>   Intake + detect + manifest + publish
  list                             List registered workspaces

Examples:
  npx tsx services/thinkbox/src/index.ts detect /path/to/project
  npx tsx services/thinkbox/src/index.ts detect https://github.com/user/repo.git
  npx tsx services/thinkbox/src/index.ts list
`);
    process.exit(1);
  }
}

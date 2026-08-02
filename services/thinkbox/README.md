# THINKBOX — Universal Workspace Detection

**Objective 001 / PR-001.** Build the first stage of THINKBOX: understand
projects, not execute them. Any supported input normalizes into a canonical
workspace description every downstream service can consume.

## Scope (What This Does)

Intake and understanding only. **Non-goals:** dependency installation, builds,
tests, source modification, deployment, container launch.

## Supported Inputs

| Source type | Example | Import behavior |
|:---|:---|:---|
| `git` | `https://github.com/user/repo.git` | shallow clone into temp dir |
| `zip` | `/path/to/project.zip` | `unzip` + single-root unwrap |
| `directory` | `/path/to/project` | recursive copy into temp dir |

## Pipeline

```
import source → create workspace → detect → summarize → write thinkbox.json → publish events
```

1. **Import** (`src/importer.ts`) — normalize any input into a scan-ready directory.
2. **Register** (`src/registry.ts`) — durable workspace root object (uuid, source,
   state, manifest version).
3. **Detect** (`src/detection/engine.ts`) — deterministic walk + signal matching.
4. **Summarize** (`src/manifest.ts`) — engineering summary for orchestration.
5. **Manifest** — canonical `thinkbox.json` written to the project root.
6. **Publish** (`src/events.ts`) — `workspace:created|detected|failed` BUS events
   + DTHINK feed.

## Detection Coverage (config-driven)

- 23 languages (extensions)
- 21 frameworks (config files)
- 14 package managers (lockfiles/manifests)
- 12 build systems
- Monorepo indicators, Docker, CI (11 providers), documentation, entry points

## CLI

```bash
npx tsx services/thinkbox/src/index.ts detect <git-url|zip|directory>
npx tsx services/thinkbox/src/index.ts list
```

## Extension Points

Add a technology = **data change**, not a code change. Edit
`src/detection/signals.ts`:

```ts
export const LANGUAGE_SIGNALS: FileSignal[] = [
  // add { extensions: ['.newlang'], labels: ['newlang'] }
];
```

The engine, manifest, and events modules never change when adding signals.

## Output — thinkbox.json

Describes what the system **learned**, not what it assumes. Fields:
workspace metadata, detection result (languages, frameworks, package managers,
build systems, docker, ci, docs, entry points, confidence), engineering summary
(project type, technologies, next action).

## Testing

```bash
cd services/thinkbox && bun test   # 8 tests — determinism, coverage, fixtures
```

## Status

| Subsystem | Progress |
|:---|:---|
| Workspace Detection | 100% (this PR) |
| Dependency Resolution | 0% (PR-002) |
| Environment Provisioning | 0% (PR-003) |
| Code Indexing | 0% (PR-004) |
| Architecture Graph | 0% (PR-005) |
| Engineering Memory | 0% (PR-006) |
| Agent Assignment | 0% (PR-007) |
| Execution | 0% (PR-008) |

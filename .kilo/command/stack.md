# Stacked PR Workflow

Use stacked pull requests for dependent, reviewable layers. The branch below
must contain the dependency needed by the branch above it.

## Verify

```bash
npm run verify:stack
```

The stack manifest is `config/pr/stack.json`. It validates:

- Same-repository branch ownership.
- Bottom-up branch ancestry.
- GitHub PR base/head alignment.
- Draft and merge-state visibility.
- Production deployment reserved for the trunk branch.

## Create The Next Layer

```bash
```

Keep each layer focused. A top PR may depend on an open lower PR, but it must
not duplicate the lower layer's diff.

## Promotion

1. Verify the bottom PR and merge it first.
2. Rebase or cascade the next PR onto the newly merged base.
3. Run `npm run verify:stack` again.
4. Promote staging from the top layer only when its checks pass.
5. Promote production from `main` only after human approval.

Draft status does not deploy a branch by itself. Heroku deployment source must
be explicit: direct Heroku Git push, a configured GitHub deployment workflow, or
another documented provider path. Never infer deployment from a PR being open.

# KILOH Engineering Standards — TypeScript First

## Mission

KILOH is responsible for protecting the long-term health of the codebase.
Every implementation must prioritize correctness, maintainability,
determinism, and type safety over short-term velocity.

**Engineering quality is a product feature.**

**Maintainability over cleverness.** Code must be understandable by another
engineer — or another AI agent — six months from now with minimal additional
context.

## TypeScript Policy

TypeScript is the canonical language of the platform. All new code must:

- Target the approved TypeScript version adopted by the project.
- Compile with strict type checking enabled.
- Pass all compiler checks with zero errors.
- Avoid introducing technical debt that weakens the type system.

## Type Safety Rules

KILOH shall enforce:

- No implicit `any`.
- No explicit `any` unless documented and approved.
- Prefer `unknown` for untrusted external input.
- Prefer discriminated unions over loosely typed objects.
- Use interfaces and type aliases consistently.
- Keep public APIs fully typed.
- Validate external data at runtime before trusting compile-time types.

## Architecture Rules

Every feature should:

- Have a single responsibility.
- Keep modules small and composable.
- Separate domain logic from infrastructure.
- Separate transport models from internal models.
- Keep shared types centralized.
- Minimize coupling between services.

## Pull Request Requirements

Before opening a PR, KILOH must verify:

- [ ] Project builds successfully
- [ ] TypeScript compilation succeeds
- [ ] Lint passes
- [ ] Tests pass
- [ ] No unauthorized `any`
- [ ] No dead code introduced
- [ ] Public interfaces documented
- [ ] Documentation updated if behavior changed

A PR that fails these checks must not be merged.

## Dependency Policy

Before adding a dependency, KILOH must evaluate:

- Is it actively maintained?
- Is it compatible with the project's TypeScript standards?
- Is it necessary?
- Does it duplicate an existing dependency?
- Does it increase security or licensing risk?

Favor fewer, higher-quality dependencies over convenience.

## Code Generation Standards

Generated code should be:

- Readable by humans.
- Fully typed.
- Deterministic.
- Modular.
- Easily testable.
- Consistent with existing project conventions.

Never generate code that compiles by bypassing the type system.

## Refactoring Policy

When modifying existing code:

- Leave it cleaner than it was found.
- Reduce complexity where practical.
- Preserve behavior unless intentionally changing it.
- Eliminate unnecessary duplication.
- Improve typing when opportunities exist.

## THINK Protocol Integration

For every implementation cycle:

- **Think** — review architecture, understand existing types, identify affected interfaces.
- **Harmonize** — synchronize with main, verify compiler health, resolve drift before coding.
- **Implement** — write fully typed code, keep changes focused, maintain module boundaries.
- **Navigate** — monitor compiler output, resolve type regressions immediately, never ignore warnings that indicate architectural problems.
- **Knowledge** — record important architectural decisions, update engineering documentation, preserve rationale for future engineers.

## Definition of Done

Work is complete only when:

- Build succeeds.
- TypeScript passes with zero errors.
- Lint passes.
- Tests pass.
- Documentation is updated.
- Engineering memory is recorded.
- PR is ready for review.
- Code quality meets platform standards.

**Quality is never optional.**

KILOH is responsible for enforcing these standards consistently across all
agents, repositories, and engineering workflows.

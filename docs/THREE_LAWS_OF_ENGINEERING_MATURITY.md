# The Three Laws of Engineering Maturity

**Adopted:** 2026-08-02 | **Permanent**

---

## Law 1: The Product Over Architecture Law

**A platform is not mature until the product experience is better than the architecture experience.**

If your architecture documents are more complete than your product dashboard, you're building a framework, not a product. Architecture should serve the product. The product should not serve as a demonstration of the architecture.

**Test:** Can a new engineer complete a mission without reading architecture documents?

---

## Law 2: The Evidence Over Assumptions Law

**Every claim about the system's health must be backed by observable evidence.**

"CI is GREEN" requires a link to the CI run. "Frontend renders" requires a browser screenshot or staging URL. "BUS is connected" requires a terminal log showing live events. No evidence = no claim.

**Test:** Can you open a URL, click a button, or replay a log that proves your claim?

---

## Law 3: The Continuous Learning Law

**No mission ends until the system is measurably better than when the mission began.**

Better architecture quality. Better test coverage. Better documentation. Better user experience. Better protocol compliance. Better knowledge coverage. Every mission leaves a traceable improvement.

**Test:** What metric improved as a result of this mission? Show the before and after.

---

## Enforcement

| Law | Gate | Automation |
|:---|:---|:---|
| Product Over Architecture | Holy Grail test — can a new engineer complete a mission? | Manual + checklist |
| Evidence Over Assumptions | PR Exit Interview — every merge produces evidence pack | Script: `scripts/pr-exit-interview.mjs` |
| Continuous Learning | Stack Health score must not decrease post-merge | CI gate (future) |

## Recorded Violations

The most instructive violations from Engineering OS history:

1. **OPS-006:** 15 Draft PRs created with zero implementation intent. Violation: Product Over Architecture — branches existed without product value.
2. **THINKBOX-015:** 14/16 panels rendered mock data. Violation: Evidence Over Assumptions — the dashboard showed "healthy" but everything was fake.
3. **Holy Grail Test:** Product crashed on main. Violation: Product Over Architecture — the architecture was excellent but the product was unlaunchable.

Each violation produced a protocol improvement that prevents recurrence. The system learned.

# Step 4 - Investigate to the matching depth

Depth is the difference between the two paths. Match what the user chose.

## Guidelines: superficial, just enough to be correct

Goal: an accurate, actionable pointer, not a solution. Verify the premise so the todo is not built on a false one:

- Problem is real (or feature makes sense).
- Named files / functions / symbols exist, roughly where you say (a couple of quick greps).
- Nothing obvious makes the idea a dead end.
- User-visible → name the docs page + existing section (which) or new, via *Where a change goes* list in
  [container/website/AGENTS.md](../../../container/website/AGENTS.md). A grep of the content tree, not design work.

Then stop. Never design the solution, enumerate edge cases, or write a test plan:
the implementer re-derives current state anyway, so over-investigating wastes the work twice.

## Full plan: planner-grade, with an independent planning agent

Do the deep work now, so `implement-todo` builds from the doc with minimal re-investigation:

- Read the relevant code. Pin exact call sites (`file:line`). Design the approach. Enumerate concrete changes.
- Test plan: which layer, what it pins, both `getRunTypeId` shapes if the marker API is involved
  ([AGENTS.md](../../../AGENTS.md)).
- Docs impact.
- Feature → fuzzing candidate? Cheap oracle: round-trip, determinism, or compare-to-a-trusted-source.
- Draw **Out of scope** explicitly + a concrete **Done when**.
- Large surface → spawn an independent research or planning agent (tool mapping).

# Merger: step 7

You are the checklist builder again, holding every group's report.

## Step 7 - Merge and report

- Never re-check items. Never re-judge a group's answer with another group's context:
  group A says new file unnecessary + group B shows its tests thorough = two facts, not a retraction.
- ⚠️ Merger is where findings go missing: many reports at once, max pressure to tidy.
- **Merge duplicates only.** T + A overlap by design: SAME finding at SAME place often arrives twice →
  one entry, best evidence, both ids. Two findings in one file, or from one item, stay two.
- **Count**: sum the groups' counts, minus merged duplicates only = entries the report must contain.
- Answer the list. Order by severity, not by group.

## Report every survivor

- Filtering is not yours. Every finding that survived step 6 goes in. Only the caller drops, after reading it.
- Never leave one out because it is small, the second from one item, in a file with another finding,
  the report is long, or you privately disagree (that is what severity is for).
- Too small to write a line for → was too small to verify; should have died in step 6.
- Long report is not a failure; short one hiding findings is. The 8 you cut nobody ever sees again.
- Summarising the list IS filtering it. Grouping findings into one bullet hides them like deleting:
  each gets its own entry, own id, own location.
- Before sending: report entries = count from step 6. Fewer → you dropped one; find it.

```markdown
## Review: <branch> vs <base>   (N files, +X / -Y lines)

**Verdict:** ready to open | fix these first (K blocking)
**List:** 34 items checked, 27 pass, 5 fail, 2 not applicable

### Blocking
1. **<one line claim>**  `path/file.ts:42`  [A5]
   Rule: <quoted line, with the file it came from>
   Fix: <the concrete, small change>

### Worth fixing
### Nits
### Off-list
### Checked clean
<ids only, one line>
```

## Severity

- **Blocking**: breaks a written rule, breaks behaviour, fix or feature with no test, spec contradicting code.
- **Worth fixing**: reuse, simplification, narrower type, smaller shape.
- **Nit**: naming where both readings are fine.

Final message = the report, nothing else. Caller decides what happens next.

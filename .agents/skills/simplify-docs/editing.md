# Editing: steps 3 and 4

Detail for [SKILL.md](SKILL.md) steps 3 and 4.

## Step 3 - Page structure

Before any wording change. Per added/changed section, run the *Merge, rewrite, split, move or keep* list
from `container/website/AGENTS.md` in order. Act on the first match:

- **Merge**: existing title still true for both, or they share an example, table columns or a sentence.
  One paragraph, one example, one table survive.
- **Rewrite**: content bolted on ("There is also", "In addition", "Note that", a second paragraph or example,
  a tip grown into a paragraph). Rewrite the whole section from the ideal template, in place. Keep title if still true.
- **Split**: two examples, two tables, or a title that needs an "and".
- **Move**: only when the target page is obvious. Else keep + flag in report.
- **Keep**: none of the above.

Then read the page's table of contents alone: distinct jobs, no two titles that could be one.
Record every merge, rewrite, split and move with the rule that triggered it.

## Step 4 - Section by section

Per owned section, in order:

1. **Title.** Title Case, names the job, stands alone without the page title. No code names, backticks,
   questions, slogans. Fails → rewrite.
   Renamed heading = new URL anchor: grep `container/website/content/` for the old slug (`lowercase-with-hyphens`),
   fix every link.
2. **Shape.** Ideal: title, 1-2 sentences, example, optional table, optional tip, in that order.
   Move or cut anything out of order. Lead-in sentence goes. Second example or table = step 3 missed a split.
3. **Paragraph.** Write the main idea in one plain sentence for yourself.
   Rewrite around it in everyday words: what it does, when to use. 2 sentences target, 3 ceiling.
   Cut what the example, table or tip shows. Apply banned words.
   No metaphors, trailing justification clauses, history, internals.
4. **Example.** Trim to what the section explains: 5-15 lines, no unneeded setup, no second feature.
   Comments → one-liners on the line they explain, saying why it matters. Delete top comment block.
   Never change an identifier, import or API call: must compile, same behaviour. Only comments + unneeded lines go.
5. **Repetition.** Each fact once across paragraph, example comments, table, tip.
   Keep it where the reader meets it first (usually the example), cut the other.
   A one-line comment on the line that does it beats a sentence above the example.
6. **Accuracy.** Never change meaning. Dropping a condition, code, default or limit = wrong, not simpler.
   Cannot simplify without losing a fact → keep it, report the sentence as left alone.
7. **Shorter, never longer.** Every touched sentence and every file ends shorter.
   Growth needs a reason a reader would accept, in the report. "Reads better" is not one.
   Moving a fact into a sentence is no licence to keep the old wording too.
8. **Cut what a developer knows**: list separators ("split by spaces or commas"), config edited by hand,
   commands run in a terminal, what a comment is. Keep only what this feature does differently.

Frontmatter `description` = a paragraph: one plain sentence, under ~100 chars.

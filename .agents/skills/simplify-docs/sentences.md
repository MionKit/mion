# Real examples: sentences

Every pair is real. Part of [examples.md](examples.md).

## Sentences

```
NO   Two comments stand a finding down in your own source.
YES  Two comments turn an error off.

NO   `@mion-downgrade-error` keeps it printing as a warning and stops it failing the build, which is what you want when
     the finding is right and still worth reading.
YES  `@mion-downgrade-error` shows it as a warning, so the build does not fail.

NO   A comment that stood nothing down is reported as a warning (comment-expect-error-unused or
     comment-downgrade-error-unused), so it cannot outlive the problem it was added for.
YES  A comment that turns nothing off is reported (comment-expect-error-unused or comment-downgrade-error-unused).

NO   Name the codes when you can. A comment with no codes also hides findings you have never met, including a real one
     added later. Save it for a file that is deliberate from top to bottom.
YES  Always name the code. A comment with no code also hides errors you have not seen yet.

NO   An error too: the code is written, but it throws when called or no longer checks what you asked for. It blocks a
     production bundle, while a dev server reports it and keeps running. You can stand one down with a comment or a
     setting.
YES  The build is not stopped during dev mode but code will generate an error at runtime. Production build will fail so
     you don't ship runtime errors.

NO   Sometimes a whole file raises the same finding. A suite that checks what a broken type does at runtime can hit the
     same code on forty calls, and forty copies of the same comment help nobody.
YES  Use `/* */` at the top of the file to cover the whole file.

NO   Both print as `error`, the word your editor's problem matcher reads, so look the code up to tell which one you
     have.
YES  Both print the word `error`, so check the code to see which one you got.

NO   The build could not produce the code at all, so there is nothing to ship for that piece. It stops that piece of the
     build everywhere, and nothing you can set or write stands one down.
YES  mion could not build the code, so there is nothing to ship. The build stops. Nothing turns it off.

NO   A bare comment covers anything reported on that line, and only your editor can then tell you it went stale, because
     the build does not run every check the editor does.
YES  A comment with no code hides every error on that line.

NO   Use it for findings you cannot annotate: a type inside a package you do not own, or a problem in your project
     config.
YES  Use it when you cannot add a comment: the type is in a package you do not own.
```

From this pass's first run. Moving a fact in made the sentence longer, and every developer assumes that fact:

```
NO   Use `//` above a line to cover that line. Use `/* */` at the top of the file, before any code, to cover the whole
     file. Put several codes on one comment, split by spaces or commas.
YES  Use `//` above a line to cover that line. Use `/* */` at the top of the file, before any code, to cover the whole
     file. Several codes fit on one comment.
```

What the NO side keeps doing:

- A metaphor for a plain action: "stand down", "outlive", "help nobody", "keeps honest".
- A reason bolted on after a comma: ", which is what you want when ...", ", so it cannot ...".
- A setup sentence before the point: "Sometimes a whole file ...".
- Internals the reader cannot act on: "the word your editor's problem matcher reads",
  "the build does not run every check the editor does".
- Feature vocabulary where the reader has a word: "finding" for error, "annotate" for add a comment,
  "stand down" for turn off.
- Telling a developer what they already know: how to separate list items, that a file is edited by hand,
  what a comment is.

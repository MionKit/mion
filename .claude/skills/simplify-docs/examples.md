# Real examples: wrong and right

Every pair below is real. The NO side was written by an agent for this repo's website, or still sits on the site. Read them before every pass, then judge the page in front of you against them.

## Titles

The test for a title: read it alone in the table of contents. It must say what the section is about, in plain words, with no code in it.

```
NO   Standing a Code Down for a Whole File        (jargon verb, and "code" where the reader says error)
YES  Disabling Errors in a File

NO   Expecting a Code on One Line                 (an API word used as a verb)
YES  Disabling an Error on One Line

NO   Downgrading a Code                           (does not say where)
YES  Downgrading Errors in Config

NO   The Three Levels                             (does not stand alone without the page title)
YES  Error Levels

NO   What is tested?                              (a question)
YES  Test Coverage

NO   Use `error.type` to Identify Errors          (code name, backticks, an order to the reader)
YES  Identifying Error Types

NO   RunTypes compiler rules (`runtypes/*`)       (code name in the title, not Title Case)
YES  Compiler Lint Rules

NO   Walk your type's structure                   (a slogan, not Title Case)
YES  Walking a Type

NO   Middleware function's Scope                  (possessive, mixed case)
YES  Middleware Scope

NO   wrangler.toml Example                        (a file name as the title)
YES  Cloudflare Configuration
```

## Sentences

```
NO   Two comments stand a finding down in your own source.
YES  Two comments turn an error off.

NO   `@mion-downgrade-error` keeps it printing as a warning and stops it failing the build, which is what you want when the finding is right and still worth reading.
YES  `@mion-downgrade-error` shows it as a warning, so the build does not fail.

NO   A comment that stood nothing down is reported as a warning (EXP001 or DWN001), so it cannot outlive the problem it was added for.
YES  A comment that turns nothing off is reported (EXP001 or DWN001).

NO   Name the codes when you can. A comment with no codes also hides findings you have never met, including a real one added later. Save it for a file that is deliberate from top to bottom.
YES  Always name the code. A comment with no code also hides errors you have not seen yet.

NO   An error too: the code is written, but it throws when called or no longer checks what you asked for. It blocks a production bundle, while a dev server reports it and keeps running. You can stand one down with a comment or a setting.
YES  The build is not stopped during dev mode but code will generate an error at runtime. Production build will fail so you don't ship runtime errors.

NO   Sometimes a whole file raises the same finding. A suite that checks what a broken type does at runtime can hit the same code on forty calls, and forty copies of the same comment help nobody.
YES  Use `/* */` at the top of the file to cover the whole file.

NO   Both print as `error`, the word your editor's problem matcher reads, so look the code up to tell which one you have.
YES  Both print the word `error`, so check the code to see which one you got.

NO   The build could not produce the code at all, so there is nothing to ship for that piece. It stops that piece of the build everywhere, and nothing you can set or write stands one down.
YES  mion could not build the code, so there is nothing to ship. The build stops. Nothing turns it off.

NO   A bare comment covers anything reported on that line, and only your editor can then tell you it went stale, because the build does not run every check the editor does.
YES  A comment with no code hides every error on that line.

NO   Use it for findings you cannot annotate: a type inside a package you do not own, or a problem in your project config.
YES  Use it when you cannot add a comment: the type is in a package you do not own.
```

One more, from the first run of this pass itself. Moving a fact into a sentence made it longer, and the fact was one every developer assumes:

```
NO   Use `//` above a line to cover that line. Use `/* */` at the top of the file, before any code, to cover the whole file. Put several codes on one comment, split by spaces or commas.
YES  Use `//` above a line to cover that line. Use `/* */` at the top of the file, before any code, to cover the whole file. Several codes fit on one comment.
```

What the NO side keeps doing:

- A metaphor for a plain action: "stand down", "outlive", "help nobody", "keeps honest".
- A reason bolted on after a comma: ", which is what you want when ...", ", so it cannot ...".
- A setup sentence before the point: "Sometimes a whole file ...".
- Internals the reader cannot act on: "the word your editor's problem matcher reads", "the build does not run every check the editor does".
- The feature's vocabulary where the reader has a word: "finding" for error, "annotate" for add a comment, "stand down" for turn off.
- Telling a developer what they already know: how to separate list items, that a file is edited by hand, what a comment is.

## Example comments

NO: a comment block at the top, saying what the paragraph above the example already says, and comments that explain the API instead of the line.

```ts
/* @mion-downgrade-error VL002 */
// The block comment above sits before any code, so it covers this whole file:
// every VL002 below prints as a warning instead of stopping the build. Written
// with no code after the word, `/* @mion-downgrade-error */`, it covers every
// finding in the file.

import {createValidateFn} from '@mionjs/run-types';

// A `symbol` holds nothing a validator can check, so each of these raises VL002.
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// A line comment covers only the line under it. `@mion-expect-error` removes the
// finding instead of lowering it, so nothing is printed for this one.
// @mion-expect-error VL002
export const validateSymbolQuietly = createValidateFn<symbol>();
```

YES: one-liners on the lines that matter, saying why that line is there, nothing the paragraph or the table says.

```ts
/* @mion-downgrade-error VL002 */
import {createValidateFn} from '@mionjs/run-types';

// both raise VL002; the file comment above makes them warnings
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// the line comment hides this one completely
// @mion-expect-error VL002
export const validateSymbolQuietly = createValidateFn<symbol>();
```

## Repetition

NO: the paragraph says what the example's comment says.

```md
A line comment covers the line under it. A block comment before any code covers the whole file. Both raise VL002 because a symbol has no value to check.

<code-import path="packages/examples/src/guide/disabling-errors.ts" lang="ts" />
```

with the example carrying `// A symbol holds no value to check, so both of these raise VL002.`

YES: the fact lives once, where the reader meets it first.

```md
Use `//` above a line to cover that line. Use `/* */` at the top of the file to cover the whole file.

<code-import path="packages/examples/src/guide/disabling-errors.ts" lang="ts" />
```

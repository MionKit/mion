# Steps 1 + 2: what you test, and is it worth it

Settle both with the user before building anything.

## Step 1: Name the code and bound it

- Ask the user for the smallest function or pipeline callable directly in a test. Read it, write its signature down.
- Smaller = faster runs + sharper rule. The signature IS the input set to make and the output to watch.
- Reachable only through a CLI, server or filesystem → still a function: wrap the side-effecting boundary.
  e.g. `run(args, files) -> {stdout, exit, files, diagnostics}`, or `run(input) -> {result, files, diagnostics}`.
- Keep wrapping until it is clean and callable a million times in-process.
- Land on one thing: the code under test as `(In) -> Out`.

```ts
type SUT<In, Out> = (input: In) => Out; // one typed function, callable a million times in-process
declare function encode(user: User): string; // e.g. a codec under test
declare function decode(wire: string): User;
```

## Step 1: Work out what you can see

- List everything you can watch, then tell the user what you found:
  - return value → compare / assert properties.
  - thrown error + its type → catch, classify (expected vs uncaught).
  - written files → read back (in-memory FS: cheap + isolated).
  - diagnostics list → assert codes / severity (the enrichment pipeline's main output).
  - stdout, exit code, logs / events → capture a buffer.
  - coverage → instrument to steer generation (optional, advanced).
- Code hides its effects (real disk, stdout)? Wrap so they come back as a value. That wrapper is part of your tooling.
- See first, check second: a checker blind to inline functions cannot have a rule about them.
- More you see = stronger rules. See enough to tell "clean" apart from "never ran".
  e.g. a validator returning 0 findings _because the type failed to resolve_ looks identical to "valid".
  That blind spot makes a reject-bad-input rule pass for the wrong reason.

## Step 2: Worth fuzzing?

30-second gut-check with the user. Fuzzing pays only when all three hold:

- Can we run it over and over, fast, in a loop, with different inputs? (Usually visible from the code.)
- Repeatable, or can we force that? Scan for loose randomness, clocks, network you cannot pin down.
- Cheap way to tell right from wrong without redoing its work? The key one; it kills most bad candidates.
  - Ask straight: "if I hand you an output, how would you spot a wrong one without re-running the logic?"
  - Only way to know the answer = rebuild the code → fuzzing compares two copies of the same possible bug.
- Any no → stop, recommend a handful of hand-written examples instead.

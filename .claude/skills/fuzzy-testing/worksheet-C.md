# Grow an existing test into a fuzz test

> The shortcut. The user pointed you at an example/unit test (or one concrete behaviour
> they want pinned). Grow it into a fuzz test, and keep both. A normal test has already
> paid the three hardest costs: a valid input, a working way to call the code, and a true
> check. A fuzz test is what you get by letting each of those vary, so most of the work is
> done. Full prose:
> [framework-fuzzy-testing.md → grow an existing test](framework-fuzzy-testing.md#already-have-a-normal-test-grow-it).

## Open the test and map its three parts

Read the user's test together. It is set-up, call, check (Arrange, Act, Assert). Each
part maps straight across:

| Example test                          | → fuzz part         | the edit                                                |
| ------------------------------------- | ------------------- | ------------------------------------------------------- |
| **Set up** a literal input / fixture  | input maker         | vary the thing the author froze arbitrarily             |
| **Call** the code                     | the code under test | **keep it as is** — it already works                    |
| **Check** `expect(out).toBe(literal)` | a rule              | turn the constant into a rule that holds for all inputs |

Two of the three are free. Only the check needs real thought (below).

## Read the inputs off the set-up

- Don't invent an input space. Widen the one the test already uses: find what the author
  froze (a value, a length, a field set, an order) and let it vary.
- If the test has a `valid[]` and an `invalid[]` list, point it out to the user: that
  split names your **two input makers**, `createMockDataFn<T>()` for the valid side and
  `mutateToInvalid(schema, mock)` for the invalid side.
- A **table-driven** test: each row is a hand-found example; the row dimension is your
  input maker.

## Turn the check into a rule, with the user (the only hard part)

Look at what the test asserts and grow it into a rule that holds for ALL inputs. Pick the
move by the shape of the check:

| The example checks…                                       | Grow it into…                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| a **relation** already (do-it-then-undo-it / do-it-twice) | the same relation over an input maker, _trivial_ (swap the literal for `createMockDataFn<T>()`) |
| **true/false** on a hand-picked good/bad value            | two input makers + the rule that ties the code's outputs together                             |
| a **constant you can recompute** (`toBe(5)`)              | compare against a trusted source, or the predicted-change relation it's an instance of        |
| a **hardcoded "this once broke"** case                    | make random inputs **around** that hazard                                                     |

- Run the grown rule through the iron rule with the user: break the output on purpose and
  watch it go red. A constant generalised lazily throws false alarms.

## Share the check between both tests

- Pull the test's check into a helper that BOTH the example and the fuzz test call. Don't
  copy it into the fuzz runner; copies drift apart. See [the rules worksheet
  (worksheet-B.md)](worksheet-B.md).

## Keep the example, it's the fast reproducer and the floor

- The original test stays: fastest reproducer, executable intent, a 1 ms smoke test
  beside a long run. If a fuzz failure shrinks to something **simpler** than the example,
  promote that smallest case to a new example test. The two feed each other.

## Tell the user when NOT to bother

- **Pure one-answer transforms** (deterministic `transform(input) === expected`, no error
  path): there's nothing to sweep, the examples are enough.
- **Inputs the maker can't reach yet** (a cyclic value the default maker never produces):
  fix the input maker first, or the fuzz never contains the case and the rule passes for
  the wrong reason.

The test to apply: _is there a thing worth varying, and a rule that stays true as it
varies?_ Yes, grow it. No, the example already is the right tool.

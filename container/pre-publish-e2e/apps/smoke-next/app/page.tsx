// Runs the shared minimal subset during the static prerender, so the built HTML
// carries the result of code Turbopack transformed through the RunTypes loader.
import {getRunTypeId} from '@mionjs/run-types';
import {selfCheck} from '../../shared/src/minimal';
// TYPE-ONLY: erased at compile time, so Turbopack sees no edge to typeDep.ts.
// The loader has to declare it as a dependency or a type edit there leaves this
// rewrite cached and stale. See ../typeDep.ts.
import type {StaleProbe} from '../typeDep';

export default function Page() {
  const outcome = selfCheck();
  return (
    <main>
      <div id="rt-ok">{String(outcome.ok)}</div>
      <div id="rt-results">{JSON.stringify(outcome.results)}</div>
      <div id="rt-typedep">{getRunTypeId<StaleProbe>()}</div>
    </main>
  );
}

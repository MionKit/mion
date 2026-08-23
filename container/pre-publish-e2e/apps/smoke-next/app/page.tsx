// Runs the shared minimal subset during the static prerender, so the built HTML
// carries the result of code Turbopack transformed through the RunTypes loader.
import {selfCheck} from '../../shared/src/minimal';

export default function Page() {
  const outcome = selfCheck();
  return (
    <main>
      <div id="rt-ok">{String(outcome.ok)}</div>
      <div id="rt-results">{JSON.stringify(outcome.results)}</div>
    </main>
  );
}

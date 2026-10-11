// smoke-next in emitMode 'ts': Turbopack compiles the typed .ts cache modules, and the prerender runs them.
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

// Runs the shared minimal subset during the static prerender, so the built HTML
// carries the result of code Turbopack transformed through the RunTypes loader.
import {getRunTypeId} from '@mionjs/run-types';
import {selfCheck} from '../../shared/src/minimal';
// TYPE-ONLY: erased at compile time, so Turbopack sees no edge to typeDep.ts.
// The loader has to declare it as a dependency or a type edit there leaves this
// rewrite cached and stale. See ../typeDep.ts.
import type {StaleProbe} from '../typeDep';
import {ClientProbe} from './ClientProbe';
import {serverProbeId} from './actions';

export default async function Page() {
  const outcome = selfCheck();
  const serverId = await serverProbeId();
  return (
    <main>
      <div id="rt-ok">{String(outcome.ok)}</div>
      <div id="rt-results">{JSON.stringify(outcome.results)}</div>
      <div id="rt-typedep">{getRunTypeId<StaleProbe>()}</div>
      <ClientProbe />
      <div id="rt-use-server">{serverId}</div>
    </main>
  );
}

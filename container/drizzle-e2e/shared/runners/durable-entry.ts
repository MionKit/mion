// The worker entry the durable lane runs, bundled together with drizzle's
// vendored Durable Objects suite. Never copied into the tree: durable-worker.mjs
// writes it to a scratch dir and points esbuild at it, so the suite it imports
// stays exactly the file the translator produced.
//
// It replaces ONLY the driving fetch handler. drizzle's own handler calls every
// method in one request and returns on the first throw, which would make the
// three trees comparable only up to the first failure — and comparing the three
// trees IS this lane's verdict. So this one takes a single method name per
// request and reports that method's outcome, and the driver walks the list.
//
// The Durable Object class itself is re-exported untouched: it is the thing
// under test, and workerd needs it as a named export to bind the namespace to.
import {MyDurableObject} from 'rt-durable-suite';

export {MyDurableObject};

interface TestEnv {
  MY_DURABLE_OBJECT: {
    idFromName(name: string): unknown;
    get(id: unknown): Record<string, () => Promise<void>>;
  };
}

export default {
  async fetch(request: Request, env: TestEnv): Promise<Response> {
    const {name} = (await request.json()) as {name: string};
    // The SAME durable object every time, exactly as drizzle's handler does: the
    // suite's migrate1() creates the tables and every later method expects them.
    const stub = env.MY_DURABLE_OBJECT.get(env.MY_DURABLE_OBJECT.idFromName('durable-object'));
    try {
      await stub[name]();
      return Response.json({status: 'passed'});
    } catch (error) {
      return Response.json({status: 'failed', message: String((error as Error)?.message ?? error)});
    }
  },
};

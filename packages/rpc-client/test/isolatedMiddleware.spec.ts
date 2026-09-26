/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, afterEach, beforeEach} from 'vitest';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from './lib/fetchingClient.ts';
import {batch} from '../src/batch.ts';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
import {useCsrf} from './lib/csrf.client.ts';

const baseURL = TEST_SERVER_BASE_URL;
const authHeaders = new HeadersSubset({Authorization: 'XWYZ-TOKEN'});

describe('isolated reusable middleware', () => {
  let destroy: (() => void) | undefined;
  afterEach(() => destroy?.());

  function newClient() {
    const initialized = initClient<TestServerApi>({baseURL});
    destroy = () => initialized.client.destroy();
    initialized.middlewares.auth.onRequest((auth) => auth(authHeaders));
    return initialized;
  }

  async function serverToken(routes: ReturnType<typeof newClient>['routes']): Promise<string> {
    const [token] = await routes.csrfToken().call();
    return token as string;
  }

  async function runs(routes: ReturnType<typeof newClient>['routes']) {
    const [noteRuns] = await routes.noteRuns().call();
    return noteRuns!;
  }

  /** A client holding a stale csrf token that refreshes it from the server, counting what it sends */
  function installCsrf(client: ReturnType<typeof newClient>, placement: 'notes' | 'admin' = 'notes') {
    const sent: string[] = [];
    let token = 'stale';
    const options = {
      getToken: () => {
        sent.push(token);
        return token;
      },
      refreshToken: async () => {
        token = await serverToken(client.routes);
      },
    };
    useCsrf(placement === 'notes' ? client.middlewares.notes.csrf : client.middlewares.notes.admin.csrf, options);
    return {sent, useFreshToken: async () => (token = await serverToken(client.routes))};
  }

  let client: ReturnType<typeof newClient>;
  beforeEach(async () => {
    client = newClient();
    await client.routes.resetNoteRuns().call();
  });

  describe('installer', () => {
    it('refreshes a stale token and retries, asking onRequest again for the new one', async () => {
      const csrfState = installCsrf(client);
      const [result, , undeclared, , middlewareErrors] = await client.routes.notes.saveNote('hi').call();
      expect(undeclared).toBeUndefined();
      expect(middlewareErrors).toEqual({});
      expect(result).toBe('saved hi (1)');
      expect(csrfState.sent).toEqual(['stale', await serverToken(client.routes)]);
      // the route was skipped on the first attempt, so the mutation ran once
      expect((await runs(client.routes)).saveNote).toBe(1);
    });

    it('works with the middleware placed one group deeper', async () => {
      installCsrf(client, 'admin');
      // the notes-level csrf also runs for admin routes, so it needs its own hook
      client.middlewares.notes.csrf.onRequest(async (call) => call(await serverToken(client.routes)));
      const [result, , undeclared] = await client.routes.notes.admin.getNote('a').call();
      expect(undeclared).toBeUndefined();
      expect(result).toBe('admin note a (1)');
    });

    it('retries at most once per middleware per call', async () => {
      const retries: boolean[] = [];
      client.middlewares.notes.csrf
        .onRequest((call) => call('always-stale'))
        .onError('csrf-expired', (_error, context) => {
          retries.push(context.retry());
        });
      const [result, , , , middlewareErrors] = await client.routes.notes.saveNote('hi').call();
      expect(retries).toEqual([true, false]);
      expect(result).toBeUndefined();
      expect(middlewareErrors?.['notes/csrf']?.type).toBe('csrf-expired');
      expect((await runs(client.routes)).saveNote).toBe(0);
    });
  });

  describe('retry rule: a succeeded mutation or plain route is never sent twice', () => {
    let retries: boolean[];
    beforeEach(async () => {
      retries = [];
      const token = await serverToken(client.routes);
      client.middlewares.notes.csrf.onRequest((call) => call(token));
      // a declared error AFTER the route: the route already ran when the hook decides
      client.middlewares.notes.audit
        .onRequest((call) => call(true))
        .onError('audit-flagged', (_error, context) => {
          retries.push(context.retry());
        });
    });

    it('a query that answered a value retries', async () => {
      await client.routes.notes.getNote('a').call();
      expect(retries).toEqual([true, false]);
      expect((await runs(client.routes)).getNote).toBe(2);
    });

    it('a mutation that answered a value is refused', async () => {
      const [result] = await client.routes.notes.saveNote('a').call();
      expect(retries).toEqual([false]);
      expect(result).toBe('saved a (1)');
      expect((await runs(client.routes)).saveNote).toBe(1);
    });

    it('a plain route that answered a value is refused', async () => {
      await client.routes.notes.touchNote('a').call();
      expect(retries).toEqual([false]);
      expect((await runs(client.routes)).touchNote).toBe(1);
    });

    it('a mutation that answered an error retries', async () => {
      const [, routeError] = await client.routes.notes.failNote('a').call();
      expect(retries).toEqual([true, false]);
      expect(routeError?.type).toBe('note-failed');
      expect((await runs(client.routes)).failNote).toBe(2);
    });

    // A void route leaves no value, so any error in the response counts it as failed.
    it('a void mutation in a response carrying an error retries', async () => {
      await client.routes.notes.clearNote('a').call();
      expect(retries).toEqual([true, false]);
      expect((await runs(client.routes)).clearNote).toBe(2);
    });

    it('a batch is refused when any mutation in it answered a value', async () => {
      const {routes, middlewares, client: batchClient} = initClient<TestServerApi>({baseURL});
      const batchRetries: boolean[] = [];
      middlewares.auth.onRequest((auth) => auth(authHeaders));
      const token = await serverToken(routes);
      middlewares.notes.csrf.onRequest((call) => call(token));
      middlewares.notes.audit
        .onRequest((call) => call(true))
        .onError('audit-flagged', (_error, context) => {
          batchRetries.push(context.retry());
        });
      await batch([routes.notes.getNote('a'), routes.notes.saveNote('b')]).call();
      batchClient.destroy();
      expect(batchRetries).toEqual([false]);
      const noteRuns = await runs(client.routes);
      expect(noteRuns.getNote).toBe(1);
      expect(noteRuns.saveNote).toBe(1);
    });
  });

  describe('middleware handler failures', () => {
    beforeEach(async () => {
      const token = await serverToken(client.routes);
      client.middlewares.notes.csrf.onRequest((call) => call(token));
      client.middlewares.notes.audit.onRequest((call) => call(true));
    });

    it('a throwing onError hook lands in undeclared and never retries', async () => {
      client.middlewares.notes.audit.onError('audit-flagged', (_error, context) => {
        context.retry();
        throw new Error('boom');
      });
      const [, , undeclared] = await client.routes.notes.getNote('a').call();
      expect(undeclared?.type).toBe('middleware-on-error-failed');
      expect(undeclared?.publicMessage).toContain("onError for middleware 'notes/audit' failed: boom");
      expect((await runs(client.routes)).getNote).toBe(1);
    });

    it('a rejecting onResponse hook lands in undeclared', async () => {
      client.middlewares.notes.audit.onRequest(() => undefined);
      client.middlewares.session
        .onRequest((call) => call('valid'))
        .onResponse(async () => {
          throw new Error('late boom');
        });
      const [result, , undeclared] = await client.routes.notes.getNote('a').call();
      expect(result).toBe('note a (1)');
      expect(undeclared?.type).toBe('middleware-on-response-failed');
      expect(undeclared?.publicMessage).toContain("onResponse for middleware 'session' failed: late boom");
    });

    it('a retry asked after an async hook finished is ignored', async () => {
      let late: (() => boolean) | undefined;
      client.middlewares.notes.audit.onError('audit-flagged', (_error, context) => {
        late = () => context.retry();
      });
      await client.routes.notes.getNote('a').call();
      expect(late?.()).toBe(false);
      expect((await runs(client.routes)).getNote).toBe(1);
    });
  });
});

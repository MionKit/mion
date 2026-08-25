/* ########
 * 2026 mion · License: MIT
 * ######## */
// Shared by the node and bun hono lanes so the two cannot drift apart.
export function buildApp(Hono, z, makeSchemas, updateUser, updateSimpleUser) {
  const {UserSchema, SimpleUserSchema} = makeSchemas(z);
  const app = new Hono();

  app.get('/hello', (c) => c.json({hello: 'world'}));

  const route = (schema, handler) => async (c) => {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({error: 'Validation failed'}, 400);
    return c.json(handler(parsed.data));
  };

  app.post('/updateUser', route(UserSchema, updateUser));
  app.post('/updateSimpleUser', route(SimpleUserSchema, updateSimpleUser));
  return app;
}

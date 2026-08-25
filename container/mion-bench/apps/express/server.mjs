/* ########
 * 2026 mion · License: MIT
 * ######## */
import express from 'express';
import {z} from 'zod';
import {makeSchemas, updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';

const {UserSchema, SimpleUserSchema} = makeSchemas(z);
const port = Number(process.env.MION_BENCH_PORT || 3000);
const app = express();

// A limit high enough for the payload sweep's multi-MB body; the default 100 KB
// would reject it and the lane would measure an error path.
app.use(express.json({limit: '10mb'}));
app.disable('etag');
app.disable('x-powered-by');

app.get('/hello', (req, res) => res.json({hello: 'world'}));

app.post('/updateUser', (req, res) => {
  const parsed = UserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error: 'Validation failed'});
  res.json(updateUser(parsed.data));
});

app.post('/updateSimpleUser', (req, res) => {
  const parsed = SimpleUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error: 'Validation failed'});
  res.json(updateSimpleUser(parsed.data));
});

app.listen(port);

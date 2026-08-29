// The mysql lane's runner, copied into the TRANSLATED tree beside
// mysql-common.ts AFTER the translation (it talks to drizzle directly, so it
// must not be rewritten itself). See runners/pg.test.ts for why the lane writes
// its own runners instead of vendoring drizzle's.
import {createConnection, type Connection} from 'mysql2/promise';
import {drizzle} from 'drizzle-orm/mysql2';
import {afterAll, beforeAll, beforeEach} from 'vitest';
import {skipTests} from '~/common';
import {tests} from './mysql-common';
import skipList from './skip-list.json' with {type: 'json'};

let connection: Connection;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  const connectionString = process.env['MYSQL_CONNECTION_STRING'];
  if (!connectionString) throw new Error('drizzle-e2e: MYSQL_CONNECTION_STRING is not set; the lane always points at the container mysql');
  // The suites create and drop tables constantly and read back multi-statement
  // results, which is what drizzle's own runner configures too.
  connection = await createConnection({uri: connectionString, supportBigNumbers: true, multipleStatements: true});
  db = drizzle(connection, {logger: false});
});

afterAll(async () => {
  await connection?.end();
});

beforeEach((ctx) => {
  ctx.mysql = {db};
});

skipTests(skipList.mysql.map((entry) => entry.test));

tests();

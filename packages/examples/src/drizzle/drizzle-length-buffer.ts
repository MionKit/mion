import {toDrizzlePGTable} from '@mionjs/drizzle';
// Note: Must use regular import (not `import type`) for reflection to work
import {String, UUIDv7} from '@ts-runtypes/core/formats';

/** Custom string format with an explicit maxLength */
type Username = String<{maxLength: 50}>;

interface User {
  id: UUIDv7;
  username: Username;
}

// Default lengthBuffer is 1.5 → username becomes varchar(75)
export const users = toDrizzlePGTable<User>('users');

// Custom lengthBuffer of 2.0 → username becomes varchar(100)
export const roomyUsers = toDrizzlePGTable<User>('users', undefined, {lengthBuffer: 2.0});

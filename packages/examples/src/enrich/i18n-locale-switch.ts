import {createFriendlyTextI18n} from '@mionjs/run-types';
import type {User} from './user';
import {friendlyUser} from './friendly-user';
import {pl_friendlyUser} from './i18n-pl';

// any {value} ref works: a plain object here, a Vue ref in a Vue app
const locale = {value: 'en'};

export const friendly = createFriendlyTextI18n<User>(friendlyUser, {
  locale, // read again on every render
  translations: {pl: pl_friendlyUser},
});

locale.value = 'pl'; // the next errors() call renders in Polish

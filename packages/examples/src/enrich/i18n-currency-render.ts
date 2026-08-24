import type {FriendlyText} from '@ts-runtypes/core';
import {createFriendlyTextI18n} from '@ts-runtypes/core';
import type {Order} from './i18n-currency-type';

const friendlyOrder: FriendlyText<Order> = {
  rt$label: 'Order',
  rt$errors: {type: ''},
  total: {rt$label: 'Total', rt$errors: {type: '', max: 'at most $[val]'}},
};
const de_friendlyOrder: FriendlyText<Order> = {
  rt$label: 'Bestellung',
  rt$errors: {type: ''},
  total: {rt$label: 'Summe', rt$errors: {type: '', max: 'höchstens $[val]'}},
};

export const friendly = createFriendlyTextI18n<Order>(friendlyOrder, {
  locale: 'de',
  translations: {de: de_friendlyOrder},
  currency: 'EUR',
});

// a violated max renders as "10.000,00 €" in German and "$10,000.00" in English:
// symbol, separators and decimals all follow the locale and the currency

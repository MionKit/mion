import type {FriendlyText} from '@mionjs/run-types';
import type {User} from './user';

// Fill what you can, leave the rest blank: a blank leaf keeps rendering in
// the source language.
export const pl_friendlyUser: FriendlyText<User> = {
  rt$label: 'Konto użytkownika',
  rt$errors: {type: ''},
  name: {
    rt$label: 'Imię i nazwisko',
    rt$errors: {
      type: '', // still blank: this one keeps rendering in the source language
      minLength: {
        one: '$[label] musi mieć co najmniej $[val] znak',
        few: '$[label] musi mieć co najmniej $[val] znaki',
        many: '$[label] musi mieć co najmniej $[val] znaków',
        other: '$[label] musi mieć co najmniej $[val] znaku',
      },
      maxLength: {one: '', few: '', many: '', other: ''},
    },
  },
  age: {
    rt$label: 'Wiek',
    rt$errors: {type: '', min: {one: '', few: '', many: '', other: ''}, max: {one: '', few: '', many: '', other: ''}},
  },
  isActive: {rt$label: '', rt$errors: {type: ''}},
  tags: {rt$label: 'Tagi', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
  profile: {
    rt$label: 'Profil',
    rt$errors: {type: ''},
    email: {
      rt$label: 'Adres e-mail',
      rt$errors: {type: '', minLength: '', maxLength: '', pattern: 'Podaj prawidłowy adres e-mail'},
    },
    score: {
      rt$label: '',
      rt$errors: {type: '', min: {one: '', few: '', many: '', other: ''}, max: {one: '', few: '', many: '', other: ''}},
    },
  },
};

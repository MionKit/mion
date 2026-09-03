import type {FriendlyText} from '@mionjs/run-types';
import type {User} from './user';

// src/.mion/enriched/i18n/es/models/user.ts: partially filled; blanks fall
// back to the source language at render time.
export const es_friendlyUser: FriendlyText<User> = {
  rt$label: 'Cuenta de usuario',
  rt$errors: {type: ''},
  name: {
    rt$label: 'Nombre completo',
    rt$errors: {
      type: '',
      minLength: {
        one: '$[label] necesita al menos $[val] carácter',
        many: '',
        other: '$[label] necesita al menos $[val] caracteres',
      },
      maxLength: {one: '', many: '', other: ''},
    },
  },
  age: {rt$label: 'Edad', rt$errors: {type: '', min: {one: '', many: '', other: ''}, max: {one: '', many: '', other: ''}}},
  isActive: {rt$label: '', rt$errors: {type: ''}},
  tags: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
  profile: {
    rt$label: 'Perfil',
    rt$errors: {type: ''},
    email: {rt$label: 'Correo electrónico', rt$errors: {type: '', minLength: '', maxLength: '', pattern: ''}},
    score: {rt$label: '', rt$errors: {type: '', min: {one: '', many: '', other: ''}, max: {one: '', many: '', other: ''}}},
  },
};

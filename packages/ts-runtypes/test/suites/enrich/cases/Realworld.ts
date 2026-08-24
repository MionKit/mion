import type * as TF from '@ts-runtypes/core/formats';
import type {FriendlyText, MockData} from '@ts-runtypes/core';
import type {EnrichCase} from './types.ts';

// Real-world composite shapes — nested objects, arrays, and format-branded
// members combined the way an application model looks. Exercises the full walk
// end-to-end. Mirrors the validation suite's REALWORLD range.
export const REALWORLD = {
  user: {
    title: 'User profile object',
    case: () => {
      // ##### src #####
      interface User {
        id: number;
        name: string;
        email: string;
        tags: string[];
        profile: {bio: string; age: number};
      }
      type Target = User;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        id: {rt$label: '', rt$errors: {type: ''}},
        name: {rt$label: '', rt$errors: {type: ''}},
        email: {rt$label: '', rt$errors: {type: ''}},
        tags: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
        profile: {
          rt$label: '',
          rt$errors: {type: ''},
          bio: {rt$label: '', rt$errors: {type: ''}},
          age: {rt$label: '', rt$errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        id: {pool: []},
        name: {pool: []},
        email: {pool: []},
        tags: {rt$items: {pool: []}, rt$length: [1, 3]},
        profile: {
          bio: {pool: []},
          age: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  registrationForm: {
    title: 'Registration form with formats',
    case: () => {
      // ##### src #####
      interface RegistrationForm {
        username: TF.String<{minLength: 3; maxLength: 20}>;
        email: TF.Email;
        age: TF.Number<{min: 18; max: 120}>;
        website: TF.Url;
      }
      type Target = RegistrationForm;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        username: {rt$label: '', rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}}},
        email: {
          rt$label: '',
          rt$errors: {type: '', maxLength: {one: '', other: ''}, minLength: {one: '', other: ''}, pattern: ''},
        },
        age: {rt$label: '', rt$errors: {type: '', max: {one: '', other: ''}, min: {one: '', other: ''}}},
        website: {rt$label: '', rt$errors: {type: '', maxLength: {one: '', other: ''}, pattern: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        username: {pool: []},
        email: {pool: []},
        age: {pool: []},
        website: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  order: {
    title: 'Order with nested line items',
    case: () => {
      // ##### src #####
      interface Order {
        orderId: string;
        total: number;
        items: {sku: string; qty: number; price: number}[];
        shipping: {address: string; city: string; zip: string};
      }
      type Target = Order;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        orderId: {rt$label: '', rt$errors: {type: ''}},
        total: {rt$label: '', rt$errors: {type: ''}},
        items: {
          rt$label: '',
          rt$errors: {type: ''},
          rt$items: {
            rt$label: '',
            rt$errors: {type: ''},
            sku: {rt$label: '', rt$errors: {type: ''}},
            qty: {rt$label: '', rt$errors: {type: ''}},
            price: {rt$label: '', rt$errors: {type: ''}},
          },
        },
        shipping: {
          rt$label: '',
          rt$errors: {type: ''},
          address: {rt$label: '', rt$errors: {type: ''}},
          city: {rt$label: '', rt$errors: {type: ''}},
          zip: {rt$label: '', rt$errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        orderId: {pool: []},
        total: {pool: []},
        items: {
          rt$items: {
            sku: {pool: []},
            qty: {pool: []},
            price: {pool: []},
          },
          rt$length: [1, 3],
        },
        shipping: {
          address: {pool: []},
          city: {pool: []},
          zip: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  blogPost: {
    title: 'Blog post with arrays and dates',
    case: () => {
      // ##### src #####
      interface BlogPost {
        title: string;
        body: string;
        publishedAt: Date;
        tags: string[];
        author: {name: string; email: string};
      }
      type Target = BlogPost;
      // ##### friendly #####
      const friendlyTarget: FriendlyText<Target> = {
        rt$label: '',
        rt$errors: {type: ''},
        title: {rt$label: '', rt$errors: {type: ''}},
        body: {rt$label: '', rt$errors: {type: ''}},
        publishedAt: {rt$label: '', rt$errors: {type: ''}},
        tags: {rt$label: '', rt$errors: {type: ''}, rt$items: {rt$label: '', rt$errors: {type: ''}}},
        author: {
          rt$label: '',
          rt$errors: {type: ''},
          name: {rt$label: '', rt$errors: {type: ''}},
          email: {rt$label: '', rt$errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        title: {pool: []},
        body: {pool: []},
        publishedAt: {pool: []},
        tags: {rt$items: {pool: []}, rt$length: [1, 3]},
        author: {
          name: {pool: []},
          email: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;

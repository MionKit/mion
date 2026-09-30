import {createMionRouter} from '@mionjs/router';

// list up to 200 methods when a client asks for all of them (100 by default)
export const mion = createMionRouter({getAllRemoteMethodsMaxNumber: 200});

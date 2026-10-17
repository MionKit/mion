import {createMionRouter} from '@mionjs/router';

// sent on every response, errors included, whatever the platform
createMionRouter({responseHeaders: {'x-api': 'store'}});

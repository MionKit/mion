import {createMionRouter} from '@mionjs/router';

// also sent on error responses
createMionRouter({responseHeaders: {'x-api': 'store'}});

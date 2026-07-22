import {registerMionPureFn} from '@mionjs/core';

// Server pure functions live in the ts-runtypes registry under a namespace and are referenced
// by name from the client build (serverMapFrom). registerMionPureFn takes a factory that returns
// the actual function, so its dependencies can be captured at registration time.
registerMionPureFn(
    'myNamespace',
    () =>
        function isNotEmpty(value: string): boolean {
            return value.length > 0;
        }
);

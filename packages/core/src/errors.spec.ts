/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouteError, setErrorOptions} from './routeError';

describe('Route errors should', () => {
    it('automatically generate an dis when RouteOptions autoGenerateErrorId is set to true', () => {
        setErrorOptions({autoGenerateErrorId: true});
        const error = new RouteError({statusCode: 400, publicMessage: 'error'});

        expect(typeof error.id).toEqual('string');
        expect((error.id as string).length).toEqual(61);

        setErrorOptions({autoGenerateErrorId: false});
        const error2 = new RouteError({statusCode: 400, publicMessage: 'error'});
        expect(error2.id).toEqual(undefined);
    });
});

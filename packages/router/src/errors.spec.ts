/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouteError} from './errors';
import {initRouter, resetRouter} from './router';

describe('Route errors should', () => {
    it('automatically generate an dis when RouteOptions autoGenerateErrorId is set to true', () => {
        initRouter({autoGenerateErrorId: true});
        const error = new RouteError({statusCode: 400, publicMessage: 'error'});

        expect(typeof error.id).toEqual('string');
        expect((error.id as string).length).toEqual(61);

        resetRouter();

        initRouter({autoGenerateErrorId: false});
        const error2 = new RouteError({statusCode: 400, publicMessage: 'error'});
        expect(error2.id).toEqual(undefined);
    });
});

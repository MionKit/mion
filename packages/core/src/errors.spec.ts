/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, setErrorOptions} from './errors';

describe('Route errors should', () => {
    it('automatically generate an id when RouteOptions autoGenerateErrorId is set to true', () => {
        setErrorOptions({autoGenerateErrorId: true});
        const error = new RpcError({statusCode: 400, publicMessage: 'error'});

        expect(typeof error.id).toEqual('string');
        expect((error.id as string).length).toEqual(61);

        setErrorOptions({autoGenerateErrorId: false});
        const error2 = new RpcError({statusCode: 400, publicMessage: 'error'});
        expect(error2.id).toEqual(undefined);
    });

    it('Parse and Stringify errors using JSON', () => {
        const error = new RpcError({
            id: '123WS',
            statusCode: 400,
            publicMessage: 'this is a public message',
            message: 'this is a private message',
            errorData: {data: 'data'},
        });

        const stringifiedError = JSON.stringify(error);
        const parsedError = new RpcError(JSON.parse(stringifiedError));
        expect(parsedError).toEqual(error);

        const errorWithSameMessage = new RpcError({
            id: '123WX',
            statusCode: 400,
            publicMessage: 'this is a message',
            message: 'this is a message',
            errorData: {data: 'data'},
        });

        const stringifiedError2 = JSON.stringify(errorWithSameMessage);
        const parsedError2 = new RpcError(JSON.parse(stringifiedError2));
        expect(parsedError2).toEqual(errorWithSameMessage);
    });
});

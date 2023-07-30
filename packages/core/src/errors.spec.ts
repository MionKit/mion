/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicError, RouteError, setErrorOptions} from './errors';

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

    it('Parse and Stringify errors using JSON', () => {
        const error = new RouteError({
            id: '123WS',
            statusCode: 400,
            publicMessage: 'this is a public message',
            message: 'this is a private message',
            publicData: {data: 'data'},
        });
        const publicError = error.toPublicError();

        const stringifiedError = JSON.stringify(error);
        const stringifiedPublicError = JSON.stringify(publicError);
        const parsedError = new RouteError(JSON.parse(stringifiedError));
        const parsedPublicError = new PublicError(JSON.parse(stringifiedPublicError));
        expect(parsedError).toEqual(error);
        expect(parsedPublicError).toEqual(publicError);

        const errorWithSameMessage = new RouteError({
            id: '123WX',
            statusCode: 400,
            publicMessage: 'this is a message',
            message: 'this is a message',
            publicData: {data: 'data'},
        });
        const publicErrorWithSameMessage = errorWithSameMessage.toPublicError();

        const stringifiedError2 = JSON.stringify(errorWithSameMessage);
        const stringifiedPublicError2 = JSON.stringify(publicErrorWithSameMessage);
        const parsedError2 = new RouteError(JSON.parse(stringifiedError2));
        const parsedPublicError2 = new PublicError(JSON.parse(stringifiedPublicError2));
        expect(parsedError2).toEqual(errorWithSameMessage);
        expect(parsedPublicError2).toEqual(publicErrorWithSameMessage);
    });
});

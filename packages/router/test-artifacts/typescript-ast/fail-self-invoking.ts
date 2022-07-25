import {ApiRoute} from '@apids/router/src/types';

interface Request {
    username: string;
}

interface Response {
    sentence: string;
}

// self invoked function declaring type
export const selfInvokedReturningAnonimousFunctionWithTypes: ApiRoute<Request, Response> = (() => {
    const route: ApiRoute<Request, Response> = function (body, req, reply, app) {
        return {sentence: `hello to ${body.username}`};
    };
    return route;
})();

import {CallContext} from '@mionkit/router';

export type Handler<Context extends CallContext = any, Ret = any, Params extends any[] = any[]> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    ...parameters: Params
) => Ret;


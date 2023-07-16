/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AsyncLocalStorage} from 'node:async_hooks';
import {Context, Obj} from './types';

const asyncLocalStorage = new AsyncLocalStorage<Context<any>>();

export function getCallContext<CC extends Context<any> = Context<any>>(): CC {
    return asyncLocalStorage.getStore() as CC;
}

export function getAsyncLocalStorage() {
    return asyncLocalStorage;
}

const options: Obj = {};
const defaultOptions: Obj = {};

export function addDefaultGlobalOptions<Opts extends Obj>(newOptions: Opts): Readonly<Opts> {
    // if newOptions has a kay already existing on defaultOptions, then throw an error, the error should contain the conflicting keys
    let lastKey;
    const hasDuplicate = Object.keys(newOptions).some((key) => {
        lastKey = key;
        return key in defaultOptions;
    });
    if (hasDuplicate) throw new Error(`Cannot add duplicated default options, key: ${lastKey}`);
    Object.assign(defaultOptions, newOptions);
    updateGlobalOptions(newOptions);
    return newOptions as Readonly<Opts>;
}

export function updateGlobalOptions<Opts extends Obj>(newOptions?: Partial<Opts>): Readonly<Opts> {
    if (!newOptions) return options as Readonly<Opts>;
    Object.assign(options, newOptions);
    return options as Readonly<Opts>;
}

export function getGlobalOptions<Opts extends Obj>(): Readonly<Opts> {
    return options as Readonly<Opts>;
}

export function resetGlobalOptions() {
    for (const key in options) {
        // eslint-disable-next-line no-prototype-builtins
        if (options.hasOwnProperty(key)) {
            delete options[key];
        }
    }
    Object.assign(options, defaultOptions);
}

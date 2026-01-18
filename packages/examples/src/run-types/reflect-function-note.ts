import {reflectFunction} from '@mionkit/run-types';

function sayHello(name: string): string {
    return `Hello ${name}`;
}

const fnType = reflectFunction(sayHello);
// fnType = FunctionRunType<type (name: string) => string>


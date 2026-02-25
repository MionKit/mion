import {runType, reflectFunction} from '@mionkit/run-types';

interface User {
    id: string;
    name: string;
    createdAt: Date;
}

// start-runtype
function runTypeExample() {
    const userRunType = runType<User>();
    // Access type metadata, children, etc.
}
// end-runtype

// start-reflect-function
function createUser(name: string, age: number): User {
    return {id: '123', name, createdAt: new Date()};
}

function reflectFunctionExample() {
    const fnReflection = reflectFunction(createUser);
    // Access parameter types, return type, etc.
}
// end-reflect-function

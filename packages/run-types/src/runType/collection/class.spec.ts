/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

class MySerializableClass {
    name: string;
    surname: string;
    id: number;
    startDate: Date;
    constructor() {
        this.name = 'John';
        this.surname = 'Doe';
        this.id = 0;
        this.startDate = new Date();
    }

    getConstructorParams(): [] {
        return [];
    }

    getFullName() {
        return `${this.name} ${this.surname}`;
    }
}

const serializable = new MySerializableClass();

const rt = runType<MySerializableClass>();

it('validate class', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(serializable)).toBe(true);
});

it('validate empty class', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(new MySerializableClass())).toBe(true);
});

it('validate class + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(serializable)).toEqual([]);
});

it('mock class', async () => {
    const mock = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(mock instanceof MySerializableClass).toBeTruthy();
    expect(validate(mock)).toBe(true);
});

describe('Classes that extend other classes', () => {
    class BaseClass {
        baseProp: string = 'base';
    }
    class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
    }
    const rtExtended = runType<ExtendedClass>();
    const extended = new ExtendedClass();
    const base = new BaseClass();

    it('validate all properties of extended class', () => {
        const validate = rtExtended.createJitFunction(JitFunctions.isType);
        expect(validate(extended)).toBe(true);
        expect(validate(base)).toBe(false);
    });

    it('validate extended class + errors', () => {
        const valWithErrors = rtExtended.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors(extended)).toEqual([]);
        expect(valWithErrors(base)).toEqual([{path: ['extendedProp'], expected: 'string'}]);
        expect(valWithErrors(null)).toEqual([{path: [], expected: 'class'}]);
    });

    it('mock extended class', async () => {
        const mock = await rtExtended.mock();
        const validate = rtExtended.createJitFunction(JitFunctions.isType);
        expect(mock instanceof ExtendedClass).toBeTruthy();
        expect(validate(mock)).toBe(true);
    });
});

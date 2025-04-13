import {createIsTypeFunction} from '../../runType';

it('create type validation', () => {
    type MyObject = {
        startDate: Date;
        quantity: number;
        name: string;
        bigInt: bigint;
        optionalS?: string;
    };
    const validateMyObj = createIsTypeFunction<MyObject>();

    expect(
        validateMyObj({
            startDate: new Date(),
            quantity: 10,
            name: 'hello',
            bigInt: BigInt(10),
        })
    ).toBe(true);

    // GENERATED CODE
    function f1_validateMyObj(v) {
        return (
            typeof v === 'object' &&
            v !== null &&
            v.startDate instanceof Date &&
            !isNaN(v.startDate.getTime()) &&
            Number.isFinite(v.quantity) &&
            typeof v.name === 'string' &&
            typeof v.bigInt === 'bigint' &&
            (v.optionalS === undefined || typeof v.optionalS === 'string')
        );
    }
});

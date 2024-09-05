/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {InterfaceRunType} from './interface';
import {NeverRunType} from '../atomicRunType/never';

type IntersectionType = {
    prop3: string;
    prop4?: null;
    prop5?: string[];
} & {
    prop1: Date;
    prop2: number;
    readonly prop3: string;
    prop4: null;
    readonly prop5: string[];
};

// when using atomic type and types are different it should resolve to never
type typeNever1 = number & string;
// when two object have a property with a literal but different type it should resolve to never
type typeNever2 = {
    prop1: 2;
    prop2: string;
} & {
    prop1?: string;
    prop2: string;
};

const rt = runType<IntersectionType>();
const rtNever1 = runType<typeNever1>();
const rtNever2 = runType<typeNever2>();

const inter: IntersectionType = {
    prop1: new Date(),
    prop2: 123,
    prop3: 'hello',
    //note prop4 is optional in one of the types but required in the other so is required in the intersection
    prop4: null,
    prop5: ['a', 'b', 'c'],
};

// note that prop5 is readonly in one of the types but not in the other so is not readonly in the intersection
inter.prop5 = ['a', 'b', 'c'];

it('Intersections generate already resolved types', () => {
    expect(rt instanceof InterfaceRunType).toBe(true);
    expect(rtNever1 instanceof NeverRunType).toBe(true);
    expect(rt.jitId).toBe('30{prop1:date,prop2:6,prop3:5,prop4:10,prop5:25:5}');
    expect(rtNever1.jitId).toBe(0);
});

// TODO, this is a but in DeepKit, it should resolve to never
it.skip('property literal + incorrect type in second object should resolve to never', () => {
    expect(rtNever2 instanceof NeverRunType).toBe(true);
    expect(rtNever2.jitId).toBe(0);
});

// TODO: there might be some scenarios where intersection is called but can't reproduce them

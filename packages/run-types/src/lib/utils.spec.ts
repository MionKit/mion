/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {it, expect} from 'vitest';
import {JitFunctions} from '../constants.functions.ts';
import type {BaseRunType, CollectionRunType} from './baseRunTypes.ts';
import {JitFnCompiler} from './jitFnCompiler.ts';
import {runType} from '../createRunType.ts';
import {getTotalComplexity, sortDiscriminatorsFirst, sortRunTypeByComplexity} from './utils.ts';
import type {PropertyRunType} from '../nodes/member/property.ts';

const anyRT = runType<any>() as BaseRunType;
// the compiled is just requires to get compiler opts, so we can use same compiler for all tests
const comp = new JitFnCompiler(anyRT, JitFunctions.isType.id);

it('sort by total complexity preserving order of appearance', () => {
    // atomic
    const rtString = runType<string>() as BaseRunType;
    const rtNumber = runType<number>() as BaseRunType;
    expect([rtString, rtNumber].toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual([rtString, rtNumber]);
    // array
    const rtArrString = runType<string[]>() as BaseRunType;
    const rtArrNumber = runType<number[]>() as BaseRunType;
    expect([rtArrString, rtArrNumber].toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual([
        rtArrString,
        rtArrNumber,
    ]);
    // props
    const rtParent = runType<{a: string; b: number}>() as CollectionRunType<any>;
    const props = rtParent.getJitChildren(comp);
    expect(props.toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual(props);
    // collection
    const rtObject = runType<{a: string; b: number}>() as BaseRunType;
    const rtArray = runType<{c: string; d: number}>() as BaseRunType;
    expect([rtObject, rtArray].toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual([rtObject, rtArray]);
});

it('index property will always be more complex than other properties', () => {
    const rtIndex = runType<{[key: string]: string; a: string; b: string}>() as CollectionRunType<any>;
    const propsIndex = rtIndex.getJitChildren(comp);
    expect(propsIndex.toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual([
        propsIndex[1],
        propsIndex[2],
        propsIndex[0],
    ]);
});

it('sort by total complexity A < M < C < F', () => {
    const rtString = runType<string>() as BaseRunType;
    const rtNumber = runType<number>() as BaseRunType;
    const rtArrString = runType<string[]>() as BaseRunType;
    const rtArrNumber = runType<number[]>() as BaseRunType;
    const rtObject = runType<{a: string; b: number}>() as BaseRunType;
    const rtIndex = runType<{[a: string]: string; b: string}>() as CollectionRunType<any>;
    const rtArrayObject = runType<{c: string; d: number}[]>() as BaseRunType;
    const rtFunction = runType<() => void>() as BaseRunType;

    expect(getTotalComplexity(comp, rtString)).toBe(2);
    expect(getTotalComplexity(comp, rtNumber)).toBe(2);
    expect(getTotalComplexity(comp, rtObject)).toBe(14);
    expect(getTotalComplexity(comp, rtArrString)).toBe(32);
    expect(getTotalComplexity(comp, rtArrNumber)).toBe(32);
    expect(getTotalComplexity(comp, rtIndex)).toBe(34);
    expect(getTotalComplexity(comp, rtArrayObject)).toBe(44);
    expect(getTotalComplexity(comp, rtFunction)).toBe(10_000_000);

    const shuffled1 = [rtIndex, rtNumber, rtString, rtArrString, rtArrNumber, rtObject, rtArrayObject, rtFunction];
    const shuffled2 = [rtFunction, rtIndex, rtArrayObject, rtObject, rtString, rtArrNumber, rtArrString, rtNumber];
    const shuffled3 = [rtIndex, rtFunction, rtArrayObject, rtArrString, rtNumber, rtObject, rtArrNumber, rtString];

    const expected1 = [rtNumber, rtString, rtObject, rtArrString, rtArrNumber, rtIndex, rtArrayObject, rtFunction];
    const expected2 = [rtString, rtNumber, rtObject, rtArrNumber, rtArrString, rtIndex, rtArrayObject, rtFunction];
    const expected3 = [rtNumber, rtString, rtObject, rtArrString, rtArrNumber, rtIndex, rtArrayObject, rtFunction];
    expect(shuffled1.toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual(expected1);
    expect(shuffled2.toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual(expected2);
    expect(shuffled3.toSorted((a, b) => sortRunTypeByComplexity(comp, a, b))).toEqual(expected3);

    const rtBoolean = runType<boolean>() as BaseRunType;
    const rtNull = runType<null>() as BaseRunType;
    expect(getTotalComplexity(comp, rtBoolean)).toBe(1);
    expect(getTotalComplexity(comp, rtNull)).toBe(1);

    enum Color {
        Red,
        Green = 'green',
        Blue = 2,
    }
    const rtEnum = runType<Color>() as BaseRunType;
    expect(getTotalComplexity(comp, rtEnum)).toBe(20);
});

it('discriminator property should be sorted first', () => {
    type UnionDisc =
        | {otherProp: boolean; type: 'a'}
        | {otherProp: number; type: 'b'}
        | {otherProp: string; type: 'c'; time: Date}
        | {type: boolean; otherProp: string};

    const rt = runType<UnionDisc>() as CollectionRunType<any>;
    const children = rt.getJitChildren(comp) as CollectionRunType<any>[];
    const propsItem0 = children[0].getJitChildren(comp) as PropertyRunType[];
    const unionItem1 = children[1].getJitChildren(comp) as PropertyRunType[];
    const unionItem2 = children[2].getJitChildren(comp) as PropertyRunType[];
    const unionItem3 = children[3].getJitChildren(comp) as PropertyRunType[];
    propsItem0[1].isUnionDiscriminator = true;
    unionItem1[1].isUnionDiscriminator = true;
    unionItem2[1].isUnionDiscriminator = true;
    unionItem3[0].isUnionDiscriminator = true;

    function getSortedPropsNames(children: PropertyRunType[]) {
        return children.toSorted((a, b) => sortRunTypeByComplexity(comp, a, b)).map((prop) => prop.getChildVarName(comp));
    }

    expect(getSortedPropsNames(propsItem0)).toEqual(['type', 'otherProp']);
    expect(getSortedPropsNames(unionItem1)).toEqual(['type', 'otherProp']);
    expect(getSortedPropsNames(unionItem2)).toEqual(['type', 'otherProp', 'time']);
    expect(getSortedPropsNames(unionItem3)).toEqual(['type', 'otherProp']);
});

it('should sort discriminators first', () => {
    const rt = runType<{otherProp1: string; type: 'a'} | {otherProp2: number; type: 'b'}>() as CollectionRunType<any>;
    const children = rt.getJitChildren(comp) as CollectionRunType<any>[];
    const propsItem0 = children[0].getJitChildren(comp) as PropertyRunType[];
    const propsItem1 = children[1].getJitChildren(comp) as PropertyRunType[];
    propsItem0[1].isUnionDiscriminator = true;
    propsItem1[1].isUnionDiscriminator = true;

    function getSortedPropsNames(children: PropertyRunType[]) {
        return children.toSorted((a, b) => sortDiscriminatorsFirst(a, b)).map((prop) => prop.getChildVarName(comp));
    }

    expect(getSortedPropsNames(propsItem0)).toEqual(['type', 'otherProp1']);
    expect(getSortedPropsNames(propsItem1)).toEqual(['type', 'otherProp2']);
});

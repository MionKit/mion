/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {MockContext, RunType} from '../types';
import {random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {JitDefaultOp, JitTypeErrorCompileOp} from '../jitOperation';
import {getExpected, getJitErrorPath, memo} from '../utils';
import {InterfaceRunType} from './interface';
import {ClassRunType} from './class';
import {IntersectionRunType} from './intersection';
import {UnionInterfaceRunType} from '../mergerRunType/unionInterface';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends CollectionRunType<TypeUnion> {
    src: TypeUnion = null as any; // will be set after construction

    // #### collection's jit code ####
    _compileIsType(cop: JitDefaultOp): string {
        const strictTypes = cop.compileOptions.strictTypes;
        cop.compileOptions.strictTypes = true; // strictTypes ensures no extra properties of the union go unchecked
        const children = this.getJitChildren();
        const code = `(${children.map((rt) => rt.compileIsType(cop)).join(' || ')})`;
        cop.compileOptions.strictTypes = strictTypes;
        return code;
    }

    // this version just heck if has error and return an single error in the root of the union.
    // if all types we cant know one the user was trying to use.
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const strictTypes = cop.compileOptions.strictTypes;
        cop.compileOptions.strictTypes = true; // strictTypes ensures no extra properties of the union go unchecked
        const children = this.getJitChildren();
        const isType = `(${children.map((rt) => rt.compileIsType(cop)).join(' || ')})`;
        const errorsPath = getJitErrorPath(cop);
        const code = `if (!${isType}) ${cop.args.εrr}.push({path: ${errorsPath}, expected: ${getExpected(this)}});`;
        cop.compileOptions.strictTypes = strictTypes;
        return code;
    }

    /**
     * When a union is encode to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileJsonEncode(cop: JitDefaultOp): string {
        const strictTypes = cop.compileOptions.strictTypes;
        cop.compileOptions.strictTypes = true; // strictTypes ensures no extra properties of the union go unchecked
        const childrenCode = this.getJitChildren()
            .map((rt, i) => {
                const itemCode = rt.compileJsonEncode(cop);
                const itemIsType = rt.compileIsType(cop);
                const iF = i === 0 ? 'if' : 'else if';
                // item encoded before reassigning varName to [i, item]
                return `${iF} (${itemIsType}) {${itemCode}; ${cop.vλl} = [${i}, ${cop.vλl}]}`;
            })
            .filter((c) => !!c)
            .join('');
        const code = `
            ${childrenCode}
            else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${cop.vλl}?.constructor?.name || typeof ${cop.vλl}) }
        `;

        cop.compileOptions.strictTypes = strictTypes;
        return code;
    }
    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileJsonDecode(cop: JitDefaultOp): string {
        const strictTypes = cop.compileOptions.strictTypes;
        cop.compileOptions.strictTypes = true; // strictTypes ensures no extra properties of the union go unchecked
        const decVar = `dεc${this.getNestLevel()}`;
        const childrenCode = this.getJitChildren()
            .map((rt, i) => {
                const itemCode = `${rt.compileJsonDecode(cop)};`;
                const iF = i === 0 ? 'if' : 'else if';
                // item is decoded before being extracted from the array
                return `${iF} ( ${decVar} === ${i}) {${cop.vλl} = ${cop.vλl}[1]; ${itemCode}}`;
            })
            .filter((c) => !!c)
            .join('');
        const code = `
                const ${decVar} = ${cop.vλl}[0];
                ${childrenCode}
                else { throw new Error('Can not decode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${cop.vλl}?.constructor?.name || typeof ${cop.vλl}) }
            `;
        cop.compileOptions.strictTypes = strictTypes;
        return code;
    }
    _compileJsonStringify(cop: JitDefaultOp): string {
        const strictTypes = cop.compileOptions.strictTypes;
        cop.compileOptions.strictTypes = true; // strictTypes ensures no extra properties of the union go unchecked
        const childrenCode = this.getJitChildren()
            .map((rt, i) => {
                const itemIsType = rt.compileIsType(cop);
                return `if (${itemIsType}) {return ('[' + ${i} + ',' + ${rt.compileJsonStringify(cop)} + ']');}`;
            })
            .filter((c) => !!c)
            .join('');
        const code = `
            ${childrenCode}
            else { throw new Error('Can not stringify union: expected one of <${this.getUnionTypeNames()}> but got ' + ${cop.vλl}?.constructor?.name || typeof ${cop.vλl}) }
        `;
        cop.compileOptions.strictTypes = strictTypes;
        return code;
    }
    mock(ctx?: Pick<MockContext, 'unionIndex'>): any {
        if (ctx?.unionIndex && (ctx.unionIndex < 0 || ctx.unionIndex >= this.getChildRunTypes().length)) {
            throw new Error('unionIndex must be between 0 and the number of types in the union');
        }
        const index = ctx?.unionIndex ?? random(0, this.getChildRunTypes().length - 1);
        return this.getChildRunTypes()[index].mock(ctx);
    }
    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getName())
            .join(' | ');
    }

    /** TODO: this version returns an error for every single item in the union.
     * This version checks all properties but would allow for Partial or empty objects to be valid.
     * We would need to group the types by the ones that expert an array an object or any other type. and only push errors related to that type */
    private _compileTypeErrorsTODO(cop: JitTypeErrorCompileOp): string {
        const children = this.getMergedJitChildren();

        const countVar = `εrrCount${this.getNestLevel()}`;
        const startVar = `εrrStart${this.getNestLevel()}`;
        const indexVar = `uε${this.getNestLevel()}`;

        return `
            const ${startVar} = ${cop.args.εrr}.length;
            for (let ${indexVar} = 0; ${indexVar} < ${children.length}; ${indexVar}++) {
                const ${countVar} = ${cop.args.εrr}.length;
                switch (${indexVar}) {
                    ${children.map((rt, i) => `case ${i}: {${rt.compileTypeErrors(cop)}; break;}`).join('\n')}
                }
                // if no errors were added, means that the type is valid, we clear previous errors and return
                if (${countVar} === ${cop.args.εrr}.length) {
                    ${cop.args.εrr}.splice(${startVar} - ${cop.args.εrr}.length);
                    break;
                }
            }
        `;
    }

    // typescript merge all properties of interfaces, classes and object literals in the union.
    private getMergedJitChildren = memo((): RunType[] => {
        let mergedInterface: UnionInterfaceRunType | undefined;
        const children = this.getJitChildren();
        const nonInterfaceChildren: RunType[] = [];
        for (const rt of children) {
            const shouldMerge = rt instanceof InterfaceRunType || rt instanceof ClassRunType || rt instanceof IntersectionRunType;
            if (shouldMerge) {
                mergedInterface = this.initMergedInterface(mergedInterface, rt);
            } else {
                nonInterfaceChildren.push(rt);
            }
        }
        if (mergedInterface) nonInterfaceChildren.push(mergedInterface);
        return nonInterfaceChildren;
    });

    private initMergedInterface(mergedInterface: UnionInterfaceRunType | undefined, rt: RunType) {
        if (!mergedInterface) mergedInterface = new UnionInterfaceRunType();
        mergedInterface.mergeInterface(rt as InterfaceRunType);
        return mergedInterface;
    }

    hasReturnCompileJsonStringify(): boolean {
        return true;
    }
}

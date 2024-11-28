/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitConstants, JitFnID, Mutable, SrcType} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitFnIDs} from '../../constants';
import {BasicMemberRunType} from '../member/basicMember';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, TypeClass} from '../../lib/_deepkit/src/reflection/type';

class MapKeyRunType extends BasicMemberRunType<any> {
    index = 0;
    getStaticPathLiteral(fnId: JitFnID): string | number {
        const parent = this.getParent()!;
        const custom = parent.getCustomVλl(fnId)!;
        if (fnId === JitFnIDs.jsonDecode) return custom.vλl;
        const keyRef = `${custom.vλl}[0]`;
        return `['key',${keyRef}]`;
    }
}

class MapValueRunType extends BasicMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(fnId: JitFnID): string | number {
        const parent = this.getParent()!;
        const custom = parent.getCustomVλl(fnId)!;
        if (fnId === JitFnIDs.jsonDecode) return custom.vλl;
        const keyRef = `${custom.vλl}[0]`;
        return `['val',${keyRef}]`;
    }
}

export class MapRunType extends ClassRunType {
    keyRT = new MapKeyRunType();
    valueRT = new MapValueRunType();
    children = [this.keyRT, this.valueRT];
    getCustomVλl(fnId: JitFnID) {
        // jsonDecode is decoding a regular array so no need to use an special case for vλl as other operations
        if (fnId === JitFnIDs.jsonDecode) return {vλl: `mi${this.getNestLevel()}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `me${this.getNestLevel()}`, isStandalone: true};
    }
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        return {
            ...(super.getJitConstants(stack) as Mutable<JitConstants>),
            skipJsonEncode: false, // we need to be sure to parse all entries wen encoding
            // is jsonDecode is not needed for children we just can assign the entries directly to a new Map
        };
    }
    getJsonEncodeChildren(): BaseRunType[] {
        return this.getJitChildren();
    }
    getJsonDecodeChildren(): BaseRunType[] {
        return this.getJitChildren();
    }
    linkSrc(src: SrcType<TypeClass>): void {
        const mapTypes = src.arguments;
        if (!mapTypes || mapTypes.length !== 2) throw new Error('MapRunType expects 2 type arguments: ie: Map<string, number>');
        super.linkSrc(src);
        this.keyRT.linkSrc({
            kind: ReflectionKind.parameter,
            parent: src,
            type: mapTypes[0],
            subKind: ReflectionSubKind.indexedMember,
        });
        this.valueRT.linkSrc({
            kind: ReflectionKind.parameter,
            parent: src,
            type: mapTypes[1],
            subKind: ReflectionSubKind.indexedMember,
        });
    }
    getChildRunTypes = (): BaseRunType[] => {
        return this.children;
    };

    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
                return true;
            case JitFnIDs.jsonStringify:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    _compileIsType(comp: JitCompiler): string {
        const entry = this.getCustomVλl(JitFnIDs.isType).vλl;
        const childrenCode = this.getJitChildren()
            .map((c) => `if (!(${c.compileIsType(comp)})) return false`)
            .join(';');
        return `
            if (!(${comp.vλl} instanceof Map)) return false;
            for (const ${entry} of ${comp.vλl}) {${childrenCode}}
            return true;
        `;
    }

    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const entry = this.getCustomVλl(JitFnIDs.typeErrors).vλl;
        const childrenCode = this.getJitChildren()
            .map((c) => c.compileTypeErrors(comp))
            .join(';');
        return `
            if (!(${comp.vλl} instanceof Map)){${comp.callJitErr(this)}}
            else {for (const ${entry} of ${comp.vλl}) {${childrenCode}}}
        `;
    }

    _compileJsonEncode(comp: JitCompiler): string {
        const entry = this.getCustomVλl(JitFnIDs.jsonEncode).vλl;
        const resName = `ml${this.getNestLevel()}`;
        const childrenCode = this.getJsonEncodeChildren()
            .map((c) => c.compileJsonEncode(comp))
            .filter((c) => c)
            .join(';');
        return `
            const ${resName} = [];
            for (const ${entry} of ${comp.vλl}) {${childrenCode} ${resName}.push(${entry})}
            ${comp.vλl} = ${resName};
        `;
    }

    _compileJsonDecode(comp: JitCompiler): string {
        const skipKey = !this.keyRT.getJsonDecodeChild();
        const skipValue = !this.valueRT.getJsonDecodeChild();
        if (skipKey && skipValue) {
            return `${comp.vλl} = new Map(${comp.vλl})`;
        }
        const index = this.getCustomVλl(JitFnIDs.jsonDecode).vλl;
        const childrenCode = this.getJsonDecodeChildren()
            .map((c) => c.compileJsonDecode(comp))
            .filter((c) => c)
            .join(';');
        return `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {${childrenCode}}
            ${comp.vλl} = new Map(${comp.vλl})
        `;
    }

    _compileJsonStringify(comp: JitCompiler): string {
        const entry = this.getCustomVλl(JitFnIDs.jsonStringify).vλl;
        const childrenCode = this.getJitChildren()
            .map((c) => c.compileJsonStringify(comp))
            .join('+');

        const jsonItems = `ls${this.getNestLevel()}`;
        const resultVal = `res${this.getNestLevel()}`;
        return `
            const ${jsonItems} = [];
            for (const ${entry} of ${comp.vλl}) {
                const ${resultVal} = '['+${childrenCode}+']';
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
    }

    // TODO: Implement the following methods, shoild just call same compile method for children, look into to array run type

    _compileHasUnknownKeys(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

    _compileUnknownKeyErrors(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

    _compileStripUnknownKeys(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

    _mock(): Map<any, any> {
        // ctx: MockOperation
        // Generate a mock Map
        // const mockMap = new Map();
        // const keyType = runType(this.src.typeArguments![0]);
        // const valueType = runType(this.src.typeArguments![1]);
        // // ...existing code...
        // const size = ctx.faker.datatype.number({min: 1, max: 5});
        // for (let i = 0; i < size; i++) {
        //     const key = keyType.mock(ctx);
        //     const value = valueType.mock(ctx);
        //     mockMap.set(key, value);
        // }
        // return mockMap;
        return new Map();
    }
}

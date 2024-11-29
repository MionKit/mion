/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitConstants, JitFnID, MockOperation, Mutable, SrcType} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitFnIDs} from '../../constants';
import {BasicMemberRunType} from '../member/basicMember';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, TypeClass} from '../../lib/_deepkit/src/reflection/type';
import {random} from '../../lib/mock';

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
            skipJsonEncode: false, // we always need to transform the map to an array when encoding
            skipJsonDecode: false, // we always need to transform the array to a map when decoding
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
            case JitFnIDs.jsonStringify:
            case JitFnIDs.hasUnknownKeys:
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
        if (skipKey && skipValue) return `${comp.vλl} = new Map(${comp.vλl})`;
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
        const keyCode = this.keyRT.compileHasUnknownKeys(comp);
        const valueCode = this.valueRT.compileHasUnknownKeys(comp);
        if (!keyCode && !valueCode) return 'return false';
        const entry = this.getCustomVλl(JitFnIDs.hasUnknownKeys).vλl;
        return `
            if (!(${comp.vλl} instanceof Map)) return false;
            for (const ${entry} of ${comp.vλl}) {
                ${keyCode ? `if (${keyCode}) return true;` : ''}
                ${valueCode ? `if (${valueCode}) return true;` : ''}
            }
            return false;
        `;
    }

    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        const keyCode = this.keyRT.compileUnknownKeyErrors(comp);
        const valueCode = this.valueRT.compileUnknownKeyErrors(comp);
        if (!keyCode && !valueCode) return '';
        const varName = comp.vλl;
        const entry = this.getCustomVλl(JitFnIDs.unknownKeyErrors).vλl;
        return `
            if (!(${varName} instanceof Map)) return;
            for (const ${entry} of ${varName}) {
                ${keyCode ? `${keyCode}` : ''}
                ${valueCode ? `${valueCode}` : ''}
            }
        `;
    }

    _compileStripUnknownKeys(comp: JitCompiler): string {
        const keyCode = this.keyRT.compileStripUnknownKeys(comp);
        const valueCode = this.valueRT.compileStripUnknownKeys(comp);
        if (!keyCode && !valueCode) return '';
        const varName = comp.vλl;
        const entry = this.getCustomVλl(JitFnIDs.stripUnknownKeys).vλl;
        return `
            if (!(${varName} instanceof Map)) return;
            for (const ${entry} of ${varName}) {
                ${keyCode ? `${keyCode}` : ''}
                ${valueCode ? `${valueCode}` : ''}
            }
        `;
    }

    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        const keyCode = this.keyRT.compileUnknownKeysToUndefined(comp);
        const valueCode = this.valueRT.compileUnknownKeysToUndefined(comp);
        if (!keyCode && !valueCode) return '';
        const varName = comp.vλl;
        const entry = this.getCustomVλl(JitFnIDs.unknownKeysToUndefined).vλl;
        return `
            if (!(${varName} instanceof Map)) return;
            for (const ${entry} of ${varName}) {
                ${keyCode ? `${keyCode}` : ''}
                ${valueCode ? `${valueCode}` : ''}
            }
        `;
    }

    _mock(ctx: MockOperation): Map<any, any> {
        const mockMap = new Map();
        const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
        for (let i = 0; i < length; i++) {
            const keyType = this.keyRT.mock(ctx);
            const valueType = this.valueRT.mock(ctx);
            mockMap.set(keyType, valueType);
        }
        return mockMap;
    }
}

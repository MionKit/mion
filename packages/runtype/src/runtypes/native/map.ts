/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnID, SrcType} from '../../types';
import {ClassRunType} from '../collection/class';
import {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitFnIDs} from '../../constants';
import {getExpected, memorize} from '../../lib/utils';
import {BasicMemberRunType} from '../member/basicMember';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, TypeClass} from '../../lib/_deepkit/src/reflection/type';

export class MapKeyRunType extends BasicMemberRunType<any> {
    index = 0;
    getStaticPathLiteral(): string {
        const parent = this.getParent()!;
        const keyRef = `${parent.getStandaloneVλl()}[0]`;
        return `['key',${keyRef}]`;
    }
}

export class MapValueRunType extends BasicMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(): string {
        const parent = this.getParent()!;
        const keyRef = `${parent.getStandaloneVλl()}[0]`;
        return `['val',${keyRef}]`;
    }
}

export class MapRunType extends ClassRunType {
    keyRT = new MapKeyRunType();
    valueRT = new MapValueRunType();
    children = [this.keyRT, this.valueRT];
    getStandaloneVλl = memorize(() => `me${this.getNestLevel()}`);
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
            case JitFnIDs.hasUnknownKeys:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    _compileIsType(comp: JitCompiler): string {
        // Compile the isType function for Map
        const entry = this.getStandaloneVλl();
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
        // Compile the typeErrors function for Map
        const entry = this.getStandaloneVλl();
        const childrenCode = this.getJitChildren()
            .map((c) => c.compileTypeErrors(comp))
            .join(';');
        return `
            if (!(${comp.vλl} instanceof Map)){${comp.callJitErr(getExpected(this))}}
            else {for (const ${entry} of ${comp.vλl}) {${childrenCode}}}
        `;
    }

    _compileJsonEncode(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

    _compileJsonDecode(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

    _compileJsonStringify(comp: JitCompiler): string {
        return `todo: ${comp.vλl}`;
    }

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

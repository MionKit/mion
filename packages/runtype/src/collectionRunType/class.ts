/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '../_deepkit/src/reflection/type';
import {JitContext, MockContext, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {InterfaceRunType} from './interface';
import {jitUtils} from '../jitUtils';
import {isConstructor} from '../guards';
import {jitNames} from '../constants';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    public readonly canDeserialize: boolean;
    get className(): string {
        return this.src.classType.name;
    }
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeClass,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts, true, true);
        this.canDeserialize = this.entries.every((prop) => !isConstructor(prop) || prop.parameterTypes.length === 0);
        if (this.canDeserialize) jitUtils.addSerializableClass(src.classType);
    }

    compileJsonDecode(ctx: JitContext): string {
        ClassRunType.checkSerializable(this.canDeserialize, this.className);
        const decodeParams = super.compileJsonDecode(ctx);
        const decode = decodeParams ? `${decodeParams}; ` : '';
        const classVarname = `clλss${ctx.parents.length}`;
        // todo create a new class
        return `
            ${decode};
            const ${classVarname} = ${jitNames.utils}.getSerializableClass(${toLiteral(this.className)});
            ${ctx.args.vλl} = Object.assign(new ${classVarname}, ${ctx.args.vλl});
        `;
    }
    mock(ctx?: MockContext): Record<string | number, any> {
        ClassRunType.checkSerializable(this.canDeserialize, this.className);
        const childCtx: MockContext = {...ctx, parentObj: new this.src.classType()};
        return super.mock(childCtx);
    }

    private static checkSerializable(canDeserialize: boolean, className: string) {
        if (!canDeserialize)
            throw new Error(
                `Class ${className} can't be deserialized. Only classes with and empty constructor can be deserialized.`
            );
    }
}

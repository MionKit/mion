import {maxStackDepth, maxStackErrorMessage} from './constants';
import {isCollectionRunType, isMemberRunType} from './guards';
import {JitFnArgs, PathItem, RunType} from './types';

export interface StackItem extends PathItem {
    rt: RunType;
}

export class JitCompileOperation<FnArgs extends JitFnArgs = JitFnArgs, Name extends string = any> {
    /** The cop of types being compiled */
    stack: StackItem[] = [];
    /** current runType accessor in source code */
    get vλl() {
        return this.stack[this.stack.length - 1].vλl;
    }
    /** shorthand for  this.length */
    get length() {
        return this.stack.length;
    }

    constructor(
        public args: FnArgs,
        public name: Name
    ) {}
    pushStack(rt: RunType) {
        if (this.stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const parent = this.getParentPathItem();
        const isComposite = parent?.rt && (isMemberRunType(rt) || isCollectionRunType(rt));
        const newStackItem: StackItem = isComposite
            ? (rt.getJitChildrenPath(this) as any as StackItem)
            : {varName: this.args.vλl, literal: this.args.vλl, vλl: this.args.vλl, rt};
        if (!newStackItem.rt) newStackItem.rt = rt;
        this.stack.push(newStackItem);
    }
    popStack() {
        this.stack.pop();
    }
    getParentPathItem(): StackItem | null {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            if (this.stack[i]) return this.stack[i];
        }
        return null;
    }

    /** Creates a new Path item */
    newPathItem(varName: string | number, literal: string | number, useArrayAccessor?: boolean): PathItem {
        const parent = this.getParentPathItem() || {vλl: this.args.vλl};
        const useArray = useArrayAccessor ?? typeof varName === 'number';
        const vλl = useArray ? `${parent.vλl}[${literal}]` : `${parent.vλl}.${varName}`;
        return {vλl, varName, literal, useArrayAccessor: useArray};
    }

    getStaticPathArgs(): string {
        return this.stack
            .filter((i) => i !== null)
            .map((pathItem) => pathItem?.literal)
            .join(',');
    }
}

export class JitCompileOp<Name extends string = any> extends JitCompileOperation<{vλl: string}, Name> {
    constructor(name: Name) {
        super({vλl: 'vλl'}, name);
    }
}

export class JitTypeErrorCompileOp extends JitCompileOperation<{vλl: string; pλth: string; εrrors: string}, 'ƒnTypεErrors'> {
    constructor(name: 'ƒnTypεErrors') {
        super({vλl: 'vλl', pλth: 'pλth', εrrors: 'εrrors'}, name);
    }
}

export type DefaultJitArgs = JitCompileOp['args'];
export type DefaultJitTypeErrorsArgs = JitTypeErrorCompileOp['args'];

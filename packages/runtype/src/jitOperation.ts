import {maxStackDepth, maxStackErrorMessage} from './constants';
import {isChildAccessorType} from './guards';
import type {JitFnArgs, StackItem, RunType} from './types';

/**
 * Jit Compile Operation unit
 * EXPRESSION: the result of each type compilations is expected to be a js expression that resolves to a single value, and can be used wit operators like +, -, *, /, ||, &&, etc.
 * i.e: expType1 + expType2, expType1 || expType2, etc. Expressions cant contain return statements, if statements, semicolons, etc.
 * if a code block is needed in an expression it must be wrapped in a self invoking function. i.e: (() => { //... code block })()
 * STATEMENT: the result of each type compilations is expected to be a js statement that can be used in a block of code, and can contain return statements, if statements, semicolons, etc.
 * BLOCK: the main difference is that and statement can be returned directly ie: return statementCode;
 * while in a block the main value must be returned after code block execution. ie: blockCode; return vλl;
 */
export type CodeUnit = 'EXPRESSION' | 'STATEMENT' | 'BLOCK';

export class JitCompileOperation<FnArgsNames extends JitFnArgs = JitFnArgs, Name extends string = any> {
    /** The cop of types being compiled */
    stack: StackItem[] = [];
    popItem: StackItem | undefined;
    internalFnNames = new Map<number, string>();
    internalFnCode = new Map<string, string>();
    /** current runType accessor in source code */
    get vλl(): string {
        return this._stackVλl;
    }
    /** shorthand for  this.length */
    get length() {
        return this.stack.length;
    }
    constructor(
        public args: FnArgsNames,
        public argsDefaultValues: (string | null)[],
        public returnName: string,
        public codeUnit: CodeUnit,
        public name: Name
    ) {}
    private getDefaultPathItem(rt: RunType): StackItem {
        return {vλl: this.args.vλl, rt};
    }
    private _stackVλl: string = '';
    private _stackStaticPath: (string | number)[] = [];
    private getStackVλl(): string {
        let vλl = this.args.vλl;
        for (let i = 0; i < this.stack.length; i++) {
            const rt = this.stack[i].rt;
            if (isChildAccessorType(rt)) {
                vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
            }
        }
        return vλl;
    }
    private getStackStaticPath(): (string | number)[] {
        const path: (string | number)[] = [];
        for (let i = 0; i < this.stack.length; i++) {
            const rt = this.stack[i].rt;
            if (isChildAccessorType(rt)) {
                path.push(rt.getChildLiteral());
            }
        }
        return path;
    }
    private getCircularFnName(newChild: RunType): string | undefined {
        // we need to use jitId as deepkit can generate multiple instances of the same type
        const circularIndex = this.stack.findIndex((item) => item.rt.getJitId() === newChild.getJitId());
        if (circularIndex === -1) return;
        if (circularIndex === 0) return this.name;
        const internalFnName = this.internalFnNames.get(circularIndex);
        if (internalFnName) return internalFnName;
        const fnName = `ƒnAux${circularIndex}`;
        this.internalFnNames.set(circularIndex, fnName);
        return fnName;
    }
    /** push new item to the stack, returns true if new child is already in the stack (is circular type) */
    pushStack(newChild: RunType): string | undefined {
        if (this.stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularFnName = this.getCircularFnName(newChild); // must be called before new item is added to stack
        this._stackVλl = this.getStackVλl();
        this._stackStaticPath = this.getStackStaticPath();
        const newStackItem: StackItem = {vλl: this._stackVλl, rt: newChild};
        this.stack.push(newStackItem);
        return circularFnName;
    }
    popStack() {
        this.popItem = this.stack.pop();
    }
    getParentPathItem(): StackItem | null {
        for (let i = this.stack.length - 1; i >= 0; i--) {
            if (this.stack[i]) return this.stack[i];
        }
        return null;
    }
    getStackStaticPathArgs(): string {
        return this._stackStaticPath.join(',');
    }
    getStaticPathLength(): number {
        return this._stackStaticPath.length;
    }
    getNewArgsForCurrentOp(): FnArgsNames {
        const newArgs = {...this.args};
        newArgs.vλl = this.vλl;
        return newArgs;
    }
}

export class JitCompileOp<Name extends string = any> extends JitCompileOperation<{vλl: string}, Name> {
    constructor(name: Name, codeUnit: CodeUnit) {
        super({vλl: 'vλl'}, [null], 'vλl', codeUnit, name);
    }
}

export class JitTypeErrorCompileOp extends JitCompileOperation<{vλl: string; pλth: string; εrr: string}, 'ƒnTypεErrors'> {
    constructor(name: 'ƒnTypεErrors') {
        super({vλl: 'vλl', pλth: 'pλth', εrr: 'εrr'}, [null, '[]', '[]'], 'εrr', 'BLOCK', name);
    }
}

export type DefaultJitArgs = JitCompileOp['args'];
export type DefaultJitTypeErrorsArgs = JitTypeErrorCompileOp['args'];

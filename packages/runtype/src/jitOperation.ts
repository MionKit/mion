import {maxStackDepth, maxStackErrorMessage} from './constants';
import {isChildAccessorType} from './guards';
import type {JitFnArgs, StackItem, RunType, StackCallFlags} from './types';
import {isSameJitType} from './utils';

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
    /** The list of types being compiled.
     * each time there is a circular type a new substack is created.
     */
    stack: StackItem[][] = [];
    popItem: StackItem | undefined;
    /**
     * Collection of functions to be generated as result to this Jit compile operations.
     * All functions share the same args.
     * Multiple functions can be generated when there are circular types.
     */
    jitFunctions = new Map<string, string>();
    /** current runType accessor in source code */
    get vλl(): string {
        return this._stackVλl;
    }
    /** shorthand for  this.length */
    get length() {
        const subStack = this.stack[this.stack.length - 1];
        if (!subStack) return 0;
        return subStack.length;
    }
    constructor(
        public args: FnArgsNames,
        public argsDefaultValues: Record<keyof FnArgsNames, string | null>,
        public returnName: string,
        public codeUnit: CodeUnit,
        public name: Name
    ) {}
    private _stackVλl: string = '';
    private _stackStaticPath: (string | number)[] = [];
    /** push new item to the stack, returns true if new child is already in the stack (is circular type) */
    pushStack(newChild: RunType): StackCallFlags | undefined {
        if (this.stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        if (this.stack.length === 0) {
            newChild.getJitConstants(); // ensures the constants are generated in correct order
            newChild.auxFnName = this.name;
        }
        this.createNewSubStackIfRequired(newChild);
        const subStack = this.stack[this.stack.length - 1];
        const call = this.getCallFnFlags(newChild, subStack);
        this._stackVλl = this.getStackVλl(subStack);
        this._stackStaticPath = this.getStackStaticPath(subStack);
        const newStackItem: StackItem = {vλl: this._stackVλl, rt: newChild, call};
        subStack.push(newStackItem);
        return call;
    }
    popStack() {
        const subStack = this.stack[this.stack.length - 1];
        this.popItem = subStack.pop();
        if (this.popItem) this._stackVλl = this.popItem.vλl;
        if (subStack.length === 0) this.stack.pop();
    }
    getStackStaticPathArgs(): string {
        return this._stackStaticPath.join(',');
    }
    getStaticPathLength(): number {
        return this._stackStaticPath.length;
    }
    getStaticPathArgsForFnCall(): {args: string; length: number} {
        const isRoot = this.isSubStackRootItem();
        if (isRoot) {
            const parentSubStack = this.stack[this.stack.length - 2];
            const currentStackItem = this.getCurrentStackItem();
            if (parentSubStack && currentStackItem) {
                const staticPath = this.getStackStaticPath([...parentSubStack, currentStackItem]);
                return {args: staticPath.join(','), length: staticPath.length};
            }
        }
        return {args: this.getStackStaticPathArgs(), length: this.getStaticPathLength()};
    }
    getNewArgsForCurrentOp(): FnArgsNames {
        const newArgs = {...this.args};
        newArgs.vλl = this.vλl;
        return newArgs;
    }
    addNewFunction(name: string, code: string) {
        this.jitFunctions.set(name, code);
    }
    getAllCode(): string {
        const allFns = Array.from(this.jitFunctions.keys())
            .map((name) => this.getJitCodeForFn(name, name === this.name))
            .join('\n');
        return allFns;
    }
    getJitCodeForFn(name: string, useDefaultValues: boolean): string {
        const fnCode = this.jitFunctions.get(name);
        if (!fnCode) throw new Error(`Function ${name} not found`);
        const argsCode = this.getFnArgsCode(useDefaultValues);
        const fnName = this.getSanitizedFnName(name);
        return `function ${fnName}(${argsCode}){${fnCode}}`;
    }
    getJitCodeForFnCall(name: string): string {
        const fnName = this.getSanitizedFnName(name);
        const argsCode = this.getFnArgsCodeForFnCall();
        return `${fnName}(${argsCode})`;
    }
    getSanitizedFnName(fnName: string): string {
        return fnName === auxFnName0 ? this.name : fnName;
    }
    isRootItem() {
        if (this.stack.length !== 1) return false;
        return this.stack[0].length === 1;
    }
    isSubStackRootItem() {
        const subStack = this.stack[this.stack.length - 1];
        if (!subStack) return false;
        return subStack.length === 1;
    }
    getCurrentStackItem(): StackItem | undefined {
        const subStack = this.stack[this.stack.length - 1];
        if (!subStack) return;
        return subStack[subStack.length - 1];
    }
    getParentStackItem(): StackItem | undefined {
        const subStack = this.stack[this.stack.length - 1];
        if (!subStack) return;
        if (subStack.length === 1) {
            const prevSubStack = this.stack[this.stack.length - 2];
            return prevSubStack[prevSubStack.length - 1];
        }
        return subStack[subStack.length - 2];
    }

    private createNewSubStackIfRequired(newChild: RunType) {
        const subStack = this.stack[this.stack.length - 1];
        if (!subStack) {
            this.stack.push([]);
            return;
        }
        if (!newChild.auxFnName || subStack.length === 0) return;
        const isCircularParent = !subStack.some((i) => isSameJitType(i.rt, newChild));
        if (isCircularParent) this.stack.push([]);
    }
    /** must be called before inserting the run type into the stack */
    private getCallFnFlags(rt: RunType, subStack: StackItem[]): StackCallFlags | undefined {
        if (!rt.auxFnName) return;
        if (subStack.length === 0) return {shouldGenerate: true};
        return {shouldCall: true};
    }
    private getStackVλl(subStack: StackItem[]): string {
        let vλl = this.args.vλl;
        for (let i = 0; i < subStack.length; i++) {
            const rt = subStack[i].rt;
            if (isChildAccessorType(rt)) {
                vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
            }
        }
        return vλl;
    }
    private getStackStaticPath(subStack: StackItem[]): (string | number)[] {
        const path: (string | number)[] = [];
        for (let i = 0; i < subStack.length; i++) {
            const rt = subStack[i].rt;
            if (isChildAccessorType(rt)) {
                path.push(rt.getChildLiteral());
            }
        }
        return path;
    }
    private getFnArgsCode(useDefaultValues: boolean): string {
        return Object.entries(this.args)
            .map(([key, name]) => {
                if (!useDefaultValues || !this.argsDefaultValues[key]) return name;
                const value = this.argsDefaultValues[key];
                return `${name}=${value}`;
            })
            .join(',');
    }
    private getFnArgsCodeForFnCall(): string {
        const isRoot = this.isSubStackRootItem();
        let vλl = this.vλl;
        if (isRoot) {
            const parentSubStack = this.stack[this.stack.length - 2];
            const currentStackItem = this.getCurrentStackItem();
            if (parentSubStack && currentStackItem) vλl = this.getStackVλl([...parentSubStack, currentStackItem]);
            else vλl = this.args.vλl;
        }
        return Object.values(this.args)
            .map((name) => {
                if (name === 'vλl') return vλl;
                return name;
            })
            .join(',');
    }
}

export class JitCompileOp<Name extends string = any> extends JitCompileOperation<{vλl: string}, Name> {
    constructor(name: Name, codeUnit: CodeUnit) {
        super({vλl: 'vλl'}, {vλl: null}, 'vλl', codeUnit, name);
    }
}

export class JitTypeErrorCompileOp extends JitCompileOperation<{vλl: string; pλth: string; εrr: string}, 'ƒnTypεErrors'> {
    constructor(name: 'ƒnTypεErrors') {
        const args = {vλl: 'vλl', pλth: 'pλth', εrr: 'εrr'};
        const defaultValues = {vλl: null, pλth: '[]', εrr: '[]'};
        super(args, defaultValues, 'εrr', 'BLOCK', name);
    }
}

export type DefaultJitArgs = JitCompileOp['args'];
export type DefaultJitTypeErrorsArgs = JitTypeErrorCompileOp['args'];

export function getNewAuxFnNameFromIndex(index): string {
    return `ƒnAux${index}`;
}

export const auxFnName0 = getNewAuxFnNameFromIndex(0);

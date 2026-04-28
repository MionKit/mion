/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeTemplateLiteral, type TypeLiteral} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import type {JitCode} from '../../types.ts';
import {CollectionRunType} from '../../lib/baseRunTypes.ts';

/**
 * RunType for TypeScript template literal types, ie: `type T = \`api/user/${number}\``.
 * The runtime value is a string. Validation is done by compiling the template literal type
 * to a single anchored regex at JIT-build time and then calling `regex.test(v)` at runtime.
 * Mocking walks the children directly (literal => verbatim, string/any => mockString, number => mockNumber)
 * and concatenates the spans, which guarantees the result satisfies the validation regex.
 */
export class TemplateLiteralRunType extends CollectionRunType<TypeTemplateLiteral> {
    private _regexSource: string | undefined;

    /** Builds the anchored regex source from src.types. Memoized. */
    getRegexSource(): string {
        if (this._regexSource !== undefined) return this._regexSource;
        const parts = (this.src.types || []).map((t) => spanToRegex(t));
        this._regexSource = `^${parts.join('')}$`;
        return this._regexSource;
    }

    /** Returns a context-bound variable name holding the RegExp; emits the const into the compiler context. */
    private getRegexVar(comp: JitFnCompiler): string {
        const varName = comp.getLocalVarName('reTL', this);
        if (!comp.hasContextItem(varName)) {
            comp.setContextItem(varName, `const ${varName} = new RegExp(${JSON.stringify(this.getRegexSource())})`);
        }
        return varName;
    }

    emitIsType(comp: JitFnCompiler): JitCode {
        const re = this.getRegexVar(comp);
        return {code: `(typeof ${comp.vλl} === 'string' && ${re}.test(${comp.vλl}))`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const re = this.getRegexVar(comp);
        return {
            code: `if (typeof ${comp.vλl} !== 'string' || !${re}.test(${comp.vλl})) ${comp.callJitErr(this)}`,
            type: 'S',
        };
    }
    /** value is already a JSON-safe string, no transform required */
    emitPrepareForJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
    /** value is already a JSON-safe string, no transform required */
    emitRestoreFromJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
}

/** Translate a single template-literal span (TypeString | TypeAny | TypeNumber | TypeLiteral | TypeInfer) into regex source */
function spanToRegex(t: TypeTemplateLiteral['types'][number]): string {
    switch (t.kind) {
        case ReflectionKind.literal:
            return escapeForRegex(String((t as TypeLiteral).literal));
        case ReflectionKind.number:
            // matches signed integers and floats (including leading dot like '.5'), mirroring TS's `${number}` semantics
            return '-?(?:\\d+\\.?\\d*|\\.\\d+)';
        case ReflectionKind.string:
        case ReflectionKind.any:
        case ReflectionKind.infer:
            // `${string}` accepts the empty string, so use * not +
            return '[\\s\\S]*';
        default:
            // unreachable per deepkit's TypeTemplateLiteral.types definition
            throw new Error(`Unsupported template literal span kind: ${(t as {kind: number}).kind}`);
    }
}

/** Escape regex metacharacters so a literal substring is matched verbatim */
function escapeForRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

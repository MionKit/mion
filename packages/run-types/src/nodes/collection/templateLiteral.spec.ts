/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect} from 'vitest';
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';

describe('TemplateLiteralRunType - URL pattern api/user/${number}', () => {
    type UserUrl = `api/user/${number}`;
    const rt = runType<UserUrl>();

    it('validates URLs with valid numeric ids', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate('api/user/42')).toBe(true);
        expect(validate('api/user/0')).toBe(true);
        expect(validate('api/user/-7')).toBe(true);
        expect(validate('api/user/3.14')).toBe(true);
    });

    it('rejects URLs that do not match the pattern', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate('api/user/abc')).toBe(false);
        expect(validate('api/user/')).toBe(false);
        expect(validate('api/admin/42')).toBe(false);
        expect(validate('api/user/42/extra')).toBe(false);
        expect(validate('/api/user/42')).toBe(false);
        expect(validate('')).toBe(false);
    });

    it('rejects non-string values', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(42)).toBe(false);
        expect(validate(null)).toBe(false);
        expect(validate(undefined)).toBe(false);
        expect(validate({})).toBe(false);
        expect(validate(['api/user/42'])).toBe(false);
    });

    it('reports a templateLiteral error on failure', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors('api/user/42')).toEqual([]);
        expect(valWithErrors('api/user/abc')).toEqual([{path: [], expected: 'templateLiteral'}]);
        expect(valWithErrors(null)).toEqual([{path: [], expected: 'templateLiteral'}]);
    });

    it('mock generates a value that re-validates as the same type', async () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        for (let i = 0; i < 25; i++) {
            const mocked = await rt.mock();
            expect(typeof mocked).toBe('string');
            expect(mocked.startsWith('api/user/')).toBe(true);
            expect(validate(mocked)).toBe(true);
        }
    });
});

describe('TemplateLiteralRunType - multi-segment URL', () => {
    type ApiUrl = `/api/v${number}/user/${string}/posts/${number}`;
    const rt = runType<ApiUrl>();
    const validate = rt.createJitFunction(JitFunctions.isType);

    it('accepts well-formed URLs', () => {
        expect(validate('/api/v1/user/jane/posts/7')).toBe(true);
        expect(validate('/api/v2/user/john-doe/posts/0')).toBe(true);
        expect(validate('/api/v10/user//posts/5')).toBe(true); // ${string} accepts empty
    });

    it('rejects URLs missing required parts', () => {
        expect(validate('/api/v/user/jane/posts/7')).toBe(false); // version not numeric
        expect(validate('/api/v1/user/jane/posts/abc')).toBe(false); // post id not numeric
        expect(validate('/api/v1/user/jane/posts')).toBe(false); // missing trailing id
        expect(validate('api/v1/user/jane/posts/7')).toBe(false); // missing leading slash
    });
});

describe('TemplateLiteralRunType - leading ${string} placeholder', () => {
    type Path = `${string}/${number}`;
    const rt = runType<Path>();
    const validate = rt.createJitFunction(JitFunctions.isType);

    it('accepts empty string before slash', () => {
        expect(validate('/42')).toBe(true);
    });

    it('accepts non-empty prefix', () => {
        expect(validate('users/42')).toBe(true);
    });

    it('rejects values that do not contain the required suffix', () => {
        expect(validate('users')).toBe(false);
        expect(validate('users/12.3.4')).toBe(false);
    });
});

describe('TemplateLiteralRunType - regex special chars in literal', () => {
    type Bracketed = `(${number})`;
    const rt = runType<Bracketed>();
    const validate = rt.createJitFunction(JitFunctions.isType);

    it('escapes regex metacharacters from the literal segments', () => {
        expect(validate('(42)')).toBe(true);
        expect(validate('(-1.5)')).toBe(true);
        expect(validate('42')).toBe(false);
        expect(validate('(42')).toBe(false);
    });
});

describe('TemplateLiteralRunType - as index signature key', () => {
    type Routes = {[key: `api/${string}`]: number};
    const rt = runType<Routes>();
    const validate = rt.createJitFunction(JitFunctions.isType);

    it('accepts objects whose keys all match the template literal pattern', () => {
        expect(validate({})).toBe(true);
        expect(validate({'api/users': 1})).toBe(true);
        expect(validate({'api/users': 1, 'api/posts': 2})).toBe(true);
    });

    it('rejects objects with a key that does not match the pattern', () => {
        expect(validate({foo: 1})).toBe(false);
        expect(validate({'api/users': 1, foo: 2})).toBe(false);
    });

    it('rejects objects with a value that does not match the value type', () => {
        expect(validate({'api/users': 'x' as any})).toBe(false);
    });

    it('reports both bad keys and bad values via typeErrors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({'api/users': 1})).toEqual([]);
        expect(valWithErrors({foo: 1})).toEqual([{path: ['foo'], expected: 'indexSignature'}]);
        expect(valWithErrors({'api/users': 'x' as any})).toEqual([{path: ['api/users'], expected: 'number'}]);
    });

    it('mock generates keys that match the pattern and values that validate', async () => {
        for (let i = 0; i < 10; i++) {
            const mocked = await rt.mock();
            for (const key of Object.keys(mocked)) {
                expect(key.startsWith('api/')).toBe(true);
                expect(typeof (mocked as any)[key]).toBe('number');
            }
            expect(validate(mocked)).toBe(true);
        }
    });
});

describe('TemplateLiteralRunType - index signature with ${number} key', () => {
    type Numbered = {[key: `id-${number}`]: string};
    const rt = runType<Numbered>();
    const validate = rt.createJitFunction(JitFunctions.isType);

    it('only accepts keys matching id-<number>', () => {
        expect(validate({'id-1': 'a', 'id-42': 'b'})).toBe(true);
        expect(validate({'id-abc': 'a'})).toBe(false);
        expect(validate({1: 'a'})).toBe(false);
    });
});

describe('TemplateLiteralRunType - nested in object', () => {
    type Route = {url: `api/user/${number}`; method: string};
    const rt = runType<Route>();

    it('validates a property typed as a template literal', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate({url: 'api/user/42', method: 'GET'})).toBe(true);
        expect(validate({url: 'api/admin/42', method: 'GET'})).toBe(false);
        expect(validate({url: 'api/user/42'})).toBe(false);
    });

    it('reports the property path on validation error', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({url: 'api/admin/42', method: 'GET'})).toEqual([{path: ['url'], expected: 'templateLiteral'}]);
    });
});

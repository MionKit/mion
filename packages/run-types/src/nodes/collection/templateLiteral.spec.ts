/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect} from 'vitest';
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';
import {createDataViewSerializer, createDataViewDeserializer, setSerializationOptions} from '@mionjs/core';

setSerializationOptions({bufferSize: 1024});
const serContext = createDataViewSerializer('tplLit');
const desContext = createDataViewDeserializer('tplLit', new ArrayBuffer(0));

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

    it('JSON encode/decode round-trips a valid URL', () => {
        const toJson = rt.createJitFunction(JitFunctions.prepareForJson);
        const fromJson = rt.createJitFunction(JitFunctions.restoreFromJson);
        const value = 'api/user/123';
        const encoded = toJson(value);
        // string is JSON-safe; encoder should not transform it
        expect(encoded).toBe(value);
        expect(fromJson(JSON.parse(JSON.stringify(encoded)))).toBe(value);
    });

    it('binary serialize/deserialize round-trips a valid URL', () => {
        const toBinary = rt.createJitFunction(JitFunctions.toBinary);
        const fromBinary = rt.createJitFunction(JitFunctions.fromBinary);
        const value = 'api/user/123';
        serContext.reset();
        toBinary(value, serContext);
        const buffer = serContext.getBuffer();
        desContext.setBuffer(buffer);
        const decoded = fromBinary(undefined, desContext);
        expect(decoded).toBe(value);
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

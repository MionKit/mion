/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ClassRunType} from '../collectionRunType/class';
import {TypeClass} from '../lib/_deepkit/src/reflection/type';
import {JitContext} from '../jit/context';
import {MockOperation} from '../types';
import {runType} from '../runType';

export class MapRunType extends ClassRunType {
    constructor(src: TypeClass) {
        super(src);
    }

    _compileIsType(ctx: JitContext): string {
        // Compile the isType function for Map
        return `
            if (!(value instanceof Map)) return false;
            const keyType = ${ctx.reserveName('keyType')};
            const valueType = ${ctx.reserveName('valueType')};
            // ...existing code...
            for (const [key, val] of value.entries()) {
                if (!keyType.isType(key)) return false;
                if (!valueType.isType(val)) return false;
            }
            return true;
        `;
    }

    _compileJsonEncode(ctx: JitContext): string {
        // Compile the jsonEncode function for Map
        return `
            const result = [];
            const keyType = ${ctx.reserveName('keyType')};
            const valueType = ${ctx.reserveName('valueType')};
            for (const [key, val] of value.entries()) {
                const encodedKey = keyType.jsonEncode(key);
                const encodedVal = valueType.jsonEncode(val);
                result.push([encodedKey, encodedVal]);
            }
            return result;
        `;
    }

    _compileJsonDecode(ctx: JitContext): string {
        // Maps cannot be deserialized
        throw new Error('Maps cannot be deserialized.');
    }

    _compileTypeErrors(ctx: JitContext): string {
        // Compile the typeErrors function for Map
        return `
            if (!(value instanceof Map)) {
                errors.push({ path, expected: 'Map', actual: typeof value });
                return;
            }
            const keyType = ${ctx.reserveName('keyType')};
            const valueType = ${ctx.reserveName('valueType')};
            for (const [key, val] of value.entries()) {
                keyType.typeErrors(key, errors, path.concat(['key']));
                valueType.typeErrors(val, errors, path.concat(['value']));
            }
        `;
    }

    _compileHasUnknownKeys(ctx: JitContext): string {
        // Maps do not have unknown keys in the traditional sense
        return `return false;`;
    }

    _compileUnknownKeyErrors(ctx: JitContext): string {
        // Maps do not have unknown keys to report
        return '';
    }

    _compileStripUnknownKeys(ctx: JitContext): string {
        // No unknown keys to strip in a Map
        return 'return value;';
    }

    _compileUnknownKeysToUndefined(ctx: JitContext): string {
        // No unknown keys to set to undefined in a Map
        return 'return value;';
    }

    _mock(ctx: MockOperation): Map<any, any> {
        // Generate a mock Map
        const mockMap = new Map();
        const keyType = runType(this.src.typeArguments![0]);
        const valueType = runType(this.src.typeArguments![1]);
        // ...existing code...
        const size = ctx.faker.datatype.number({min: 1, max: 5});
        for (let i = 0; i < size; i++) {
            const key = keyType.mock(ctx);
            const value = valueType.mock(ctx);
            mockMap.set(key, value);
        }
        return mockMap;
    }
}

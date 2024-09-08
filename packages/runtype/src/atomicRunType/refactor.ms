/fix  
we recently refactor the arguments passed to the functions `compileIsType` ,  `compileTypeErrors`, `compileJsonEncode`, `compileJsonDecode`,  `compileJsonStringify` and `mock`. 
instead passing multiple arguments we are now passing a compile context object that contains all the arguments. 

Here is an example of the refactor of the bigint RunType:

BigintRunType File before:

```ts
import type {TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, RunType} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'bigint'`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (typeof ${varName} !== 'bigint') ${ctx.args.εrrors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return BigIntJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        return BigIntJitJsonENcoder.stringify(varName);
    }
    mock(min?: number, max?: number): bigint {
        return mockBigInt(min, max);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = BigInt(${varName})`;
    },
    encodeToJson(varName: string): string {
        return `${varName} = ${varName}.toString()`;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toString()+'"'`;
    },
};
```


BigintRunType File After the refactor and update the args to use a context object :

```ts
import type {TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, mockContext, typeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        const {value} = ctx.args;
        return `typeof ${value} === 'bigint'`;
    }
    compileTypeErrors(ctx: typeErrorsContext): string {
        const {value, errors} = ctx.args;
        return `if (typeof ${value} !== 'bigint') ${errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return BigIntJitJsonENcoder.encodeToJson(ctx.args.value);
    }
    compileJsonDecode(ctx: JitContext): string {
        return BigIntJitJsonENcoder.decodeFromJson(ctx.args.value);
    }
    compileJsonStringify(jc: JitContext): string {
        return BigIntJitJsonENcoder.stringify(jc.args.value);
    }
    mock(ctx: mockContext, min?: number, max?: number): bigint {
        return mockBigInt(min, max);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = BigInt(${varName})`;
    },
    encodeToJson(varName: string): string {
        return `${varName} = ${varName}.toString()`;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toString()+'"'`;
    },
};
```


------
please note how the arguments of each of those functions has been removed an only a single ctx object is passed now. 
Also within the function the compiled the interpolated variable names has been updated to use `ctx.args`
typical updated variable names:
* varName =>  ctx.args.value
* jitNames.errors =>  ctx.args.errors
* pathC =>  ctx.path


Could you please apply the same refactor to this RunType file?

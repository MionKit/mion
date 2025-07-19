/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import fs from 'fs';
import path from 'path';
import {codifyJitFunctions, restoreCodifiedJitFunctions, toLiteral, arrayToLiteral} from '@mionkit/run-types/src/lib/utils';
import {toLiteral, arrayToLiteral} from '@mionkit/run-types/src/lib/utils';
import {NonRawMethod, MethodOptions} from './types/remoteMethods';
import {AnyHandler} from './types/handlers';
import {IS_TEST_ENV} from './constants';
import {rΦutεs} from './_compiled/routes'; // inception 🔁
import {getMethodsToCodeFn} from '@mionkit/router/src/reflection';

// ############# PUBLIC METHODS #############

export function addToCompiledMethods(id: string, method: NonRawMethod) {
    if (!shouldCompile() || !!rΦutεs[id]) return;
    rΦutεs[id] = method;
}

export function getCompiledMethod(id: string, handler: AnyHandler): NonRawMethod | undefined {
    const method = compiled?.[id] || rΦutεs[id];
    if (!method) return;
    return restoreCodifiedMethod(method, handler);
}

function restoreCodifiedMethod(method: NonRawMethod, handler: AnyHandler): NonRawMethod {
    if ((method as any).restored) return method;
    (method as any).restored = true;
    method.handler = handler;
    restoreCodifiedJitFunctions(method.paramsJitFns);
    restoreCodifiedJitFunctions(method.returnJitFns);
    return method;
}

export function writeCompiledMethods(writeFile = true) {
    if (!shouldCompile()) return;
    if (!IS_TEST_ENV) console.log('Writing compiled methods...');

    let fileName: string | undefined;
    const extensions = ['.js', '.mjs', '.ts', '.cjs', '.jsx', '.tsx'];
    extensions.forEach((ext) => {
        const jsName = path.join(__dirname, `_compiled${ext}`);
        if (fs.existsSync(jsName)) {
            fileName = jsName;
        }
    });
    if (!fileName) {
        const errorFname = path.join(__dirname, `_compiled.{js,mjs,ts,cjs,jsx,tsx}`);
        throw new Error(`Can't find file to save compiledMethods. It should be ${errorFname}`);
    }
    const compiledOriginal = 'rΦutεs = {}';
    const currentContent = fs.readFileSync(fileName, 'utf8');
    const found = currentContent.includes(compiledOriginal);
    if (!found) {
        throw new Error(`Can't replace compiled code in ${fileName}. Most probably is already compiled.`);
    }

    const codified = codifyCompiledMethods(rΦutεs);
    if (writeFile) {
        const compiledCode = currentContent
            .replace('//# sourceMappingURL=_compiled.js.map', '')
            .replace(compiledOriginal, `rΦutεs = ${codified}`);
        fs.writeFileSync(fileName, compiledCode, 'utf8');
        if (!IS_TEST_ENV) console.log(`Compiled methods written to ${fileName}.`);
    } else {
        return codified;
    }
}

let compiled: Record<string, NonRawMethod> | undefined;
export function setCompiledMethods(mock: Record<string, NonRawMethod>) {
    compiled = mock;
}

let _shouldCompile: boolean | undefined = undefined;
function shouldCompile(): boolean {
    if (_shouldCompile === undefined) {
        _shouldCompile = process.env.MION_COMPILE === 'true';
        return _shouldCompile;
    }
    return _shouldCompile;
}

// ############# PRIVATE METHODS #############

function codifyMethodOptions(ops: MethodOptions): string {
    const runOnError = `runOnError:${!!ops.runOnError}`;
    const hasReturnData = `hasReturnData:${!!ops.hasReturnData}`;
    const validateParams = `validateParams:${!!ops.validateParams}`;
    const deserializeParams = `deserializeParams:${!!ops.deserializeParams}`;
    const validateReturn = `validateReturn:${!!ops.validateReturn}`;
    const serializeReturn = `serializeReturn:${!!ops.serializeReturn}`;
    const description = `description:${toLiteral(ops.description)}`;
    const isAsync = `isAsync:${!!ops.isAsync}`;
    return `{${runOnError},${hasReturnData},${validateParams},${deserializeParams},${validateReturn},${serializeReturn},${description},${isAsync}}`;
}

function codifyJitFunctions(item: any) {
    return String(item);
}

/**
 * Returns a string with the method to be used as js src code
 * jsonStringify are compiled as (value, asJSONString) => {code} instead of (value) => {code}
 * so codified methods need to be restored using restoreCodifiedMethod
 */
function codifyMethod(pcd: NonRawMethod): string {
    const type = `type:${toLiteral(pcd.type)},`;
    const id = `id:${toLiteral(pcd.id)},`;
    const pointer = `pointer:${arrayToLiteral(pcd.pointer)},`;
    const nestLevel = `nestLevel:${pcd.nestLevel},`;
    const paramNames = pcd.paramNames ? `paramNames:${arrayToLiteral(pcd.paramNames)},` : '';
    const headerNames = pcd.headerNames ? `headerNames:${arrayToLiteral(pcd.headerNames)},` : '';
    const paramsJitFns = `paramsJitFns:${codifyJitFunctions(pcd.paramsJitFns)},`;
    const returnJitFns = `returnJitFns:${codifyJitFunctions(pcd.returnJitFns)},`;
    const options = `options:${codifyMethodOptions(pcd.options)}`; // no trailing comma
    return `{${type}${id}${pointer}${nestLevel}${paramNames}${headerNames}\n${paramsJitFns}\n${returnJitFns}\n${options}}`;
}

// TODO: this could be replaced with const toCode = ToCodeFn<string, NonRawMethod>(); but would imply using
function codifyCompiledMethods(dic: Record<string, NonRawMethod>): string {
    const keys = Object.keys(dic);
    const methods = keys.map((k) => `\n${toLiteral(k)}:\n\n${codifyMethod(dic[k])}`).join(',\n');
    return `{${methods}}`;
}

export function compileRouter() {
    writeCompiledMethods();
}

export function compileUtils(dic: Record<string, NonRawMethod>) {
    const methodsToCode = getMethodsToCodeFn();
    const code = methodsToCode(dic);
    console.log(code);
}

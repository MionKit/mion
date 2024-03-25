/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import fs from 'fs';
import path from 'path';
import {codifyJitFunctions, restoreCodifiedJitFunctions, toLiteral, toLiteralArray} from '@mionkit/runtype';
import {NonRawProcedure, ProcedureOptions} from './types/procedures';
import {AnyHandler} from './types/handlers';
import {IS_TEST_ENV} from './constants';
import {cΦmpλlεd} from './_compiled'; // inception 🔁

// ############# PUBLIC METHODS #############

export function compileProcedure(id: string, procedure: NonRawProcedure) {
    if (!shouldCompile() || !!cΦmpλlεd[id]) return;
    cΦmpλlεd[id] = procedure;
}

export function getCompiledProcedure(id: string, handler: AnyHandler): NonRawProcedure | undefined {
    const procedure = compiled?.[id] || cΦmpλlεd[id];
    if (!procedure) return;
    return restoreCodifiedProcedure(procedure, handler);
}

export function restoreCodifiedProcedure(procedure: NonRawProcedure, handler: AnyHandler): NonRawProcedure {
    if ((procedure as any).restored) return procedure;
    (procedure as any).restored = true;
    procedure.handler = handler;
    restoreCodifiedJitFunctions(procedure.paramsJitFns);
    restoreCodifiedJitFunctions(procedure.returnJitFns);
    return procedure;
}

export function writeCompiledProcedures(writeFile = true) {
    if (!shouldCompile) return;
    if (!IS_TEST_ENV) console.log('Writing compiled procedures...');

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
        throw new Error(`Can't find file to save compiledProcedures. It should be ${errorFname}`);
    }
    const compiledOriginal = 'cΦmpλlεd = {}';
    const currentContent = fs.readFileSync(fileName, 'utf8');
    const found = currentContent.includes(compiledOriginal);
    if (!found) {
        throw new Error(`Can't replace compiled code in ${fileName}. Most probably is already compiled.`);
    }

    const codified = codifyCompiledProcedures(cΦmpλlεd);
    if (writeFile) {
        const compiledCode = currentContent
            .replace('//# sourceMappingURL=_compiled.js.map', '')
            .replace(compiledOriginal, `cΦmpλlεd = ${codified}`);
        fs.writeFileSync(fileName, compiledCode, 'utf8');
        if (!IS_TEST_ENV) console.log(`Compiled procedures written to ${fileName}.`);
    } else {
        return codified;
    }
}

let compiled: Record<string, NonRawProcedure> | undefined;
export function setCompiledProcedures(mock: Record<string, NonRawProcedure>) {
    compiled = mock;
}

let _shouldCompile: boolean | undefined = undefined;
export function shouldCompile(): boolean {
    if (_shouldCompile === undefined) {
        _shouldCompile = process.env.MION_COMPILE === 'true';
        return _shouldCompile;
    }
    return _shouldCompile;
}

// ############# PRIVATE METHODS #############

function codifyProcedureOptions(ops: ProcedureOptions): string {
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

/**
 * Returns a string with the procedure to be used as js src code
 * jsonStringify are compiled as (value, asJSONString) => {code} instead of (value) => {code}
 * so codified procedures need to be restored using restoreCodifiedProcedure
 */
function codifyProcedure(pcd: NonRawProcedure): string {
    const type = `type:${toLiteral(pcd.type)},`;
    const id = `id:${toLiteral(pcd.id)},`;
    const pointer = `pointer:${toLiteralArray(pcd.pointer)},`;
    const nestLevel = `nestLevel:${pcd.nestLevel},`;
    const paramNames = pcd.paramNames ? `paramNames:${toLiteralArray(pcd.paramNames)},` : '';
    const headerNames = pcd.headerNames ? `headerNames:${toLiteralArray(pcd.headerNames)},` : '';
    const paramsJitFns = `paramsJitFns:${codifyJitFunctions(pcd.paramsJitFns)},`;
    const returnJitFns = `returnJitFns:${codifyJitFunctions(pcd.returnJitFns)},`;
    const options = `options:${codifyProcedureOptions(pcd.options)}`; // no trailing comma
    return `{${type}${id}${pointer}${nestLevel}${paramNames}${headerNames}\n${paramsJitFns}\n${returnJitFns}\n${options}}`;
}

function codifyCompiledProcedures(dic: Record<string, NonRawProcedure>): string {
    const keys = Object.keys(dic);
    const procedures = keys.map((k) => `\n${toLiteral(k)}:\n\n${codifyProcedure(dic[k])}`).join(',\n');
    return `{${procedures}}`;
}

// export function deserializeProcedure(procedure: SerializableProcedure, handler: AnyHandler): Procedure {
//     const restored = procedure as Procedure;
//     restored.handler = handler;
//     restored.paramsJitFns = restoreJitFunctions(procedure.paramsJitFns);
//     restored.returnJitFns = restoreJitFunctions(procedure.returnJitFns);
//     if (shouldCompile()) (restored as any).fromCompiled = true; // flag to know if it was compiled
//     return restored;
// }

// export function serializeProcedure(procedure: NonRawProcedure): SerializableProcedure {
//     const serialized: SerializableProcedure = {
//         id: procedure.id,
//         type: procedure.type,
//         nestLevel: procedure.nestLevel,
//         paramsJitFns: getSerializableJitCompiler(procedure.paramsJitFns),
//         returnJitFns: getSerializableJitCompiler(procedure.returnJitFns),
//         paramNames: procedure.paramNames,
//         pointer: procedure.pointer,
//         headerNames: procedure.headerNames,
//         options: {
//             ...procedure.options,
//         },
//     };
//     return serialized;
// }

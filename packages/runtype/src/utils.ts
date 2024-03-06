/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export function toLiteral(value: number | string | boolean | undefined | null | bigint | RegExp | symbol): string {
    switch (typeof value) {
        case 'number':
            return `${value}`;
        case 'string':
            return `'${scapeQ(value)}'`;
        case 'boolean':
            return value ? 'true' : 'false';
        case 'undefined':
            return 'undefined';
        case 'bigint':
            return `${value}n`;
        case 'symbol':
            return `Symbol(${toLiteral(value.description)})`;
        case 'object':
            if (value === null) return 'null';
            if (value instanceof RegExp) return value.toString();
            throw new Error(`Unsupported literal type ${value}`);
        default:
            throw new Error(`Unsupported literal type ${value}`);
    }
}

// export function scapeBackticks(value: string): string {
//     return value.replace(/`/g, '\\`');
// }

/** return an string scaping quotes */
export function scapeQ(value: number | string | boolean | undefined | null | bigint | RegExp | symbol): string {
    if (value instanceof RegExp) return scapeQ(value.toString());
    if (typeof value === 'string') return value.replace(/'/g, "\\'");
    if (typeof value === 'symbol') return scapeQ(value.toString());
    return `${value}`;
}

export function addToPathChain(pathChain: string, property: string | number, isLiteral = true): string {
    return `${pathChain} + '/' + ${isLiteral ? toLiteral(property) : property}`;
}

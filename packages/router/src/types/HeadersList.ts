/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAnnotation} from '@deepkit/core';

// IMPORTANT DO NOT CHANGE THE INTERFACE NAMES OR TYPE ANNOTATIONS AS THEY ARE HARDCODED IN THE JIT GENERATED CODE
// Note that we will be using the types of the Names itself to generate JIT functions and not string[],
// This is so we can allow string formats and optional Headers
/** List of headers to be used in remote handler parameters */

export type HeadersList<Names extends [...args: (string | undefined)[]]> = {
    [K in keyof Names]: Names[K] extends string ? string : string | undefined;
} & TypeAnnotation<'headerNames', Names>;

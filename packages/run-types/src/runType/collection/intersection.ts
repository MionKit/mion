/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeIntersection} from '@deepkit/type';
import {InterfaceRunType} from './interface';
import type {jitCode} from '../../types';
import {JitFunctions} from '../../constants.functions';

/** IMPORTANT:
 * Intersection are already resolved by deepkit so seems like this runType wont ever be called
 * ie: type A = {a: string} & {b: number} will be resolved to ObjectLiteral {a: string, b: number}
 * ie: type NeVer = string & number will be resolved to never
 * */
export class IntersectionRunType extends InterfaceRunType<TypeIntersection> {
    compileIsType(): jitCode {
        throw new Error('Intersection validation not supported, should be resolve to other RunTypes');
    }
    compileTypeErrors(): jitCode {
        throw new Error('Intersection validation not supported, should be resolve to other RunTypes');
    }
    compileToJsonVal(): jitCode {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
    compileFromJsonVal(): jitCode {
        throw new Error('Intersection serialization not supported, should be resolve to other RunTypes');
    }
}

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {typeAnnotation} from '@deepkit/type';
import {RunType, RunTypeAnnotation, SrcType} from '../types';

export function getRunTypeAnnotations(rt: RunType): RunTypeAnnotation[] {
    const annotations = typeAnnotation.getAnnotations(rt.src);
    return annotations.map((a) => {
        const annotation: RunTypeAnnotation = {
            name: a.name,
            options: (a.options as SrcType)._rt as RunType,
        };
        return annotation;
    });
}

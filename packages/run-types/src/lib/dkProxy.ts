/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {typeAnnotation, typeToObject} from '@deepkit/type';
import {RunType, RunTypeAnnotation, SrcType} from '../types';

/**
 * Returns RunType annotations, ie:
 *
 * type WithSuffix<Suffix extends string> = string & TypeAnnotation<'suffix', Suffix>;
 * const rt = runType<WithSuffix<'hello'>>();
 * const annotations = rt.getRunTypeAnnotations();
 * annotations = [{name: 'suffix', options: LiteralRunType<'hello'>}];
 */
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

/**
 * Returns the options of the annotations parsed js data, ie:
 *
 * type WithSuffix<Suffix extends string> = string & TypeAnnotation<'suffix', Suffix>;
 * const rt = runType<WithSuffix<'hello'>>();
 * const parsedOptions = rt.getParsedAnnotationOptions();
 * parsedOptions = 'hello';
 */
export function getParsedAnnotationOptions(rt: RunType): any[] {
    return getRunTypeAnnotations(rt).map((a) => typeAnnotation.getOption(rt.src, a.name));
}

/**
 * Returns the deepkit type as a js object, this is useful to extract metadata from the type.
 */
export function getTypeToObject(rt: RunType): any {
    return typeToObject(rt.src);
}

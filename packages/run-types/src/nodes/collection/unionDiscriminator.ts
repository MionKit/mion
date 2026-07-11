import type {BaseRunType, CollectionRunType, MemberRunType} from '../../lib/baseRunTypes.ts';
import type {JitFnCompiler} from '../../lib/jitFnCompiler.ts';
import type {UnionRunType} from './union.ts';
import type {PropertyRunType} from '../member/property.ts';
import {getTotalComplexity, sortRunTypeByComplexity} from '../../lib/utils.ts';
import {isAnyRunType, isUnknownRunType} from '../../lib/guards.ts';

export type FlattenedProp = {
    /** union item, parent of the property */
    unionItem: CollectionRunType<any>;
    /** index of the union item in the union */
    unionIndex: string | number;
    /** one property of the union item  */
    prop: PropertyRunType;
    /** typeID of the property */
    typeID: string | number;
    /** name of the property as it should be used in the code */
    compiledName: string;
};

export type SplitUnionResult = {
    simpleItems: BaseRunType[];
    objectTypes: CollectionRunType<any>[];
    /** any or unknown type if present in the union, should be checked last */
    anyItem?: BaseRunType;
};

/**
 * Split the union types in two groups: interface types and simple types
 * interface types are types that have properties, simple types are the rest (atomic types, tuples, etc)
 * If any or unknown types are present, they are extracted and returned separately as anyItem
 * so they can be checked last (any/unknown would match anything, so must be last resort)
 */
export function splitUnionItems(comp: JitFnCompiler, urt: UnionRunType, unionChildren?: BaseRunType[]): SplitUnionResult {
    const unionItems = unionChildren || urt.getJitChildren(comp);
    const objectTypes: CollectionRunType<any>[] = [];
    const simpleItems: BaseRunType[] = [];
    let anyItem: BaseRunType | undefined;

    unionItems.forEach((unionItem) => {
        // Extract any/unknown types to be checked last
        if (isAnyRunType(unionItem) || isUnknownRunType(unionItem)) {
            // Only keep the first any/unknown type (having multiple is redundant)
            if (!anyItem) anyItem = unionItem;
            return;
        }
        const isObj = urt.isTypeWithProperties(unionItem);
        if (!isObj) return simpleItems.push(unionItem);
        return objectTypes.push(unionItem as CollectionRunType<any>);
    });

    // Sort object types to prevent unreachable types (objects with more props should come first when they share same prop types)
    const sortedObjectTypes = sortUnreachableTypes(comp, objectTypes);

    return {simpleItems, objectTypes: sortedObjectTypes, anyItem};
}

/**
 * Sorts object types to prevent unreachable union types.
 * When two objects share the same properties (by typeID), the one with more properties must come first.
 * This ensures that at runtime, the more specific type is checked before the less specific one.
 * Objects that don't share properties with others maintain their relative order.
 */
export function sortUnreachableTypes(comp: JitFnCompiler, objectTypes: CollectionRunType<any>[]): CollectionRunType<any>[] {
    if (objectTypes.length <= 1) return objectTypes;

    // Get property typeIDs for each object type
    const typePropsMap = new Map<CollectionRunType<any>, Set<string | number>>();
    objectTypes.forEach((objType) => {
        const props = objType.getJitChildren(comp) as PropertyRunType[];
        const propTypeIDs = new Set<string | number>();
        props.forEach((prop) => propTypeIDs.add(prop.getTypeID()));
        typePropsMap.set(objType, propTypeIDs);
    });

    // Check if one object's props are a subset of another's (all props have same typeIDs)
    const isSubsetOf = (smaller: CollectionRunType<any>, larger: CollectionRunType<any>): boolean => {
        const smallerProps = typePropsMap.get(smaller)!;
        const largerProps = typePropsMap.get(larger)!;
        if (smallerProps.size >= largerProps.size) return false;
        for (const typeID of smallerProps) {
            if (!largerProps.has(typeID)) return false;
        }
        return true;
    };

    // Find groups of objects that share properties (one is subset of another)
    const processed = new Set<CollectionRunType<any>>();
    const result: CollectionRunType<any>[] = [];

    for (let i = 0; i < objectTypes.length; i++) {
        const current = objectTypes[i];
        if (processed.has(current)) continue;

        // Find all objects that are related (subset/superset) to current
        const relatedGroup: CollectionRunType<any>[] = [current];
        processed.add(current);

        for (let j = 0; j < objectTypes.length; j++) {
            if (i === j) continue;
            const other = objectTypes[j];
            if (processed.has(other)) continue;

            // Check if current and other are related (one is subset of the other)
            if (isSubsetOf(current, other) || isSubsetOf(other, current)) {
                relatedGroup.push(other);
                processed.add(other);
            }
        }

        // Sort related group by number of properties (more props first)
        if (relatedGroup.length > 1) {
            relatedGroup.sort((a, b) => {
                const aSize = typePropsMap.get(a)!.size;
                const bSize = typePropsMap.get(b)!.size;
                return bSize - aSize; // descending order (more props first)
            });
        }

        result.push(...relatedGroup);
    }

    return result;
}

/**
 * Mark discriminator properties so they can be sorted and validate union more efficiently.
 * @param comp
 * @param urt
 */
export function markDiscriminators(comp: JitFnCompiler, urt: UnionRunType, unionItems: BaseRunType[]) {
    if (urt.hasDiscriminators !== undefined && urt.hasObjectTypes !== undefined) return;
    const objectTypes = unionItems.filter((item) => urt.isTypeWithProperties(item)) as CollectionRunType<any>[];
    const namedDiscriminators = getDiscriminatorProperties(comp, urt, objectTypes, initGetCompiledName());
    const uniqueDiscriminators = getUniqueDiscriminatorProperties(comp, urt, objectTypes, initGetCompiledName());
    urt.hasObjectTypes = !!objectTypes.length;
    urt.hasDiscriminators = !!namedDiscriminators.length || !!uniqueDiscriminators.length;
}

type PropUnionItemPair = {prop: PropertyRunType; unionItem: CollectionRunType<any>};

/**
 * Find a property with the same name in all the types of the union and that has different types.
 * It also marks those properties as discriminator properties so can be sorted later
 */
function getDiscriminatorProperties(
    comp: JitFnCompiler,
    urt: UnionRunType,
    unionTypes: CollectionRunType<any>[],
    getCompiledName: (comp: JitFnCompiler, urt: UnionRunType, propTypeID: string | number) => string
): FlattenedProp[] {
    if (!unionTypes.length) return [];
    const propByName = new Map<string | number, PropUnionItemPair[]>();
    unionTypes.forEach((unionItem) => {
        const props = unionItem.getJitChildren(comp) as PropertyRunType[];
        props.forEach((prop) => {
            const name = prop.getChildVarName(comp);
            const existing = propByName.get(name) || [];
            // index no needed now
            propByName.set(name, [...existing, {prop, unionItem}]);
        });
    });
    const propsOnAllTypes = Array.from(propByName.entries())
        // filter all properties that are in all types
        .filter(([, props]) => props.length === unionTypes.length)
        // calculate complexity and check if all types are different in all props
        .map(([key, props]) => ({
            name: key,
            props,
            complexity: props.reduce((acc, item) => acc + getTotalComplexity(comp, item.prop), 0),
            isUniqueType: props.every((item) => {
                const child = item;
                const typeID = child.prop.getTypeID();
                const isDiff = props.every((otherItem) => child.prop === otherItem.prop || otherItem.prop.getTypeID() !== typeID);
                return isDiff;
            }),
        }))
        .filter((item) => item.isUniqueType);
    const lessComplexProps = propsOnAllTypes.toSorted((a, b) => a.complexity - b.complexity);
    const lessComplex = lessComplexProps[0];
    if (!lessComplex) return [];
    // we need to marks the property as discriminator so they can be sorted and checked first later
    return lessComplex.props.map((item) => {
        item.prop.isUnionDiscriminator = true;
        const unionIndex = urt.getUnionItemIndex(comp, item.unionItem);
        const typeID = item.prop.getTypeID();
        return {
            unionItem: item.unionItem,
            unionIndex,
            prop: item.prop,
            typeID,
            compiledName: getCompiledName(comp, urt, typeID),
        };
    });
}

/**
 * Get unique properties in the union as discriminators.
 * These properties can be of different name but are unique in the union so can act as discriminators.
 * It also marks those properties as discriminator properties so can be sorted later.
 * */
function getUniqueDiscriminatorProperties(
    comp: JitFnCompiler,
    urt: UnionRunType,
    unionTypes: CollectionRunType<any>[],
    getCompiledName: (comp: JitFnCompiler, urt: UnionRunType, propTypeID: string | number) => string
): FlattenedProp[] {
    if (!unionTypes.length) return [];
    const uniquePropByUnionItem = new Map<CollectionRunType<any>, PropUnionItemPair>();
    unionTypes.forEach((unionItem) => {
        const props = unionItem.getJitChildren(comp) as PropertyRunType[];
        props.forEach((prop) => {
            const typeID = prop.getTypeID();
            const isUnique = unionTypes.every((otherUnionItem) => {
                if (otherUnionItem === unionItem) return true;
                const otherProps = otherUnionItem.getJitChildren(comp) as MemberRunType<any>[];
                return otherProps.every((otherProp) => otherProp.getTypeID() !== typeID);
            });
            if (isUnique) {
                const existing = uniquePropByUnionItem.get(unionItem);
                if (!existing) {
                    uniquePropByUnionItem.set(unionItem, {
                        prop,
                        unionItem,
                    });
                    return;
                }
                const newItem = {prop, unionItem};
                const lessComplex = [newItem, existing].toSorted((a, b) => sortRunTypeByComplexity(comp, a.prop, b.prop))[0];
                uniquePropByUnionItem.set(unionItem, lessComplex);
            }
        });
    });
    if (!uniquePropByUnionItem.size) return [];
    const uniqueProps = Array.from(uniquePropByUnionItem.values());
    return uniqueProps.map((item) => {
        item.prop.isUnionDiscriminator = true;
        const unionIndex = urt.getUnionItemIndex(comp, item.unionItem);
        const typeID = item.prop.getTypeID();
        return {
            unionItem: item.unionItem,
            unionIndex,
            prop: item.prop,
            typeID,
            compiledName: getCompiledName(comp, urt, typeID),
        };
    });
}

function initGetCompiledName() {
    const typeIDs = new Map<string | number, number>();
    return function getCompiledName(comp: JitFnCompiler, urt: UnionRunType, typeID: string | number): string {
        const existingIndex = typeIDs.get(typeID);
        if (existingIndex) return comp.getLocalVarName('prop', urt) + `_${existingIndex}`;
        const newIndex = typeIDs.size;
        typeIDs.set(typeID, newIndex);
        return comp.getLocalVarName('prop', urt) + `_${newIndex}`;
    };
}

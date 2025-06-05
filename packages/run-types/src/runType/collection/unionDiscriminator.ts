import type {BaseRunType, CollectionRunType, MemberRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {PropertyRunType} from '@mionkit/run-types/src/runType/member/property';
import {getTotalComplexity, sortRunTypeByComplexity} from '@mionkit/run-types/src/lib/utils';

export type PlainItem = {
    rt: BaseRunType;
    unionIndex: number;
};
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
export type FlattenedItem = {
    discriminatorProps: FlattenedProp[];
    otherProps: FlattenedProp[];
};
export type SplitUnionTypes = {
    /** items in the union that are not objects, will have to be fully checked */
    regularTypes: PlainItem[];
    /** items in the union that are objects but have index properties, will have to be fully checked */
    indexTypes: PlainItem[];
    /** The flattened properties of all the items in the union, props are individually checked */
    flattened: FlattenedItem | undefined;
};
type PropUnionItemPair = {prop: PropertyRunType; unionItem: CollectionRunType<any>};

/**
 * Mark discriminator properties so they can be sorted and validate union more efficiently.
 * @param comp
 * @param urt
 */
export function markDiscriminators(comp: JitCompiler, urt: UnionRunType, children: BaseRunType[]) {
    if (urt.hasDiscriminators !== undefined && urt.hasObjectTypes !== undefined) return;
    const objectTypes = children.filter((item) => urt.isTypeWithProperties(item)) as CollectionRunType<any>[];
    const namedDiscriminators = getDiscriminatorProperties(comp, urt, objectTypes, initGetCompiledName());
    const uniqueDiscriminators = getUniqueDiscriminatorProperties(comp, urt, objectTypes, initGetCompiledName());
    urt.hasObjectTypes = !!objectTypes.length;
    urt.hasDiscriminators = !!namedDiscriminators.length || !!uniqueDiscriminators.length;
}

/**
 * Find a property with the same name in all the types of the union and that has different types.
 * It also marks those properties as discriminator properties so can be sorted later
 */
export function getDiscriminatorProperties(
    comp: JitCompiler,
    urt: UnionRunType,
    unionTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
): FlattenedProp[] {
    if (!unionTypes.length) return [];
    const propByName = new Map<string | number, PropUnionItemPair[]>();
    unionTypes.forEach((unionItem) => {
        const props = unionItem.getJitChildren(comp) as PropertyRunType[];
        props.forEach((prop) => {
            const name = prop.getChildVarName();
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
            compiledName: getCompiledName(urt, typeID),
        };
    });
}

/**
 * Get unique properties in the union as discriminators.
 * These properties can be of different name but are unique in the union so can act as discriminators.
 * It also marks those properties as discriminator properties so can be sorted later.
 * */
export function getUniqueDiscriminatorProperties(
    comp: JitCompiler,
    urt: UnionRunType,
    unionTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
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
            compiledName: getCompiledName(urt, typeID),
        };
    });
}

export function initGetCompiledName() {
    const typeIDs = new Map<string | number, number>();
    return function getCompiledName(urt: UnionRunType, typeID: string | number): string {
        const existingIndex = typeIDs.get(typeID);
        if (existingIndex) return `prp${urt.getNestLevel()}_${existingIndex}`;
        const newIndex = typeIDs.size;
        typeIDs.set(typeID, newIndex);
        return `prp${urt.getNestLevel()}_${newIndex}`;
    };
}

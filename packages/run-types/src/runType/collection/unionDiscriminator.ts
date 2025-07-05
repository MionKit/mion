import type {BaseRunType, CollectionRunType, MemberRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import type {PropertyRunType} from '@mionkit/run-types/src/runType/member/property';
import {getTotalComplexity, sortRunTypeByComplexity} from '@mionkit/run-types/src/lib/utils';
import {ReflectionKind} from '@deepkit/type';

export type SimpleUnionItem = {
    rt: BaseRunType;
    unionIndex: number;
};
export type FlattenedUnionProp = {
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
export type UnionFlattenedProps = {
    /** List of properties that are used to discriminate the union.
     * If non of the discriminator props match that means item is not in the union
     * and should skip processing the rest of the properties */
    discriminatorProps: FlattenedUnionProp[];
    /** List of properties that are not used to discriminate the union.
     * If we can't use the discriminators to know the type of the object we need to check all of these properties. */
    otherProps: FlattenedUnionProp[];
    /** List of properties that are in the index types. */
    // indexProps: FlattenedUnionProp[];
};
export type UnionPropsByName = {
    /** Map of properties by name that are used to discriminate the union.
     * If non of the discriminator props match that means item is not in the union
     * and should skip processing the rest of the properties */
    discriminatorProps: Map<string | number, FlattenedUnionProp[]>;
    /** Map of properties by name that are not used to discriminate the union.
     * If we can't use the discriminators to know the type of the object we need to check all of these properties. */
    otherProps: Map<string | number, FlattenedUnionProp[]>;
};
export type SplitUnionItems = {
    /** items in the union that are not objects, will have to be fully checked */
    simpleItems: SimpleUnionItem[];
    /** items in the union that are objects but have index properties, will have to be fully checked */
    indexItems: SimpleUnionItem[];
    /** The flattened properties of all the items in the union, props are individually checked */
    flattenedProps: UnionFlattenedProps | undefined;
    /** Map of all the properties by name */
    propsByName: UnionPropsByName | undefined;
    /** All the properties in the union, including discriminators and other props */
    allFlattenedProps: FlattenedUnionProp[];
    /** Map of properties by union item */
    propsByUnionItem: Map<CollectionRunType<any>, FlattenedUnionProp[]>;
};
export type PropUnionItemPair = {prop: PropertyRunType; unionItem: CollectionRunType<any>};

/**
 * Mark discriminator properties so they can be sorted and validate union more efficiently.
 * @param comp
 * @param urt
 */
export function markDiscriminators(comp: JitCompiler, urt: UnionRunType, unionItems: BaseRunType[]) {
    if (urt.hasDiscriminators !== undefined && urt.hasObjectTypes !== undefined) return;
    const objectTypes = unionItems.filter((item) => urt.isTypeWithProperties(item)) as CollectionRunType<any>[];
    const namedDiscriminators = getDiscriminatorProperties(comp, urt, objectTypes, getFlatPropCompiledName());
    const uniqueDiscriminators = getUniqueDiscriminatorProperties(comp, urt, objectTypes, getFlatPropCompiledName());
    urt.hasObjectTypes = !!objectTypes.length;
    urt.hasDiscriminators = !!namedDiscriminators.length || !!uniqueDiscriminators.length;
}

/**
 * Compiles code that traverses all the types of the union and execute the callback for each type
 * The callBack should return the code to execute for the current union item.
 * @return SplitUnionTypes if there are objects in the union, they are flattened into the last item.
 */
export function getUnionSplitItems(comp: JitCompiler, urt: UnionRunType): SplitUnionItems {
    const {objectTypes, simpleTypes, indexTypes} = splitUnionTypes(comp, urt);
    const flattened = getFlattenedObjectItem(comp, urt, objectTypes, getFlatPropCompiledName());
    const propsByName: UnionPropsByName | undefined = flattened
        ? {discriminatorProps: new Map(), otherProps: new Map()}
        : undefined;
    if (propsByName && flattened) {
        flattened.discriminatorProps.forEach((item) => setPropsByName(item, propsByName.discriminatorProps));
        flattened.otherProps.forEach((item) => setPropsByName(item, propsByName.otherProps));
    }
    const allFlattenedProps = flattened ? [...flattened.discriminatorProps, ...flattened.otherProps] : [];
    const propsByUnionItem = new Map<CollectionRunType<any>, FlattenedUnionProp[]>();
    allFlattenedProps.forEach((item) => {
        const existing = propsByUnionItem.get(item.unionItem) || [];
        propsByUnionItem.set(item.unionItem, [...existing, item]);
    });
    return {
        simpleItems: getUnionPlainItems(simpleTypes, 0),
        indexItems: getUnionPlainItems(indexTypes, 0),
        flattenedProps: flattened,
        propsByName,
        allFlattenedProps,
        propsByUnionItem,
    };
}

/**
 * Find a property with the same name in all the types of the union and that has different types.
 * It also marks those properties as discriminator properties so can be sorted later
 */
function getDiscriminatorProperties(
    comp: JitCompiler,
    urt: UnionRunType,
    unionTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
): FlattenedUnionProp[] {
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
function getUniqueDiscriminatorProperties(
    comp: JitCompiler,
    urt: UnionRunType,
    unionTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
): FlattenedUnionProp[] {
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

function getFlatPropCompiledName() {
    const typeIDs = new Map<string | number, number>();
    return function getCompiledName(urt: UnionRunType, typeID: string | number): string {
        const existingIndex = typeIDs.get(typeID);
        if (existingIndex) return `fp${urt.getNestLevel()}_${existingIndex}`;
        const newIndex = typeIDs.size;
        typeIDs.set(typeID, newIndex);
        return `fp${urt.getNestLevel()}_${newIndex}`;
    };
}

function setPropsByName(item: FlattenedUnionProp, propsMap: Map<string | number, FlattenedUnionProp[]>) {
    const propName = item.prop.getChildVarName();
    const existingList = propsMap.get(propName) || [];
    const isSameTypeID = existingList.some((existing) => existing.typeID === item.typeID);
    // ensured we don't have duplicated entries with same type if as will generate same code
    if (!isSameTypeID) existingList.push(item);
    propsMap.set(propName, existingList);
}

/**
 * Split the union types in two groups: interface types and simple types
 * interface types are types that have properties, simple types are the rest (atomic types, tuples, etc)
 */
function splitUnionTypes(
    comp: JitCompiler,
    urt: UnionRunType
): {objectTypes: CollectionRunType<any>[]; simpleTypes: BaseRunType[]; indexTypes: CollectionRunType<any>[]} {
    const unionItems = urt.getJitChildren(comp);
    const objectTypes: CollectionRunType<any>[] = [];
    const simpleTypes: BaseRunType[] = [];
    const indexTypes: CollectionRunType<any>[] = [];
    unionItems.forEach((unionItem) => {
        const isObj = urt.isTypeWithProperties(unionItem);
        if (!isObj) return simpleTypes.push(unionItem);
        const objItem = unionItem as CollectionRunType<any>;
        // Object with index properties can not be flattened and need to be fully checked
        const hasIndexProperty = objItem.getJitChildren?.(comp).some((prop) => prop.src.kind === ReflectionKind.indexSignature);
        if (hasIndexProperty) return indexTypes.push(objItem);
        return objectTypes.push(objItem);
    });

    return {objectTypes, simpleTypes, indexTypes};
}

function getUnionPlainItems(unionTypes: BaseRunType[], startIndex = 0): SimpleUnionItem[] {
    if (!unionTypes.length) return [];
    return unionTypes.map((rt, i) => ({rt, unionIndex: startIndex + i}));
}

/** Find discriminators properties in the union ans create a check code to validate the discriminator */
function getFlattenedObjectItem(
    comp: JitCompiler,
    urt: UnionRunType,
    objectTypes: CollectionRunType<any>[],
    getCompiledName: (urt: UnionRunType, propTypeID: string | number) => string
): UnionFlattenedProps | undefined {
    let discriminatorProps = getDiscriminatorProperties(comp, urt, objectTypes, getCompiledName);
    if (!discriminatorProps.length) {
        discriminatorProps = getUniqueDiscriminatorProperties(comp, urt, objectTypes, getCompiledName);
        if (!discriminatorProps.length) return;
    }
    const otherProps: FlattenedUnionProp[] = objectTypes
        .map((rt) => {
            const children = rt.getJitChildren(comp) as PropertyRunType[];
            const unionIndex = urt.getUnionItemIndex(comp, rt);
            return children.map((prop) => {
                const typeID = prop.getTypeID();
                return {
                    unionItem: rt,
                    unionIndex,
                    prop,
                    typeID,
                    compiledName: getCompiledName(urt, typeID),
                };
            });
        })
        .flat()
        .filter((item) => !item.prop.isUnionDiscriminator);
    return {discriminatorProps, otherProps};
}

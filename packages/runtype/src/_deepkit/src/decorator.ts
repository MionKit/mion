/*
 * Deepkit Framework
 * Copyright (c) Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassDecoratorResult, createClassDecoratorContext, createPropertyDecoratorContext } from './decorator-builder';
import { EntityData, ReceiveType, TData } from './reflection/reflection';
import { ClassType, isArray } from '@deepkit/core';
import { IndexOptions } from './reflection/type';
import { typeSettings } from './core';

class TDecorator {
    t = new TData();

    onDecorator(target: any, property?: string, parameterIndexOrDescriptor?: any) {
        if (undefined === target) return;

        addDeferredDecorator(this.t, target, property, parameterIndexOrDescriptor);
    }

    type<T>(type: ReceiveType<T> | ClassType) {
        this.t.type = type;
    }

    data(name: string, value: any) {
        this.t.data[name] = value;
    }
}

export const t = createPropertyDecoratorContext(TDecorator);

class EntityDecorator {
    t = new EntityData();

    onDecorator(target: any) {
        if (undefined === target) return;
        if (this.t.name) typeSettings.registeredEntities[this.t.name] = target;
        addDeferredDecorator(this.t, target);
    }

    name(name: string) {
        this.t.name = name;
    }

    collection(name: string) {
        this.t.collectionName = name;
    }

    /**
     * Disables calling the constructor when deserializing.
     */
    disableConstructor() {
        this.t.disableConstructor = true;
    }

    databaseSchema(name: string) {
        this.t.databaseSchemaName = name;
    }

    index(names: string[], options: IndexOptions = {}) {
        this.t.indexes.push({ names, options });
    }

    singleTableInheritance() {
        this.t.singleTableInheritance = true;
    }

    data(name: string, value: any) {
        this.t.data[name] = value;
    }

    /**
     * Exclude this entity from database migrations.
     */
    excludeMigration() {
        this.t.data['excludeMigration'] = true;
    }
}

export const entity: ClassDecoratorResult<typeof EntityDecorator> = createClassDecoratorContext(EntityDecorator);

interface DeferredDecorator {
    data: any;
    target: any;
    property?: string;
    parameterIndexOrDescriptor?: any;
}

export function isWithDeferredDecorators(obj: any): obj is { __decorators: DeferredDecorator[] } {
    return obj && '__decorators' in obj && isArray(obj.__decorators);
}

function addDeferredDecorator(data: any, target: any, property?: string, parameterIndexOrDescriptor?: any) {
    if (!target) return;
    if (!target.__decorators) target.__decorators = [];
    target.__decorators.push({ target, property, parameterIndexOrDescriptor, data });
}

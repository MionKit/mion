/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface User {
    id: number;
    name: string;
    surname: string;
    lastUpdate: Date;
}

export type NewUser = Omit<User, 'id' | 'lastUpdate'>;
export type UserId = User | number;
export type PartialUser = Partial<User> & {id: number};

const getId = (entOrId: UserId): number => {
    if (typeof entOrId === 'number') return entOrId;
    return entOrId.id;
};

const store = new Map<number, User>();

export const usersStore = {
    create: (user: NewUser): User => {
        const id = store.size + 1;
        const newUser: User = {
            id,
            ...user,
            lastUpdate: new Date(),
        };
        store.set(id, newUser);
        return newUser;
    },
    get: (userId: UserId): User | undefined => {
        return store.get(getId(userId));
    },
    update: (user: PartialUser): User | undefined => {
        const existing = store.get(user.id);
        if (!existing) return undefined;
        const updated = {
            ...existing,
            ...user,
            lastUpdate: new Date(),
        };
        store.set(user.id, updated);
        return updated;
    },
    delete: (userId: UserId): User | undefined => {
        const id = getId(userId);
        const user = store.get(id);
        if (!user) return undefined;
        store.delete(getId(id));
        return user;
    },
};

export const hasUnknownKeys = (knownKeys: string[], input: any): boolean => {
    if (typeof input !== 'object') return true;
    const unknownKeys = Object.keys(input);
    return unknownKeys.some((ukn) => !knownKeys.includes(ukn));
};

export const isUserId = (input: any): input is UserId => {
    if (typeof input === 'number') return true;
    if (typeof input !== 'object') return false;
    if (hasUnknownKeys(['id', 'name', 'surname', 'lastUpdate'], input)) return false;
    return (
        typeof input?.id === 'number' &&
        typeof input?.name === 'string' &&
        typeof input?.string === 'string' &&
        input?.lastUpdate instanceof Date
    );
};

export const isNewUser = (input: any): input is NewUser => {
    if (typeof input !== 'object') return false;
    if (hasUnknownKeys(['id', 'name', 'surname', 'lastUpdate'], input)) return false;
    return !input?.id && typeof input?.name === 'string' && typeof input?.string === 'string' && !input?.lastUpdate;
};

export const isPartialuser = (input: any): input is PartialUser => {
    if (typeof input !== 'object') return false;
    if (hasUnknownKeys(['id', 'name', 'surname', 'lastUpdate'], input)) return false;
    return typeof input?.id === 'number';
};

export const deserializeUser = (jsonParseResult) => {
    if (typeof jsonParseResult?.lastUpdate === 'string')
        return {
            ...jsonParseResult,
            lastUpdate: new Date(jsonParseResult.lastUpdate),
        };
    return jsonParseResult;
};

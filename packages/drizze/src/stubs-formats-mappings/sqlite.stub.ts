/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * TYPE STUB — never executed, only type-checked via tsc --noEmit.
 * Simulates real Drizzle application code with branded mion types.
 */

import {eq} from 'drizzle-orm';
import {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
import {toDrizzleSqliteTable} from '../sqlite.ts';
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';
import {NumInteger, NumPositiveInt} from '@mionkit/type-formats/FormatsNumber';
import {User, Post, UserWithOptional} from './common.ts';

// -- Setup: build tables and declare a db instance (never instantiated) ------

const users = toDrizzleSqliteTable<User>('users');
const posts = toDrizzleSqliteTable<Post>('posts');
const optionalUsers = toDrizzleSqliteTable<UserWithOptional>('optional_users');

declare const db: BaseSQLiteDatabase<'async', unknown>;

// -- 1. Full select → assign row to original type ----------------------------

async function getUsers(): Promise<User[]> {
    const rows = await db.select().from(users);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const first: User = rows[0];
    return rows;
}

// -- 2. Individual branded field access --------------------------------------

async function getUserFields() {
    const [row] = await db.select().from(users);
    const id: StrUUIDv7 = row.id;
    const email: StrEmail = row.email;
    const age: NumInteger = row.age;
    const score: NumPositiveInt = row.score;
    const name: string = row.name;
    const tags: string[] = row.tags;
    const profile: {avatar: string; theme: string} = row.profile;
    return {id, email, age, score, name, tags, profile};
}

// -- 3. Where clause with branded values -------------------------------------

async function findUserById(userId: StrUUIDv7): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, userId));
    return rows[0];
}

async function findUserByEmail(email: StrEmail): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0];
}

// -- 4. Join — both tables preserve branded types ----------------------------

async function getUsersWithPosts() {
    const rows = await db.select().from(users).innerJoin(posts, eq(users.id, posts.authorId));

    const first = rows[0];
    const user: User = first.users;
    const post: Post = first.posts;

    // Cross-table branded field access
    const authorId: StrUUIDv7 = first.users.id;
    const postId: StrUUIDv7 = first.posts.id;
    const postAuthorId: StrUUIDv7 = first.posts.authorId;
    const postViews: NumPositiveInt = first.posts.views;

    return {user, post, authorId, postId, postAuthorId, postViews};
}

// -- 5. Partial select — picked columns preserve brands ----------------------

async function getPartialUser() {
    const rows = await db.select({id: users.id, email: users.email}).from(users);
    const first = rows[0];
    const id: StrUUIDv7 = first.id;
    const email: StrEmail = first.email;
    return {id, email};
}

// -- 6. Insert with branded values -------------------------------------------

async function insertUser(user: User) {
    await db.insert(users).values(user);
}

// -- 7. Optional fields — nullable in select ---------------------------------

async function getOptionalUser() {
    const [row] = await db.select().from(optionalUsers);
    // Required fields are NOT nullable
    const id: StrUUIDv7 = row.id;
    const name: string = row.name;
    // Optional field IS nullable (string | null)
    const bio: string | null = row.bio;
    return {id, name, bio};
}

// -- Suppress unused warnings ------------------------------------------------
void getUsers;
void getUserFields;
void findUserById;
void findUserByEmail;
void getUsersWithPosts;
void getPartialUser;
void insertUser;
void getOptionalUser;

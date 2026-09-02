/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The end-to-end proof for @mionjs/drizzle-orm-pg-core AS PUBLISHED: a table
// built with the packed tarball's column builders carries the stamped format
// through the published d.ts, refineTableType (from the dialect-agnostic
// @mionjs/drizzle-orm, the dialect's required peer) tightens it, and the compiled
// validator over the derived model enforces the captured param (varchar
// maxLength) AND the refined one (minLength). If the stamps or the refine
// surgery break in packaging (dist d.ts, export conditions), this fails.

import {describe, it, expect} from 'vitest';
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
import {pgTable, varchar, integer} from '@mionjs/drizzle-orm-pg-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferSelectModel} from '@mionjs/drizzle-orm';

const users = pgTable('users', {
    name: varchar('name', {length: 20}).notNull(),
    age: integer('age').notNull(),
});

const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});

type UserRow = InferSelectModel<typeof users>;
type ApiUser = InferSelectModel<typeof apiUsers>;

const ok = {name: 'x'.repeat(12), age: 30};

describe('published drizzle-orm-pg-core - stamped + refined params reach the validator', () => {
    const validate = createValidateFn<ApiUser>();

    it('enforces the refined AND the captured bound', () => {
        expect(validate(ok)).toBe(true);
        expect(validate({...ok, name: 'short'})).toBe(false); // refined minLength 10
        expect(validate({...ok, name: 'x'.repeat(21)})).toBe(false); // captured maxLength 20
        expect(validate({...ok, age: 17})).toBe(false); // refined min 18
    });

    it('the unrefined table keeps its own (looser) validator', () => {
        const validatePlain = createValidateFn<UserRow>();
        expect(validatePlain({name: 'short', age: 17})).toBe(true);
        expect(validatePlain({name: 'x'.repeat(21), age: 30})).toBe(false);
    });

    // Marker-coverage rule: both getRunTypeId call shapes over the refined model.
    it('static and reflection getRunTypeId shapes resolve the same id', () => {
        const staticId = getRunTypeId<ApiUser>();
        const row: ApiUser = ok;
        expect(staticId).toBe(getRunTypeId(row));
        expect(staticId).not.toBe(getRunTypeId<UserRow>());
    });
});

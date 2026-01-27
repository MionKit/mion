/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DrizzleTypesPostgres, DrizzleTypesMySQL, DrizzleTypesSQLite} from './types/common.types';

// Import PostgreSQL column builder functions
import {
    text as pgText,
    boolean as pgBoolean,
    bigint as pgBigint,
    varchar as pgVarchar,
    date as pgDate,
    time as pgTime,
    timestamp as pgTimestamp,
    integer as pgInteger,
    doublePrecision as pgDoublePrecision,
    uuid as pgUuid,
    inet as pgInet,
    char as pgChar,
    jsonb as pgJsonb,
} from 'drizzle-orm/pg-core';

// Import MySQL column builder functions
import {
    text as mysqlText,
    boolean as mysqlBoolean,
    bigint as mysqlBigint,
    varchar as mysqlVarchar,
    date as mysqlDate,
    time as mysqlTime,
    timestamp as mysqlTimestamp,
    json as mysqlJson,
    double as mysqlDouble,
    int as mysqlInt,
    datetime as mysqlDatetime,
} from 'drizzle-orm/mysql-core';

// Import SQLite column builder functions
import {text as sqliteText, integer as sqliteInteger, real as sqliteReal, blob as sqliteBlob} from 'drizzle-orm/sqlite-core';

describe('DrizzleTypes constants validation', () => {
    describe('DrizzleTypesPostgres', () => {
        it('text should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.text).toBe(pgText.name);
        });

        it('boolean should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.boolean).toBe(pgBoolean.name);
        });

        it('bigint should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.bigint).toBe(pgBigint.name);
        });

        it('varchar should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.varchar).toBe(pgVarchar.name);
        });

        it('date should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.date).toBe(pgDate.name);
        });

        it('time should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.time).toBe(pgTime.name);
        });

        it('timestamp should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.timestamp).toBe(pgTimestamp.name);
        });

        it('integer should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.integer).toBe(pgInteger.name);
        });

        it('doublePrecision should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.doublePrecision).toBe(pgDoublePrecision.name);
        });

        it('uuid should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.uuid).toBe(pgUuid.name);
        });

        it('inet should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.inet).toBe(pgInet.name);
        });

        it('char should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.char).toBe(pgChar.name);
        });

        it('jsonb should match drizzle function name', () => {
            expect(DrizzleTypesPostgres.jsonb).toBe(pgJsonb.name);
        });
    });

    describe('DrizzleTypesMySQL', () => {
        it('text should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.text).toBe(mysqlText.name);
        });

        it('boolean should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.boolean).toBe(mysqlBoolean.name);
        });

        it('bigint should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.bigint).toBe(mysqlBigint.name);
        });

        it('varchar should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.varchar).toBe(mysqlVarchar.name);
        });

        it('date should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.date).toBe(mysqlDate.name);
        });

        it('time should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.time).toBe(mysqlTime.name);
        });

        it('timestamp should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.timestamp).toBe(mysqlTimestamp.name);
        });

        it('json should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.json).toBe(mysqlJson.name);
        });

        it('double should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.double).toBe(mysqlDouble.name);
        });

        it('int should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.int).toBe(mysqlInt.name);
        });

        it('datetime should match drizzle function name', () => {
            expect(DrizzleTypesMySQL.datetime).toBe(mysqlDatetime.name);
        });
    });

    describe('DrizzleTypesSQLite', () => {
        it('text should match drizzle function name', () => {
            expect(DrizzleTypesSQLite.text).toBe(sqliteText.name);
        });

        it('integer should match drizzle function name', () => {
            expect(DrizzleTypesSQLite.integer).toBe(sqliteInteger.name);
        });

        it('real should match drizzle function name', () => {
            expect(DrizzleTypesSQLite.real).toBe(sqliteReal.name);
        });

        it('blob should match drizzle function name', () => {
            expect(DrizzleTypesSQLite.blob).toBe(sqliteBlob.name);
        });
    });
});

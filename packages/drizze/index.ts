/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Main table functions
export {drizzlePGTable} from './src/postgres';
export {drizzleMysqlTable} from './src/mysql';
export {drizzleSqliteTable} from './src/sqlite';

// Core utilities
export {extractTypeInfo} from './src/core/typeTraverser';
export {validateConfig} from './src/core/validator';
export {DrizzleMionError, ErrorMessages} from './src/core/errors';

// Types
export type {PropertyInfo, TypeInfo, ValidationResult, ColumnMapping, DatabaseType, FormatName} from './src/types/common.types';
export {FormatNames} from './src/types/common.types';

// Mappers (for advanced usage)
export {BaseColumnMapper} from './src/mappers/base.mapper';
export {PGColumnMapper} from './src/mappers/pg.mapper';
export {MySQLColumnMapper} from './src/mappers/mysql.mapper';
export {SQLiteColumnMapper} from './src/mappers/sqlite.mapper';

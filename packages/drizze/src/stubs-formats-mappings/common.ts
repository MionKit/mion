/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Note: Must use regular import (not `import type`) for reflection to work
import {FormatUUIDv7, FormatEmail} from '@mionkit/type-formats/StringFormats';
import {FormatInteger, FormatPositiveInt} from '@mionkit/type-formats/NumberFormats';

// ============================================================================
// Shared test interfaces
// ============================================================================

export interface User {
    id: FormatUUIDv7;
    email: FormatEmail;
    name: string;
    age: FormatInteger;
    score: FormatPositiveInt;
    tags: string[];
    profile: {avatar: string; theme: string};
}

export interface Post {
    id: FormatUUIDv7;
    authorId: FormatUUIDv7;
    title: string;
    views: FormatPositiveInt;
}

export interface UserWithOptional {
    id: FormatUUIDv7;
    name: string;
    bio?: string;
}

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Note: Must use regular import (not `import type`) for reflection to work
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';
import {NumInteger, NumPositiveInt} from '@mionkit/type-formats/FormatsNumber';

// ============================================================================
// Shared test interfaces
// ============================================================================

export interface User {
    id: StrUUIDv7;
    email: StrEmail;
    name: string;
    age: NumInteger;
    score: NumPositiveInt;
    tags: string[];
    profile: {avatar: string; theme: string};
}

export interface Post {
    id: StrUUIDv7;
    authorId: StrUUIDv7;
    title: string;
    views: NumPositiveInt;
}

export interface UserWithOptional {
    id: StrUUIDv7;
    name: string;
    bio?: string;
}

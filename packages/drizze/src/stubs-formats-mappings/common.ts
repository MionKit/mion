/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Note: Must use regular import (not `import type`) for reflection to work
import {UUIDv7, Email} from '@ts-runtypes/core/formats';
import {Integer, PositiveInt} from '@ts-runtypes/core/formats';

// ============================================================================
// Shared test interfaces
// ============================================================================

export interface User {
    id: UUIDv7;
    email: Email;
    name: string;
    age: Integer;
    score: PositiveInt;
    tags: string[];
    profile: {avatar: string; theme: string};
}

export interface Post {
    id: UUIDv7;
    authorId: UUIDv7;
    title: string;
    views: PositiveInt;
}

export interface UserWithOptional {
    id: UUIDv7;
    name: string;
    bio?: string;
}

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getENV} from '@mionkit/core';

export const isTest = getENV('NODE_ENV') === 'test';

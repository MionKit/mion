/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import * as platformNode from '../index.ts';

describe('@mionjs/platform-node exports', () => {
  it('does not export the removed unused JSON constants', () => {
    for (const name of ['CONTENT_TYPE_HEADER_NAME', 'ACCEPT_JSON', 'JSON_CONTENT_TYPE', 'JSON_TYPE_HEADER'])
      expect(platformNode).not.toHaveProperty(name);
  });

  it('still exports the default options', () => {
    expect(platformNode.DEFAULT_HTTP_OPTIONS.port).toBe(80);
  });
});

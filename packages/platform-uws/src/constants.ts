/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {UwsHttpOptions} from './types.ts';

export const DEFAULT_UWS_HTTP_OPTIONS: UwsHttpOptions = {
  port: 80,
  defaultResponseHeaders: {},
  /**
   * 256KB by default, same as lambda payload
   * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
   * */
  maxBodySize: 256000, // 256KB
  binary: {},
};

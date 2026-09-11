/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {AwsLambdaOptions} from './types.ts';

/** AWS's own request ceiling on a synchronous invocation, 6 MB, which no option can raise. Override
 *  `maxBodySizeCap` when your entry path differs (1 MB behind an Application Load Balancer). */
export const AWS_LAMBDA_MAX_BODY_SIZE_CAP = 6_000_000;

export const DEFAULT_AWS_LAMBDA_OPTIONS: AwsLambdaOptions = {
  defaultResponseHeaders: {},
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  maxBodySizeCap: AWS_LAMBDA_MAX_BODY_SIZE_CAP,
};

/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {AwsLambdaOptions} from './types.ts';

/** AWS's 6 MB ceiling on a synchronous invocation, which no option can raise; override `maxBodySizeCap` behind an ALB (1 MB). */
export const AWS_LAMBDA_MAX_BODY_SIZE_CAP = 6_000_000;

export const DEFAULT_AWS_LAMBDA_OPTIONS: AwsLambdaOptions = {
  defaultResponseHeaders: {},
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  maxBodySizeCap: AWS_LAMBDA_MAX_BODY_SIZE_CAP,
};

/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext, Obj} from '@mionkit/router';
import type {Context as AwsContext, APIGatewayEvent} from 'aws-lambda';

export type AwsCallContext<SharedData extends Obj> = CallContext<SharedData, APIGatewayEvent, AwsContext>;

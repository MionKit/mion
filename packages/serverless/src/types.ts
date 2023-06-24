/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Context, Obj} from '@mion/router';
import type {Context as AwsContext, APIGatewayEvent} from 'aws-lambda';

export type AwsRawServerContext = {
    rawRequest: APIGatewayEvent;
    awsContext: AwsContext;
};

export type AwsCallContext<SharedData extends Obj> = Context<SharedData, AwsRawServerContext>;

import {AwsLambdaOptions, createAwsLambdaHandler} from '@mionjs/platform-aws';
import './myApi.routes.ts';

const awsOptions: Partial<AwsLambdaOptions> = {};
export const handler = createAwsLambdaHandler(awsOptions);

import {AwsLambdaOptions, createAwsLambdaHandler} from '@mionjs/platform-aws';
import './myApi.routes';

// set options specific for aws lambda
const awsOptions: Partial<AwsLambdaOptions> = {};

// export AWS Lambda Handler
export const handler = createAwsLambdaHandler(awsOptions);

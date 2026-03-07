import {AwsLambdaOptions, awsLambdaHandler, setAwsLambdaOpts} from '@mionjs/platform-aws';
import './myApi.routes';

// set options specific for aws lambda
const awsOptions: Partial<AwsLambdaOptions> = {};
setAwsLambdaOpts(awsOptions);

// export AWS Lambda Handler
export const handler = awsLambdaHandler;

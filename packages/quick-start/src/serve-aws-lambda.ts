import {setAwsLambdaOptions, awsLambdaHandler} from '@mionkit/serverless';
import './myApi.routes';

// set options specific for aws lambda
const awsOptions = {};
setAwsLambdaOptions(awsOptions);

// export AWS Lambda Handler
export const handler = awsLambdaHandler;

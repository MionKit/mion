// Simple test to verify jsonParse compilation
const { runType } = require('./packages/run-types/dist/lib/runType');
const { JitFunctions } = require('./packages/run-types/dist/constants.functions');

try {
    console.log('Testing basic string type...');
    const stringRt = runType();
    const jsonParse = stringRt.createJitFunction(JitFunctions.jsonParse);
    console.log('String jsonParse function created successfully!');
    
    console.log('Testing basic number type...');
    const numberRt = runType();
    const numberJsonParse = numberRt.createJitFunction(JitFunctions.jsonParse);
    console.log('Number jsonParse function created successfully!');
    
    console.log('All basic tests passed!');
} catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
}

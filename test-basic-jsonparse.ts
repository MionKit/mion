// Basic test to verify jsonParse compilation
import {runType} from './packages/run-types/src/lib/runType';
import {JitFunctions} from './packages/run-types/src/constants.functions';

try {
    console.log('Testing basic string type...');
    type StringType = string;
    const stringRt = runType<StringType>();
    const jsonParse = stringRt.createJitFunction(JitFunctions.jsonParse);
    const jsonStringify = stringRt.createJitFunction(JitFunctions.jsonStringify);
    
    const testValue = 'hello world';
    const jsonString = jsonStringify(testValue);
    const parsed = JSON.parse(jsonString);
    const result = jsonParse(parsed);
    
    console.log('Original:', testValue);
    console.log('JSON string:', jsonString);
    console.log('Parsed JSON:', parsed);
    console.log('Final result:', result);
    console.log('Round trip successful:', result === testValue);
    
} catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
}

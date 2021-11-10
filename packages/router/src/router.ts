/* ######## 2021 ApiDS - MIT LICENSE ######## */

//export * as GenerateTypes from 'json-schema-to-typescript';

// // compile from file
// compileFromFile('foo.json')
//   .then(ts => fs.writeFileSync('foo.d.ts', ts))

// // or, compile a JS object
// let mySchema = {
//   properties: [...]
// }
// compile(mySchema, 'MySchema')
//   .then(ts => ...)
export * from './types';

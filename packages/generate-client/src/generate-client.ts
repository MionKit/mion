/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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
export * from 'json-schema-to-typescript';

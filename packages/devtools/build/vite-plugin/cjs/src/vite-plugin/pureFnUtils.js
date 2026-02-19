"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const PURE_SERVER_FN_NAMESPACE = "pureServerFn";
const hashes = /* @__PURE__ */ new Map();
const hashChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const alphaChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const hashIncrement = 2;
const maxHashCollisions = 22;
const PRIME = 37;
const hashDefaultLength = 6;
const pureFnHashLength = 8;
function quickHash(input, length = hashDefaultLength, prevResult) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash, PRIME) + input.charCodeAt(i) >>> 0;
  }
  let result = prevResult || "";
  hash = Math.imul(hash, PRIME) >>> 0;
  result += alphaChars.charAt(hash % alphaChars.length);
  while (result.length < length) {
    hash = Math.imul(hash, PRIME) >>> 0;
    result += hashChars.charAt(hash % hashChars.length);
  }
  return result.slice(0, length);
}
function createUniqueHash(id, length = hashDefaultLength) {
  let hash = quickHash(id, length);
  let counter = 1;
  let existingId = hashes.get(hash);
  while (existingId && existingId !== id) {
    length += counter * hashIncrement;
    const newId = quickHash(id, length, hash);
    hash = newId;
    counter++;
    existingId = hashes.get(hash);
    if (counter > maxHashCollisions) throw new Error(`Cannot generate unique hash for typeID: ${id} too many collisions.`);
  }
  hashes.set(hash, id);
  return hash;
}
function normalizePureFnBody(body) {
  return body.replace(/[ \t]+/g, " ").trim();
}
exports.PURE_SERVER_FN_NAMESPACE = PURE_SERVER_FN_NAMESPACE;
exports.createUniqueHash = createUniqueHash;
exports.normalizePureFnBody = normalizePureFnBody;
exports.pureFnHashLength = pureFnHashLength;
//# sourceMappingURL=pureFnUtils.js.map

// Public entry for `@mionjs/run-types/runtime` — the cache and compiled-fn plumbing a host
// needs to LOAD and RUN what the build compiled, as opposed to authoring types with it.
//
// Off the main entry on purpose. `getRTUtils` reaches classSerializerRegistry, which reaches
// entryTuple, so a barrel that carries it puts that whole subtree in every bundle that touches
// the package. Only @mionjs/core, @mionjs/router and the drizzle packages call any of this.

export {getRTUtils, getRTFnCaches, type RTUtils} from '../runtypes/rtUtils.ts';
export {buildFactoryFromCode, buildPureFnFactoryFromCode, entryCode} from '../runtypes/rtUtils.ts';
export {getRunType} from '../getRunType.ts';
export {getFnHash, type FnHashKey, type FnHashOptions} from '../fnHash.ts';
export {FAMILY_TAG_TO_FN_KEY} from '../go-generated/fnHashes.generated.ts';
export {registerPureFnFactory, registerPureFn, type PureFnId} from '../runtypes/pureFn.ts';
export {RUN_TYPES_PURE_FN_ID_PREFIX} from '../runtypes/pure-fn-ids.generated.ts';
export {
  registerClassSerializer,
  type ClassSerializerHandler,
  type AnyClass,
  type SerializableClass,
  type DeserializeClassFn,
} from '../runtypes/classSerializerRegistry.ts';
export {typeFormats, type FormatName, type TypeFormatMeta} from '../go-generated/typeFormats.generated.ts';
export {getRTFunction, type RTFunctionByKey, type RTFunctionKey} from '../createRTFunctions.ts';

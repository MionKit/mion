(function(exports) {
  "use strict";
  function _mergeNamespaces(n, m) {
    for (var i = 0; i < m.length; i++) {
      const e = m[i];
      if (typeof e !== "string" && !Array.isArray(e)) {
        for (const k in e) {
          if (k !== "default" && !(k in n)) {
            const d = Object.getOwnPropertyDescriptor(e, k);
            if (d) {
              Object.defineProperty(n, k, d.get ? d : {
                enumerable: true,
                get: () => e[k]
              });
            }
          }
        }
      }
    }
    return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
  }
  const __ΩReadonly$1 = ["T", "Readonly", 'l+e#!e"!fRb!Pde"!gN#%w"y'];
  const __ΩOmit$1 = ["T", "K", () => __ΩPick$3, () => __ΩExclude$1, "Omit", 'b!b"e!!e!!ge!"o$#o##w%y'];
  const __ΩRecord$4 = ["K", "T", "Record", `l'e#"Rb!b"Pde"!N#!w#y`];
  const __ΩIterableIterator = ["T", "TReturn", "TNext", () => __ΩIterator, 0, () => Symbol.iterator, "IterableIterator", `b!"c""c#Pe"!e""e"#o$$Pe#!e#"e##o%$1&Mw'y`];
  const __ΩPick$3 = ["T", "K", "Pick", 'l+e#!e"!fRb!b"Pde""N#!w#y'];
  const __ΩExclude$1 = ["T", "U", "Exclude", 'l6!Re$!RPe#!e$"qk#%QRb!b"Pde"!p)w#y'];
  const __ΩIterator = ["T", "TReturn", "TNext", "param0", () => __ΩIteratorResult, "next", "value", () => __ΩIteratorResult, "return", "e", () => __ΩIteratorResult, "throw", "Iterator", `b!"c""c#PPPPGPe%#GJ@2$e#!e#"o%#1&Pe#"2'8e#!e#"o(#1)8P"2*8e#!e#"o+#1,8Mw-y`];
  const __ΩIteratorResult = ["T", "TReturn", () => __ΩIteratorYieldResult, () => __ΩIteratorReturnResult, "IteratorResult", 'b!"c"Pe"!o#"e""o$"Jw%y'];
  const __ΩIteratorYieldResult = ["TYield", false, "done", "value", "IteratorYieldResult", 'b!P."4#8e"!4$Mw%y'];
  const __ΩIteratorReturnResult = ["TReturn", true, "done", "value", "IteratorReturnResult", 'b!P."4#e"!4$Mw%y'];
  const __ΩCallContext = ["ContextData", "path", () => __ΩMionRequest, "request", () => __ΩMionResponse, "response", "shared", "MethodsExecutionChain", "executionChain", "urlQuery", "routesFlowRouteIds", "CallContext", `"c!P&4"9n#4$9n%4&9e"!4'"w(4)9&4*89&F4+89Mw,y`];
  const __ΩRawRequestBody = ["AnyObject", "RawRequestBody", 'P&_W"w!Jw"y'];
  const __ΩRawResponseBody = ["AnyObject", "RawResponseBody", 'P&_W"w!Jw"y'];
  const __ΩMionRequest = [() => __ΩReadonly$1, () => __ΩOmit$1, () => __ΩMionHeaders, "append", "set", "delete", "headers", () => __ΩRawRequestBody, "rawBody", "SerializerCode", "bodyType", () => __ΩReadonly$1, "AnyObject", "body", () => __ΩReadonly$1, () => __ΩRecord$4, "RpcError", "thrownErrors", "MionRequest", `Pn#P.$.%.&Jo"#o!"4'9n(4)9"w*4+9"w-o,"4.9&"w1o0#o/"4289Mw3y`];
  const __ΩMionResponse = ["statusCode", () => __ΩReadonly$1, () => __ΩMionHeaders, "headers", () => __ΩRawResponseBody, "rawBody", "SerializerCode", "serializer", () => __ΩReadonly$1, () => __ΩResponseBody, "body", "hasErrors", "DataViewSerializer", "binSerializer", "MionResponse", `P'4!9n#o""4$9n%4&9"w'4(9n*o)"4+9)4,9P"w--J4.89Mw/y`];
  const __ΩMionHeaders = ["name", "value", "append", "delete", "set", "get", "has", () => __ΩIterableIterator, "entries", () => __ΩIterableIterator, "keys", () => __ΩIterableIterator, "values", "MionHeaders", `PP&2!&2"$1#P&2!$1$P&2!&2"$1%P&2!P&-,J1&P&2!)1'PP&&Go("1)P&o*"1+P&o,"1-Mw.y`];
  const __ΩContextDataFactory = ["ContextData", "", "ContextDataFactory", 'b!Pe"!/"w#y'];
  const __ΩResponseBody = [() => __ΩRecord$4, () => __ΩRecord$4, "RpcError", "@thrownErrors", "ResponseBody", 'P&"o!#&"w#o"#4$8Mw%y'];
  const __ΩRoutesFlowExecutionResult = ["MethodsExecutionChain", "executionChain", "routesFlowRouteIds", "RoutesFlowMapping", "mappings", "RoutesFlowExecutionResult", 'P"w!4"&F4#8"w$F4%8Mw&y'];
  const __ΩPartial = ["T", "Partial", 'l+e#!e"!fRb!Pde"!gN#"w"y'];
  const __ΩPick$2 = ["T", "K", "Pick", 'l+e#!e"!fRb!b"Pde""N#!w#y'];
  const __ΩRemoteMethod = ["AnyHandler", "H", "MethodWithJitFns", "RemoteMethodOpts", "options", "handler", "args", "", "methodCaller", "RemoteMethod", `"w!c"P"w#"w$4%e"!4&P"@2'"/(4)8Mw*y`];
  const __ΩRouteMethod = ["H", () => __ΩRemoteMethod, () => HandlerType.route, "type", "RouteOnlyOptions", "options", "RouteMethod", `"c!Pe"!o""i#4$"w%4&Mw'y`];
  const __ΩMiddleFnMethod = ["H", () => __ΩRemoteMethod, () => HandlerType.middleFn, "type", "MiddleFnMethod", '"c!Pe"!o""i#4$Mw%y'];
  const __ΩHeadersMethod = ["H", () => __ΩRemoteMethod, () => HandlerType.headersMiddleFn, "type", "HeadersMethodWithJitFns", "headersParam", "HeadersMethod", `"c!Pe"!o""i#4$"w%4&Mw'y`];
  const __ΩRawMethod = ["H", () => __ΩRemoteMethod, () => HandlerType.rawMiddleFn, "type", "RemoteMethodOpts", false, "validateParams", false, "validateReturn", "options", "RawMethod", `"c!Pe"!o""i#4$P"w%P.&4'.(4)8MK4*Mw+y`];
  const __ΩRouteOptions = [() => __ΩPartial, () => __ΩPick$2, () => __ΩRouteMethod, "options", "description", "validateParams", "validateReturn", "serializer", "isMutation", "RouteOptions", `n#.$fP.%.&.'.(.)Jo"#o!"w*y`];
  const __ΩMiddleFnOptions = [() => __ΩPartial, () => __ΩPick$2, () => __ΩMiddleFnMethod, "options", "description", "validateParams", "validateReturn", "runOnError", "MiddleFnOptions", `n#.$fP.%.&.'.(Jo"#o!"w)y`];
  const __ΩHeadersMiddleFnOptions = [() => __ΩPartial, () => __ΩPick$2, () => __ΩHeadersMethod, "options", "description", "validateParams", "validateReturn", "runOnError", "HeadersMiddleFnOptions", `n#.$fP.%.&.'.(Jo"#o!"w)y`];
  const __ΩRawMiddleFnOptions = [() => __ΩPartial, () => __ΩPick$2, () => __ΩRawMethod, "options", "description", "runOnError", "RawMiddleFnOptions", `n#.$fP.%.&Jo"#o!"w'y`];
  const __ΩMethodsExecutionChain = ["routeIndex", () => __ΩRemoteMethod, "methods", "SerializerCode", "serializer", "MethodsExecutionChain", `P'4!n"F4#"w$4%Mw&y`];
  const __ΩPick$1 = ["T", "K", "Pick", 'l+e#!e"!fRb!b"Pde""N#!w#y'];
  const __ΩRouteDef = ["H", () => __ΩPick$1, () => __ΩRouteMethod, "type", "handler", () => __ΩRouteOptions, "options", "RouteDef", `"c!Pe"!o#"P.$.%Jo"#Pn&4'8MKw(y`];
  const __ΩMiddleFnDef = ["H", () => __ΩPick$1, () => __ΩMiddleFnMethod, "type", "handler", () => __ΩMiddleFnOptions, "options", "MiddleFnDef", `"c!Pe"!o#"P.$.%Jo"#Pn&4'8MKw(y`];
  const __ΩHeadersMiddleFnDef = ["H", () => __ΩPick$1, () => __ΩHeadersMethod, "type", "handler", () => __ΩHeadersMiddleFnOptions, "options", "HeadersMiddleFnDef", `"c!Pe"!o#"P.$.%Jo"#Pn&4'8MKw(y`];
  const __ΩRawMiddleFnDef = ["H", () => __ΩPick$1, () => __ΩRawMethod, "type", "handler", () => __ΩRawMiddleFnOptions, "options", "RawMiddleFnDef", `"c!Pe"!o#"P.$.%Jo"#Pn&4'8MKw(y`];
  const DEFAULT_CORE_OPTIONS = {
    /** automatically generate and uuid */
    autoGenerateErrorId: false
  };
  const PATH_SEPARATOR = "/";
  const ROUTE_PATH_ROOT = PATH_SEPARATOR;
  const ROUTER_ITEM_SEPARATOR_CHAR = "/";
  const MAX_STACK_DEPTH = 50;
  const MION_ROUTES = {
    /** get remote methods metadata by method id */
    methodsMetadataById: "mion@methodsMetadataById",
    /** get remote methods metadata by route path, this include all middleFns in the ExecutionChain of the route. */
    methodsMetadataByPath: "mion@methodsMetadataByPath",
    /** Platform or adapters errors that occur before reaching the router or outside the router and are platform/adapter related */
    platformError: "mion@platformError",
    /** not-found route. This route is called when a requested route doesn't exist */
    notFound: "mion@notFound",
    /**
     * !IMPORTANT!!
     * This is technically not a route, but a special key used to store unexpected errors in the response body.
     * is declared as a route to reuse existing router serialization/deserialization logic.
     * Errors thrown by routes/middleFns, these are not strongly typed
     * */
    thrownErrors: "@thrownErrors"
  };
  const StatusCodes = {
    /** Any error in the server that is not related to the application, ie: server not ready, etc... */
    SERVER_ERROR: 500,
    /** Any expected and strongly typed error returned by a route/middleFn. ie: entity not found, etc. */
    APPLICATION_ERROR: 400,
    /**  Any thrown or unexpected error in the application, ie: validation error, not found, etc, database error, serialization error, etc...
     * These are are typically irrecoverable and can be handled globally, ie redirect to login page if auth fails
     */
    UNEXPECTED_ERROR: 422,
    /** Not found error */
    NOT_FOUND: 404,
    /** Standard success code */
    OK: 200
  };
  const HandlerType$1 = {
    route: 1,
    middleFn: 2,
    headersMiddleFn: 3,
    rawMiddleFn: 4
  };
  const JIT_FUNCTION_IDS = {
    isType: "is",
    typeErrors: "te",
    prepareForJson: "tj",
    restoreFromJson: "fj",
    stringifyJson: "sj",
    toJSCode: "tc",
    toBinary: "tBi",
    fromBinary: "fBi"
  };
  const EMPTY_HASH = "";
  const __ΩPureFunction = ["args", "", "PureFunction", 'P"@2!"/"w#y'];
  const __ΩPureFunctionFactory = ["JITUtils", "jitUtils", () => __ΩPureFunction, "", "PureFunctionFactory", 'P"w!2"n#/$w%y'];
  const __ΩPureFunctionData = ["namespace", "paramNames", "code", "fnName", "bodyHash", "pureFnDependencies", "PureFunctionData", `P&4!9&F4"9&4#9&4$9&4%9&F4&9Mw'y`];
  const __ΩCompiledPureFunction = [() => __ΩPureFunctionData, () => __ΩPureFunctionFactory, "createPureFn", () => __ΩPureFunction, "fn", "CompiledPureFunction", 'Pn!n"4#n$4%8Mw&y'];
  const __ΩRecord$3 = ["K", "T", "Record", `l'e#"Rb!b"Pde"!N#!w#y`];
  const SerializerModes = {
    /** Use prepareForJson (mutates original objects), and leaves JSON.stringify to the platform adapter */
    json: 1,
    /** Use toBinary JIT function for binary serialization */
    binary: 2,
    /** Use stringifyJson JIT function that do not mutates objects. */
    stringifyJson: 3
  };
  const __ΩSerializerMode = [() => SerializerModes, "SerializerMode", 'i!gw"y'];
  const __ΩCoreRouterOptions = ["autoGenerateErrorId", "basePath", "suffix", "CoreRouterOptions", 'P)4!&4"&4#Mw$y'];
  const __ΩJitFnArgs = ["vλl", "JitFnArgs", 'P&4!&&LMw"y'];
  const __ΩJitCompiledFnData = ["typeName", "fnID", "jitFnHash", () => __ΩJitFnArgs, "args", () => __ΩJitFnArgs, "defaultParamValues", "isNoop", "code", "jitDependencies", "pureFnDependencies", "paramNames", "JitCompiledFnData", `P&4!9&4"9&4#9n$4%9n&4'9)4(89&4)9&F4*9&F4+9&F4,8Mw-y`];
  const __ΩJitCompiledFn = [() => __ΩAnyFn, "Fn", () => __ΩJitCompiledFnData, "JITUtils", "utl", "", "createJitFn", "fn", "JitCompiledFn", `n!c"Pn#P"w$2%e#!/&4'9e"!4(9Mw)y`];
  const __ΩJitFunctionsCache = [() => __ΩRecord$3, () => __ΩJitCompiledFn, "JitFunctionsCache", '&n"o!#w#y'];
  const __ΩPureFunctionsCache = [() => __ΩRecord$3, () => __ΩRecord$3, () => __ΩCompiledPureFunction, "PureFunctionsCache", '&&n#o"#o!#w$y'];
  const __ΩFnsDataCache = [() => __ΩRecord$3, () => __ΩJitCompiledFnData, "FnsDataCache", '&n"o!#w#y'];
  const __ΩPureFnsDataCache = [() => __ΩRecord$3, () => __ΩRecord$3, () => __ΩPureFunctionData, "PureFnsDataCache", '&&n#o"#o!#w$y'];
  const __ΩSrcCodeJitCompiledFn = [() => __ΩJitCompiledFnData, "JITUtils", "utl", () => __ΩAnyFn, "", "createJitFn", "fn", "SrcCodeJitCompiledFn", `Pn!P"w"2#n$/%4&9-4'9Mw(y`];
  const __ΩSrcCodeCompiledPureFunction = [() => __ΩPureFunctionData, "JITUtils", "utl", () => __ΩAnyFn, "", "createPureFn", "fn", "SrcCodeCompiledPureFunction", `Pn!P"w"2#n$/%4&9-4'9Mw(y`];
  const __ΩSrcCodeJITCompiledFnsCache = [() => __ΩRecord$3, () => __ΩSrcCodeJitCompiledFn, "SrcCodeJITCompiledFnsCache", '&n"o!#w#y'];
  const __ΩSrcCodePureFunctionsCache = [() => __ΩRecord$3, () => __ΩRecord$3, () => __ΩSrcCodeCompiledPureFunction, "SrcCodePureFunctionsCache", '&&n#o"#o!#w$y'];
  const __ΩAnyFn = ["args", "", "AnyFn", 'P"@2!"/"w#y'];
  const __ΩAnyObject = [() => __ΩRecord$3, "AnyObject", '&#o!#w"y'];
  const __ΩRecord$2 = ["K", "T", "Record", `l'e#"Rb!b"Pde"!N#!w#y`];
  const __ΩMethodMetadata = ["type", "id", "isAsync", "hasReturnData", "paramNames", "paramsJitHash", "returnJitHash", () => __ΩHeadersMetaData, "headersParam", () => __ΩHeadersMetaData, "headersReturn", "middleFnIds", "pointer", "nestLevel", "MethodMetadata", `P'4!&4")4#)4$&F4%8&4&&4'n(4)8n*4+8&F4,8&F4-'4.Mw/y`];
  const __ΩRemoteMethodOpts = ["runOnError", "validateParams", "validateReturn", "description", () => __ΩSerializerMode, "serializer", "isMutation", "RemoteMethodOpts", `P)4!8)4"8)4#8&4$8n%4&8P)-J4'8Mw(y`];
  const __ΩMethodWithOptions = [() => __ΩMethodMetadata, () => __ΩRemoteMethodOpts, "options", "MethodWithOptions", 'Pn!n"4#Mw$y'];
  const __ΩMethodsCache = [() => __ΩRecord$2, () => __ΩMethodWithOptions, "MethodsCache", '&n"o!#w#y'];
  const __ΩHeadersMetaData = ["headerNames", "jitHash", "HeadersMetaData", 'P&F4!&4"Mw#y'];
  const __ΩSerializableMethodsData = [() => __ΩMethodsCache, "methods", () => __ΩFnsDataCache, "deps", () => __ΩPureFnsDataCache, "purFnDeps", "SerializableMethodsData", `Pn!4"n#4$n%4&Mw'y`];
  const STR = 1;
  const NUM = 2;
  const POW_2_32 = 2 ** 32;
  const LE = true;
  const DEFAULT_OPTIONS = {
    maxPoolItems: 100,
    maxStrCacheLength: 64,
    maxCacheSize: 1e3,
    bufferSize: 2 ** 24,
    averageResponseSizeMultiplier: 2,
    responseAverageSizes: /* @__PURE__ */ new Map(),
    stringBytesCache: /* @__PURE__ */ new Map()
  };
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  let opts = { ...DEFAULT_OPTIONS };
  function createDataViewSerializer(routeId, workflowRouteIds) {
    const size = calculateBufferSizeForRequest(routeId, workflowRouteIds);
    if (size >= POW_2_32) throw new Error("bufferSize option must be strictly less than 2 ** 32");
    return new DataViewSerializerImpl(routeId, size);
  }
  function createDataViewDeserializer(routeId, input) {
    if (ArrayBuffer.isView(input)) {
      const buffer = input.buffer;
      return new DataViewDeserializerImpl(routeId, buffer, input.byteOffset, input.byteLength);
    }
    return new DataViewDeserializerImpl(routeId, input);
  }
  class DataViewSerializerImpl {
    buffer;
    uint8View;
    // Reusable view
    routeId;
    index = 0;
    // byte offset
    view;
    hasEnded = false;
    constructor(routeId, size) {
      this.routeId = routeId;
      this.buffer = new ArrayBuffer(size);
      this.view = new DataView(this.buffer);
      this.uint8View = new Uint8Array(this.buffer);
    }
    reset() {
      this.index = 0;
      this.hasEnded = false;
    }
    resize(size) {
      this.buffer = new ArrayBuffer(size);
      this.view = new DataView(this.buffer);
      this.uint8View = new Uint8Array(this.buffer);
    }
    getBuffer() {
      const buff = this.buffer.slice(0, this.index);
      return buff;
    }
    getBufferView() {
      return new Uint8Array(this.buffer, 0, this.index);
    }
    markAsEnded() {
      this.hasEnded = true;
      updateResponseSize(this.routeId, this.index);
    }
    getLength() {
      return this.index;
    }
    serString(str, skipCache) {
      if (str.length >= opts.maxStrCacheLength || skipCache) {
        const targetView2 = this.uint8View.subarray(this.index + 4);
        const result2 = textEncoder.encodeInto(str, targetView2);
        this.view.setUint32(this.index, result2.written, LE);
        this.index += 4 + result2.written;
        return;
      }
      const cached = opts.stringBytesCache.get(str);
      if (cached) {
        this.uint8View.set(cached, this.index + 4);
        this.view.setUint32(this.index, cached.length, LE);
        this.index += 4 + cached.length;
        return;
      }
      const targetView = this.uint8View.subarray(this.index + 4);
      const result = textEncoder.encodeInto(str, targetView);
      const written = result.written;
      this.view.setUint32(this.index, written, LE);
      this.index += 4 + written;
      if (opts.stringBytesCache.size >= opts.maxCacheSize) evictStringBytesCache();
      opts.stringBytesCache.set(str, this.uint8View.slice(this.index - written, this.index));
    }
    serFloat64(n) {
      this.view.setFloat64(this.index, n, LE);
      this.index += 8;
    }
    serEnum(n) {
      if (typeof n === "number") {
        this.view.setUint32(this.index, NUM, LE);
        this.index += 4;
        this.view.setUint32(this.index, n, LE);
        this.index += 4;
        return;
      }
      this.view.setUint32(this.index, STR, LE);
      this.index += 4;
      this.serString(n);
    }
    setBitMask(bitMaskIndex, bitIndex) {
      const newBitmask = this.view.getUint8(bitMaskIndex) | 1 << bitIndex;
      this.view.setUint8(bitMaskIndex, newBitmask);
    }
  }
  class DataViewDeserializerImpl {
    buffer;
    uint8View;
    // Reusable view
    routeId;
    index = 0;
    view;
    hasEnded = false;
    constructor(routeId, buffer, byteOffset, byteLength) {
      this.routeId = routeId;
      this.buffer = buffer;
      this.index = 0;
      this.view = new DataView(buffer, byteOffset, byteLength);
      this.uint8View = new Uint8Array(buffer, byteOffset, byteLength);
    }
    reset() {
      this.index = 0;
      this.hasEnded = false;
    }
    setBuffer(buffer, byteOffset, byteLength) {
      this.index = 0;
      this.buffer = buffer;
      this.view = new DataView(buffer, byteOffset, byteLength);
      this.uint8View = new Uint8Array(buffer, byteOffset, byteLength);
      this.hasEnded = false;
    }
    markAsEnded() {
      this.hasEnded = true;
    }
    getLength() {
      return this.index;
    }
    desString() {
      const len = this.view.getUint32(this.index, LE);
      this.index += 4;
      const decoded = textDecoder.decode(this.uint8View.subarray(this.index, this.index + len));
      this.index += len;
      return decoded;
    }
    /** Deserialize a string that will be used as a property name, with prototype pollution protection */
    desSafePropName() {
      const key = this.desString();
      const len = key.length;
      if (len === 9) {
        if (key === "__proto__" || key === "prototype") throw new Error(`Unsafe property name: ${key}`);
      } else if (len === 11) {
        if (key === "constructor") throw new Error(`Unsafe property name: ${key}`);
      }
      return key;
    }
    desFloat64() {
      const value = this.view.getFloat64(this.index, LE);
      this.index += 8;
      return value;
    }
    desEnum() {
      const type = this.view.getUint32(this.index, LE);
      this.index += 4;
      if (type === NUM) {
        const value = this.view.getUint32(this.index, LE);
        this.index += 4;
        return value;
      }
      return this.desString();
    }
  }
  function calculateBufferSizeForRequest(routeId, workflowRouteIds) {
    if (!workflowRouteIds || workflowRouteIds.length === 0) {
      return calculateDefaultBufferSize(routeId);
    }
    let totalSize = 0;
    for (const id of workflowRouteIds) {
      totalSize += calculateDefaultBufferSize(id);
    }
    return totalSize;
  }
  function calculateDefaultBufferSize(routeId) {
    const size = opts.responseAverageSizes.get(routeId);
    if (!size) return opts.bufferSize;
    return size * opts.averageResponseSizeMultiplier;
  }
  function updateResponseSize(routeId, responseSize) {
    const currentSize = opts.responseAverageSizes.get(routeId) || opts.bufferSize;
    const average = (currentSize + responseSize) / 2;
    opts.responseAverageSizes.set(routeId, Math.floor(average));
  }
  function evictStringBytesCache() {
    const entries = Array.from(opts.stringBytesCache.entries());
    opts.stringBytesCache.clear();
    for (let i = Math.floor(entries.length / 2); i < entries.length; i++) {
      opts.stringBytesCache.set(entries[i][0], entries[i][1]);
    }
  }
  function restoreCompiledJitFns(jitCache, pureCache, jUtil) {
    const visitedPure = /* @__PURE__ */ new Set();
    const visitedJit = /* @__PURE__ */ new Set();
    for (const namespace in pureCache) {
      const nsCache = pureCache[namespace];
      const keysPureFns = Object.keys(nsCache);
      keysPureFns.forEach((key) => restoreCompiledPureFn(pureCache, namespace, key, jUtil, visitedPure));
    }
    const keysJitFns = Object.keys(jitCache);
    keysJitFns.forEach((key) => restoreCompiledJitFn(jitCache, pureCache, key, jUtil, visitedPure, visitedJit));
  }
  function restoreCompiledPureFn(pureCache, namespace, fnName, jUtil, visited) {
    const visitedKey = `${namespace}:${fnName}`;
    if (visited.has(visitedKey)) return;
    visited.add(visitedKey);
    const nsCache = pureCache[namespace];
    if (!nsCache) throw new Error(`Pure function namespace ${namespace} not found`);
    const pureCompiled = nsCache[fnName];
    if (!pureCompiled) throw new Error(`Pure function ${fnName} not found in namespace ${namespace}`);
    if (pureCompiled.fn) return;
    const dependencies = pureCompiled.pureFnDependencies;
    dependencies.forEach((depName) => restoreCompiledPureFn(pureCache, namespace, depName, jUtil, visited));
    if (pureCompiled.createPureFn) {
      pureCompiled.fn = pureCompiled.createPureFn(jUtil);
      return;
    }
    restorePureFunction(pureCompiled, jUtil);
  }
  function restoreCompiledJitFn(jitCache, pureCache, fnHash, jUtil, visitedPure, visitedJit) {
    if (visitedJit.has(fnHash)) return;
    visitedJit.add(fnHash);
    const jitCompiled = jitCache[fnHash];
    if (!jitCompiled) throw new Error(`Jit function ${fnHash} not found`);
    if (jitCompiled.fn) return;
    const pureDependencies = jitCompiled.pureFnDependencies;
    pureDependencies.forEach((dep) => {
      const parts = dep.split("::");
      if (parts.length !== 2) throw new Error(`Invalid pure function dependency format: ${dep}, expected "namespace::fnHash"`);
      const [namespace, fnHash2] = parts;
      restoreCompiledPureFn(pureCache, namespace, fnHash2, jUtil, visitedPure);
    });
    const dependencies = jitCompiled.jitDependencies;
    dependencies.forEach((dep) => restoreCompiledJitFn(jitCache, pureCache, dep, jUtil, visitedPure, visitedJit));
    if (jitCompiled.createJitFn) {
      jitCompiled.fn = jitCompiled.createJitFn(jUtil);
      return;
    }
    restoreCreateJitFn(jitCompiled, jUtil);
  }
  function restoreCreateJitFn(fnData, jUtil) {
    const fnName = fnData.jitFnHash;
    const fnWithContext = `'use strict'; ${fnData.code}`;
    try {
      const wrapperWithContext = new Function("utl", fnWithContext);
      const fn = wrapperWithContext(jUtil);
      const jitFn = fnData;
      jitFn.createJitFn = wrapperWithContext;
      jitFn.fn = fn;
      return jitFn;
    } catch (e) {
      throw new TypedError({
        type: "jit-fn-restore-error",
        message: `Failed to restore JIT function ${fnName}: ${e?.message}`
      });
    }
  }
  function restorePureFunction(pureFnData, jUtil) {
    const fnName = pureFnData.fnName;
    const fnWithContext = `'use strict'; ${pureFnData.code}`;
    try {
      const wrapperWithContext = new Function("utl", fnWithContext);
      const fn = wrapperWithContext(jUtil);
      const pureFn = pureFnData;
      pureFn.createPureFn = wrapperWithContext;
      pureFn.fn = fn;
      return pureFn;
    } catch (e) {
      throw new TypedError({
        type: "pure-fn-restore-error",
        message: `Failed to restore pure function ${fnName}: ${e?.message}`
      });
    }
  }
  const jitFnsCache$1 = {};
  const pureFnsCache$1 = {};
  const deserializeFnsRegistry = /* @__PURE__ */ new Map();
  const serializableClassRegistry = /* @__PURE__ */ new Map();
  const jitUtils = {
    addToJitCache(comp) {
      jitFnsCache$1[comp.jitFnHash] = comp;
    },
    removeFromJitCache(comp) {
      if (!jitFnsCache$1[comp.jitFnHash]) return;
      jitFnsCache$1[comp.jitFnHash] = void 0;
    },
    getJIT(jitFnHash) {
      return jitFnsCache$1[jitFnHash];
    },
    getJitFn(jitFnHash) {
      const comp = jitFnsCache$1[jitFnHash];
      if (!comp) throw new Error(`Jit function not found for jitFnHash ${jitFnHash}`);
      return comp.fn;
    },
    hasJitFn(jitFnHash) {
      return !!jitFnsCache$1[jitFnHash]?.fn;
    },
    /**
     * Checks if key map can be serialized/deserialized with json and still works as a key for a map.
     * ie: if a map key is an string, it can be serialized to json and deserialized back an still will identify the correct map entry.
     * ie: if a map entry is an object, the object can not be serialized/deserialized and wont work as the same key for entry map as they are not same memory ref.
     *  */
    addPureFn(namespace, compiledFn) {
      const fnHash = compiledFn.fnName;
      if (!fnHash) throw new Error("Pure function must have a name and must be unique");
      const nsCache = ensureNamespace(namespace);
      const existing = nsCache[fnHash];
      if (existing) {
        if (existing.bodyHash && compiledFn.bodyHash && existing.bodyHash !== compiledFn.bodyHash) {
          console.warn(
            `Pure function ${namespace}::${fnHash} body hash mismatch. Existing: ${existing.bodyHash}, New: ${compiledFn.bodyHash}. Replacing with new version.`
          );
          nsCache[fnHash] = compiledFn;
          return compiledFn;
        }
        return existing;
      }
      nsCache[fnHash] = compiledFn;
      return compiledFn;
    },
    usePureFn(namespace, fnHash) {
      const nsCache = pureFnsCache$1[namespace];
      if (!nsCache) throw new Error(`Pure function namespace ${namespace} not found`);
      const compiled = nsCache[fnHash];
      if (!compiled) throw new Error(`Pure function with name ${fnHash} not found in namespace ${namespace}`);
      initPureFunction(compiled);
      return compiled.fn;
    },
    getPureFn(namespace, fnHash) {
      const nsCache = pureFnsCache$1[namespace];
      if (!nsCache) return;
      const compiled = nsCache[fnHash];
      if (!compiled) return;
      initPureFunction(compiled);
      return compiled.fn;
    },
    getCompiledPureFn(namespace, fnHash) {
      const nsCache = pureFnsCache$1[namespace];
      if (!nsCache) return;
      return nsCache[fnHash];
    },
    hasPureFn(namespace, fnHash) {
      const nsCache = pureFnsCache$1[namespace];
      if (!nsCache) return false;
      return !!nsCache[fnHash];
    },
    findCompiledPureFn(fnHash) {
      for (const namespace of Object.keys(pureFnsCache$1)) {
        const nsCache = pureFnsCache$1[namespace];
        if (nsCache && nsCache[fnHash]) return nsCache[fnHash];
      }
      return void 0;
    },
    setSerializableClass(cls) {
      const className = cls.name;
      const existingClass = serializableClassRegistry.get(className);
      if (existingClass && existingClass !== cls) throw new Error(`Deserializable Class ${className} already registered`);
      serializableClassRegistry.set(className, cls);
    },
    useSerializeClass(className) {
      const cls = serializableClassRegistry.get(className);
      if (!cls) throw new Error(`Serializable class with name ${className} not found, be sure to register it first`);
      return cls;
    },
    getSerializeClass(className) {
      return serializableClassRegistry.get(className);
    },
    setDeserializeFn(cls, deserializeFn) {
      const className = cls.name;
      const fn = deserializeFnsRegistry.get(className);
      if (fn && fn !== deserializeFn) throw new Error(`Deserialize function for class ${className} already exists`);
      if (fn) return;
      deserializeFnsRegistry.set(className, deserializeFn);
    },
    useDeserializeFn(className) {
      const fn = deserializeFnsRegistry.get(className);
      if (!fn) throw new Error(`Deserialize function for class ${className} not found, be sure to register it first`);
      return fn;
    },
    getDeserializeFn(className) {
      return deserializeFnsRegistry.get(className);
    }
  };
  function getJitUtils() {
    return jitUtils;
  }
  function addAOTCaches(aotFnsCache, aotPureCache) {
    restoreCaches(aotFnsCache, aotPureCache);
  }
  function restoreCaches(fnsCache, pureCache) {
    for (const key in fnsCache) {
      if (!(key in jitFnsCache$1)) {
        jitFnsCache$1[key] = { ...fnsCache[key] };
      }
    }
    for (const namespace in pureCache) {
      const nsCache = ensureNamespace(namespace);
      const sourceNsCache = pureCache[namespace];
      for (const key in sourceNsCache) {
        const existing = nsCache[key];
        const incoming = sourceNsCache[key];
        if (existing) {
          if (existing.bodyHash && incoming.bodyHash && existing.bodyHash !== incoming.bodyHash) {
            console.warn(
              `Pure function ${namespace}::${key} cache eviction: bodyHash mismatch (cached: ${existing.bodyHash}, server: ${incoming.bodyHash})`
            );
            nsCache[key] = { ...incoming };
          }
        } else {
          nsCache[key] = { ...incoming };
        }
      }
    }
    restoreCompiledJitFns(jitFnsCache$1, pureFnsCache$1, getJitUtils());
  }
  function getJitFnCaches() {
    return {
      jitFnsCache: jitFnsCache$1,
      pureFnsCache: pureFnsCache$1
    };
  }
  function ensureNamespace(namespace) {
    if (!pureFnsCache$1[namespace]) {
      pureFnsCache$1[namespace] = {};
    }
    return pureFnsCache$1[namespace];
  }
  function randomUUID_V7() {
    const uuid = crypto.randomUUID();
    const tHex = Date.now().toString(16).padStart(12, "0");
    return `${tHex.substring(0, 8)}-${tHex.substring(8)}-7${uuid.substring(15)}`;
  }
  function getENV(key) {
    if (typeof process !== "undefined" && process.env) {
      return process.env[key];
    }
    return void 0;
  }
  function fromBase64Url(encoded) {
    return atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  }
  let isTest = void 0;
  function isMionCompileMode() {
    const val = getENV("MION_COMPILE");
    return val === "onlyAOT" || val === "viteSSR";
  }
  function isMionAOTEmitMode() {
    const val = getENV("MION_COMPILE");
    return val === "onlyAOT" || val === "viteSSR" || val === "serve";
  }
  function isTestEnv() {
    if (isTest !== void 0) return isTest;
    isTest = getENV("VITEST") !== void 0 || getENV("NODE_ENV") === "test";
    return isTest;
  }
  function initPureFunction(compiled) {
    if (compiled.fn) return;
    compiled.fn = compiled.createPureFn(getJitUtils());
  }
  const __ΩReadonly = ["T", "Readonly", 'l+e#!e"!fRb!Pde"!gN#%w"y'];
  let options = { ...DEFAULT_CORE_OPTIONS };
  function setErrorOptions(opts2) {
    options = opts2;
  }
  setErrorOptions.__type = ["CoreRouterOptions", "opts", "setErrorOptions", 'P"w!2""/#'];
  class TypedError extends Error {
    /**
     * Unique error identifier,
     * Ideally this should be a symbol but we need to be able to serialize it so a namespaced prop is used instead
     */
    // eslint-disable-next-line @typescript-eslint/prefer-as-const
    "mion@isΣrrθr" = true;
    /** Error type, can be used as discriminator in union types*/
    type;
    // Note: message and name are NOT declared as properties here
    // They are inherited from Error class and assigned in constructor
    // This prevents them from being included in type reflection for JIT validation
    constructor({ message, originalError, type }) {
      const errorMessage = message || originalError?.message || "";
      super(errorMessage);
      this.type = type;
      Object.defineProperty(this, "message", {
        value: errorMessage,
        writable: true,
        enumerable: false,
        configurable: true
      });
      Object.defineProperty(this, "name", {
        value: "TypedError",
        writable: true,
        enumerable: false,
        configurable: true
      });
      if (originalError?.stack) {
        try {
          this.stack = originalError.stack;
        } catch {
          try {
            Object.defineProperty(this, "stack", {
              value: originalError.stack,
              writable: true,
              configurable: true
            });
          } catch {
          }
        }
      }
      Object.setPrototypeOf(this, TypedError.prototype);
    }
    static __type = ["ErrType", () => Error, true, "mion@isΣrrθr", function() {
      return true;
    }, "type", "TypedErrorParams", "param0", "constructor", "TypedError", `b!P7".#3$9>%e!!3&9P"w'2("0)5w*`];
  }
  class RpcError extends TypedError {
    // Note: name is NOT declared as a property here
    // It is inherited from Error class and assigned in constructor
    // This prevents it from being included in type reflection for JIT validation
    /**
     * id of the error, ideally each error should unique identifiable
     * * if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated
     * */
    id;
    /** the message that will be returned in the response */
    publicMessage;
    /** options data related to the error, ie validation data, must be json serializable */
    errorData;
    /** optional http status code */
    statusCode;
    constructor({ message, publicMessage, originalError, errorData, type, id, statusCode }) {
      const originalMessage = message || originalError?.message || publicMessage || "";
      super({
        message: originalMessage,
        originalError,
        type
      });
      const { autoGenerateErrorId } = options;
      this.id = id ?? (autoGenerateErrorId ? randomUUID_V7() : void 0);
      this.publicMessage = publicMessage || "";
      this.errorData = errorData;
      this.statusCode = statusCode;
      Object.defineProperty(this, "name", {
        value: "RpcError",
        writable: true,
        enumerable: false,
        configurable: true
      });
      Object.setPrototypeOf(this, RpcError.prototype);
    }
    static __type = ["ErrType", "ErrData", () => TypedError, "id", "publicMessage", () => __ΩReadonly, "errorData", "statusCode", "AnyErrorParams", "param0", "constructor", "RpcErrorParams", "RpcError", `b!"c"Pe"!7#P'&J3$89&3%9e!"o&"3'89'3(8P"w)2*"0+5e!!6""w,x"w-`];
  }
  function serializeBinaryBody$1(path, executionChain, body, isResponse, workflowRouteIds) {
    try {
      const serializer = createDataViewSerializer(path, workflowRouteIds);
      const itemsLengthIndex = serializer.index;
      serializer.index += 4;
      let itemsLength = 0;
      for (let i = 0; i < executionChain.length; i++) {
        const method = executionChain[i];
        const key = method.id;
        const value = body[key];
        if (serializeMethod(key, method, value, serializer, isResponse)) {
          itemsLength++;
        }
      }
      serializer.view.setUint32(itemsLengthIndex, itemsLength, true);
      serializer.markAsEnded();
      return { serializer, buffer: serializer.getBuffer() };
    } catch (err) {
      if (err instanceof RpcError) throw err;
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "binary-response-Serialization-error",
        publicMessage: `Failed to serialize body to binary: ${err?.message || "unknown error"}`,
        originalError: err
      });
    }
  }
  function serializeMethod(key, method, value, serializer, isResponse) {
    const toBinary = method.returnJitFns.toBinary;
    if (!toBinary?.fn)
      throw new RpcError({
        type: "missing-toBinary-jit-fn",
        publicMessage: `Missing toBinary JIT function for method ${method.id}`
      });
    if (toBinary.isNoop) return false;
    if (key === MION_ROUTES.thrownErrors) return false;
    if (!method.hasReturnData || typeof value === "undefined") return false;
    serializer.serString(key);
    toBinary.fn(value, serializer);
    return true;
  }
  const methodsCache = {};
  const jitFunctionsCache = /* @__PURE__ */ new Map();
  const headerJitFunctionsCache = /* @__PURE__ */ new Map();
  const routesCache = {
    /**
     * Get method metadata from the router cache by id.
     * @param id - The method id
     * @returns The method metadata or undefined if not found
     */
    getMetadata(id) {
      return methodsCache[id];
    },
    /**
     * Set method metadata in the router cache
     * @param id - The method id
     * @param methodData - The method metadata
     */
    setMetadata(id, methodData) {
      methodsCache[id] = methodData;
    },
    /**
     * Check if the router cache contains a method by id.
     * @param id - The method id
     * @returns True if the method exists in the cache
     */
    hasMetadata(id) {
      return id in methodsCache;
    },
    /**
     * Get the raw router cache object.
     * Use with caution - prefer using get/set/has methods.
     * @returns The router cache object
     */
    getCache() {
      return methodsCache;
    },
    /**
     * Get method metadata with JIT functions restored from the router cache by id.
     * This augments the MethodWithOptions with paramsJitFns and returnJitFns.
     * JIT functions are cached in the entry after first access for performance.
     * @param id - The method id
     * @returns The method metadata with JIT functions or undefined if not found
     */
    getMethodJitFns(id) {
      if (id in methodsCache) {
        const cached = methodsCache[id];
        if (cached.paramsJitFns && cached.returnJitFns) {
          return cached;
        }
      }
      const metadata = this.getMetadata(id);
      if (!metadata) return void 0;
      const paramsJitFns = getJitFunctionsFromHash(metadata.paramsJitHash);
      const returnJitFns = getJitFunctionsFromHash(metadata.returnJitHash);
      const headersParam = metadata.headersParam ? { ...metadata.headersParam, jitFns: getHeaderJitFunctionsFromHash(metadata.headersParam.jitHash) } : void 0;
      const headersReturn = metadata.headersReturn ? { ...metadata.headersReturn, jitFns: getHeaderJitFunctionsFromHash(metadata.headersReturn.jitHash) } : void 0;
      const result = {
        ...metadata,
        paramsJitFns,
        returnJitFns,
        headersParam,
        headersReturn
      };
      methodsCache[id] = result;
      return result;
    },
    /**
     * Get method metadata with JIT functions restored from the router cache by id.
     * @param id
     * @returns
     */
    useMethodJitFns(id) {
      const MethodWithOptsAndJitFns = this.getMethodJitFns(id);
      if (!MethodWithOptsAndJitFns) throw new Error(`Metadata for remote method ${id} not found`);
      return MethodWithOptsAndJitFns;
    },
    /**
     * Set method metadata with JIT functions in the router cache.
     * This stores the complete MethodWithOptsAndJitFns object directly.
     * @param id - The method id
     * @param MethodWithOptsAndJitFns - The method metadata with JIT functions
     */
    setMethodJitFns(id, MethodWithOptsAndJitFns) {
      methodsCache[id] = MethodWithOptsAndJitFns;
    }
  };
  function addRoutesToCache(newCache) {
    for (const key in newCache) {
      if (!(key in methodsCache)) {
        methodsCache[key] = { ...newCache[key] };
      }
    }
  }
  function getJitFnHashes(jitHash) {
    return {
      isType: `${JIT_FUNCTION_IDS.isType}_${jitHash}`,
      typeErrors: `${JIT_FUNCTION_IDS.typeErrors}_${jitHash}`,
      prepareForJson: `${JIT_FUNCTION_IDS.prepareForJson}_${jitHash}`,
      restoreFromJson: `${JIT_FUNCTION_IDS.restoreFromJson}_${jitHash}`,
      stringifyJson: `${JIT_FUNCTION_IDS.stringifyJson}_${jitHash}`,
      toBinary: `${JIT_FUNCTION_IDS.toBinary}_${jitHash}`,
      fromBinary: `${JIT_FUNCTION_IDS.fromBinary}_${jitHash}`
    };
  }
  function getJitFunctionsFromHash(jitHash) {
    if (jitHash === EMPTY_HASH) return noopJitFns;
    const cached = jitFunctionsCache.get(jitHash);
    if (cached) return cached;
    const hashes = getJitFnHashes(jitHash);
    const jUtils = getJitUtils();
    const jitFns = {
      isType: jUtils.getJIT(hashes.isType),
      typeErrors: jUtils.getJIT(hashes.typeErrors),
      prepareForJson: jUtils.getJIT(hashes.prepareForJson),
      restoreFromJson: jUtils.getJIT(hashes.restoreFromJson),
      stringifyJson: jUtils.getJIT(hashes.stringifyJson),
      toBinary: jUtils.getJIT(hashes.toBinary),
      fromBinary: jUtils.getJIT(hashes.fromBinary)
    };
    for (const key in jitFns) {
      if (!jitFns[key]) throw new Error(`Jit function ${key} not found for jitHash ${jitHash}`);
    }
    jitFunctionsCache.set(jitHash, jitFns);
    return jitFns;
  }
  function getHeaderJitFunctionsFromHash(jitHash) {
    const cached = headerJitFunctionsCache.get(jitHash);
    if (cached) return cached;
    const hashes = getJitFnHashes(jitHash);
    const jUtils = getJitUtils();
    const jitFns = {
      isType: jUtils.getJIT(hashes.isType),
      typeErrors: jUtils.getJIT(hashes.typeErrors)
    };
    headerJitFunctionsCache.set(jitHash, jitFns);
    return jitFns;
  }
  function getRouterItemId(itemPointer) {
    return itemPointer.join(ROUTER_ITEM_SEPARATOR_CHAR);
  }
  function getRoutePath(pathPointer, routerOptions2) {
    const pathId = getRouterItemId(pathPointer);
    const basePath = routerOptions2.basePath.startsWith(ROUTE_PATH_ROOT) ? routerOptions2.basePath : `${ROUTE_PATH_ROOT}${routerOptions2.basePath}`;
    const routePath = basePath.endsWith(PATH_SEPARATOR) ? `${basePath}${pathId}` : `${basePath}${PATH_SEPARATOR}${pathId}`;
    return routerOptions2.suffix ? routePath + routerOptions2.suffix : routePath;
  }
  function resetRoutesCache() {
    for (const k in methodsCache) delete methodsCache[k];
  }
  const noopJitFns = {
    isType: fakeJitFn(JIT_FUNCTION_IDS.isType),
    typeErrors: fakeJitFn(JIT_FUNCTION_IDS.typeErrors),
    prepareForJson: fakeJitFn(JIT_FUNCTION_IDS.prepareForJson),
    restoreFromJson: fakeJitFn(JIT_FUNCTION_IDS.restoreFromJson),
    stringifyJson: fakeJitFn(JIT_FUNCTION_IDS.stringifyJson),
    toBinary: fakeJitFn(JIT_FUNCTION_IDS.toBinary),
    fromBinary: fakeJitFn(JIT_FUNCTION_IDS.fromBinary)
  };
  function fakeJitFn(fnID) {
    return {
      typeName: "mionNoopJit",
      fnID,
      jitFnHash: EMPTY_HASH,
      args: { vλl: "v" },
      defaultParamValues: { vλl: "v" },
      isNoop: true,
      code: "",
      jitDependencies: [],
      pureFnDependencies: [],
      createJitFn: () => {
        throw new Error("isNoop JIT functions should not be called, this is a function when jit is never used");
      },
      fn: () => {
        throw new Error("isNoop JIT functions should not be called, this is a function when jit is never used");
      }
    };
  }
  function getNoopJitFns() {
    return noopJitFns;
  }
  function deserializeBinaryBody(path, buffer, isResponse) {
    try {
      const deserializer = createDataViewDeserializer(path, buffer);
      const body = {};
      const itemsLength = deserializer.view.getUint32(0, true);
      deserializer.index += 4;
      for (let i = 0; i < itemsLength; i++) {
        const key = deserializer.desString();
        const method = routesCache.getMethodJitFns(key);
        if (!method) {
          throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: isResponse ? "binary-response-method-Deserialization-error" : "binary-request-method-Deserialization-error",
            publicMessage: `Unknown method key in binary body: ${key}`,
            errorData: { methodId: key }
          });
        }
        const value = deserializeMethod(key, method, deserializer, isResponse);
        body[key] = value;
      }
      deserializer.markAsEnded();
      return { deserializer, body };
    } catch (err) {
      if (err instanceof RpcError) throw err;
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "binary-request-Deserialization-error",
        publicMessage: `Failed to deserialize body from binary: ${err?.message || "unknown error"}`,
        originalError: err
      });
    }
  }
  function deserializeMethod(key, method, deserializer, isResponse) {
    const jitFns = method.paramsJitFns;
    try {
      return jitFns.fromBinary.fn(void 0, deserializer);
    } catch (e) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "binary-request-method-Deserialization-error",
        publicMessage: `Failed to deserialize method ${key} from binary`,
        originalError: e,
        errorData: { methodId: key }
      });
    }
  }
  class HeadersSubset {
    headers;
    constructor(headers) {
      this.headers = headers;
    }
    static __type = ["Required", "Optional", "headers", "constructor", "HeadersSubset", `l+&R&R&R&Rb!!c"PPde#!N#!Pde#"N%"K3#9PPPde$!N'!Pde$"N)"K2#"0$5w%`];
  }
  const PURE_SERVER_FN_NAMESPACE = "pureServerFn";
  const __ΩRouterEntry = [() => __ΩRoutes, () => __ΩMiddleFnDef, () => __ΩRouteDef, () => __ΩRawMiddleFnDef, () => __ΩHeadersMiddleFnDef, "RouterEntry", 'Pn!n"n#n$n%Jw&y'];
  const __ΩRoutes = [() => __ΩRouterEntry, "Routes", 'P&n!LMw"y'];
  const __ΩRouterOptions = ["Req", "ContextData", () => __ΩCoreRouterOptions, "basePath", "suffix", "request", "path", "", "pathTransform", () => __ΩContextDataFactory, "contextDataFactory", () => __ΩSerializerMode, "serializer", "RunTypeOptions", "runTypeOptions", "getPublicRoutesData", "autoGenerateErrorId", "skipClientRoutes", "aot", "maxContextPoolSize", "maxRoutesFlowsCacheSize", "RouterOptions", `"c!"c"Pn#&4$&4%Pe#!2&&2'&/(4)8e""o*"4+8n,4-"w.4/)40)41)42)43'44'45Mw6y`];
  function isMiddleFnDef(entry) {
    return entry.type === HandlerType$1.middleFn;
  }
  isMiddleFnDef.__type = [() => __ΩRouterEntry, "entry", "isMiddleFnDef", 'Pn!2"!/#'];
  function isRawMiddleFnDef(entry) {
    return entry.type === HandlerType$1.rawMiddleFn;
  }
  isRawMiddleFnDef.__type = [() => __ΩRouterEntry, "entry", "isRawMiddleFnDef", 'Pn!2"!/#'];
  function isHeadersMiddleFnDef(entry) {
    return entry.type === HandlerType$1.headersMiddleFn;
  }
  isHeadersMiddleFnDef.__type = [() => __ΩRouterEntry, "entry", "isHeadersMiddleFnDef", 'Pn!2"!/#'];
  function isAnyMiddleFnDef(entry) {
    return isMiddleFnDef(entry) || isRawMiddleFnDef(entry) || isHeadersMiddleFnDef(entry);
  }
  isAnyMiddleFnDef.__type = [() => __ΩRouterEntry, "entry", "isAnyMiddleFnDef", 'Pn!2"!/#'];
  function isRoute(entry) {
    return entry.type === HandlerType$1.route;
  }
  isRoute.__type = [() => __ΩRouterEntry, "entry", "isRoute", 'Pn!2"!/#'];
  function isRoutes(entry) {
    return typeof entry === "object";
  }
  isRoutes.__type = [() => __ΩRouterEntry, () => __ΩRoutes, "entry", "isRoutes", 'PPn!n"J2#!/$'];
  function isExecutable(entry) {
    return typeof entry?.id === "string" && (entry.routes === "undefined" || typeof entry.handler === "function");
  }
  isExecutable.__type = [() => __ΩRemoteMethod, "pathPointer", "entry", "isExecutable", 'PPn!P&F4"MJ2#!/$'];
  function isPublicExecutable(entry) {
    return entry.hasReturnData || entry.type === HandlerType$1.route || !!entry.paramNames?.length || !!entry.headersParam?.headerNames?.length;
  }
  isPublicExecutable.__type = [() => __ΩRemoteMethod, "entry", "isPublicExecutable", 'Pn!2"!/#'];
  const __ΩMayReturnError = ["RpcError", "MayReturnError", 'P$"w!P"w!$J`Jw"y'];
  const __ΩHandler = ["Context", "Params", "Ret", "context", "parameters", "", "Handler", '"c!"Fc""c#Pe"!2$e""@2%Pe##e##`J/&w\'y'];
  const IS_TEST_ENV = getENV("JEST_WORKER_ID") !== void 0 || getENV("NODE_ENV") === "test";
  const ROUTE_DEFAULT_PARAMS = ["context"];
  const HEADER_HOOK_DEFAULT_PARAMS = ["context", "headers"];
  const DEFAULT_ROUTE_OPTIONS = {
    /** Prefix for all routes, i.e: api/v1. Path separator is added between the prefix and the route */
    basePath: "",
    /** Suffix for all routes, i.e: .json. No path separator is added between the route and the suffix */
    suffix: "",
    /** Function that transforms the path before finding a route */
    pathTransform: void 0,
    /** Default serializer mode - json as default native serializer, and minimum overhead to transform just required fields */
    serializer: "json",
    /** Default run type compiling options for routes and middleFns, can't be configured by the user as would break functionality  */
    runTypeOptions: {},
    /** set to true to generate router spec for clients.  */
    getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === "true",
    /** Set true to automatically generate and id for every error.  */
    autoGenerateErrorId: false,
    /** client routes are initialized by default */
    skipClientRoutes: IS_TEST_ENV,
    /** AOT mode is disabled by default */
    aot: false,
    /** Context pooling size == 100 by default */
    maxContextPoolSize: 100,
    /** RoutesFlow cache size == 100 by default */
    maxRoutesFlowsCacheSize: 100
  };
  const MAX_ROUTE_NESTING = 10;
  const WORKFLOW_KEY = `mion-routes-flow`;
  const WORKFLOW_PATH = `${PATH_SEPARATOR}${WORKFLOW_KEY}`;
  let persistedMethods = {};
  function addToPersistedMethods(id, method) {
    if (!shouldCompile() || !!persistedMethods[id]) return;
    persistedMethods[id] = method;
  }
  function getPersistedMethod(id, handler) {
    const method = persistedMethods?.[id];
    if (!method) return;
    return restorePersistedMethod(method, handler);
  }
  function getPersistedMethodMetadata(id) {
    const method = persistedMethods[id];
    return method;
  }
  function getPersistedMethods() {
    return persistedMethods;
  }
  function resetPersistedMethods() {
    persistedMethods = {};
  }
  function restorePersistedMethod(method, handler) {
    const restored = method;
    if (restored.paramsJitFns && restored.returnJitFns && restored.paramNames && !!restored.handler)
      return method;
    restored.handler = handler;
    restored.paramsJitFns = getJitFunctionsFromHash(method.paramsJitHash);
    restored.returnJitFns = getJitFunctionsFromHash(method.returnJitHash);
    if (IS_TEST_ENV) restored.isRestored = true;
    return restored;
  }
  function shouldCompile() {
    return isMionAOTEmitMode();
  }
  function loadCompiledMethods(compiledMethods) {
    for (const [key, value] of Object.entries(compiledMethods)) {
      if (!(key in persistedMethods)) {
        persistedMethods[key] = value;
      }
    }
  }
  const __ΩOmit = ["T", "K", () => __ΩPick, () => __ΩExclude, "Omit", 'b!b"e!!e!!ge!"o$#o##w%y'];
  const __ΩPick = ["T", "K", "Pick", 'l+e#!e"!fRb!b"Pde""N#!w#y'];
  const __ΩExclude = ["T", "U", "Exclude", 'l6!Re$!RPe#!e$"qk#%QRb!b"Pde"!p)w#y'];
  function __assignType$5(fn, args) {
    fn.__type = args;
    return fn;
  }
  const __ΩMethodReflect = [() => __ΩOmit, "MethodWithJitFns", "id", "type", "nestLevel", "pointer", "options", "MethodReflect", `"w"P.#.$.%.&.'Jo!#w(y`];
  class AOTCacheError extends Error {
    constructor(routeId, type = "route") {
      const typeLabel = type === "rawMiddleFn" ? "Raw middleFn" : type === "middleFn" ? "MiddleFn" : "Route/middleFn";
      super(`${typeLabel} "${routeId}" not found in AOT cache.
Regenerate AOT caches using 'mion-build-aot' command.`);
      this.name = "AOTCacheError";
    }
    static __type = [() => Error, "routeId", "route", "middleFn", "rawMiddleFn", "type", () => "route", "constructor", "AOTCacheError", `P7!P&2"P.#.$.%J2&>'"0(5w)`];
  }
  const __ΩRunTypesModule = ["RunTypesModule", "!w!y"];
  const __ΩRunTypesFunctions = [() => __ΩRunTypesModule, "JitFunctions", "JitFunctions", () => __ΩRunTypesModule, "reflectFunction", "reflectFunction", () => __ΩRunTypesModule, "isUnionRunType", "isUnionRunType", () => __ΩRunTypesModule, "isClassRunType", "isClassRunType", () => __ΩRunTypesModule, "isLiteralRunType", "isLiteralRunType", () => __ΩRunTypesModule, "isNeverRunType", "isNeverRunType", "RunTypesFunctions", `Pn!."f4#n$.%f4&n'.(f4)n*.+f4,n-..f4/n0.1f42Mw3y`];
  let runTypesModule = null;
  let runTypesLoadPromise = null;
  async function loadRunTypesModule() {
    if (runTypesModule)
      return runTypesModule;
    if (runTypesLoadPromise)
      return runTypesLoadPromise;
    runTypesLoadPromise = Promise.resolve().then(() => runTypes$1).then(__assignType$5((module) => {
      runTypesModule = {
        JitFunctions: module.JitFunctions,
        reflectFunction: module.reflectFunction,
        isUnionRunType: module.isUnionRunType,
        isClassRunType: module.isClassRunType,
        isLiteralRunType: module.isLiteralRunType,
        isNeverRunType: module.isNeverRunType
      };
      return runTypesModule;
    }, ["module", "", 'P"2!"/"']));
    return runTypesLoadPromise;
  }
  loadRunTypesModule.__type = [() => __ΩRunTypesFunctions, "loadRunTypesModule", 'Pn!`/"'];
  const rawMiddleFnReflectionCache = (Map.Ω = [["&"], [() => __ΩMethodReflect, "n!"]], /* @__PURE__ */ new Map());
  function createRawMiddleFnReflection(isAsync, hasReturnData = false, paramNames = []) {
    const cacheKey = `${isAsync}_${hasReturnData}_${paramNames.join(",")}`;
    const cached = rawMiddleFnReflectionCache.get(cacheKey);
    if (cached)
      return cached;
    const reflection = {
      paramNames,
      paramsJitFns: getNoopJitFns(),
      returnJitFns: getNoopJitFns(),
      paramsJitHash: EMPTY_HASH,
      returnJitHash: EMPTY_HASH,
      hasReturnData,
      isAsync
    };
    rawMiddleFnReflectionCache.set(cacheKey, reflection);
    return reflection;
  }
  createRawMiddleFnReflection.__type = ["isAsync", "hasReturnData", () => false, "paramNames", () => [], () => __ΩMethodReflect, "createRawMiddleFnReflection", `P)2!)2">#&F2$>%n&/'`];
  const __ΩCachedMethodMetadata = ["MethodMetadata", () => __ΩMethodReflect, "_cachedReflection", "CachedMethodMetadata", 'P"w!Pn"4#8MKw$y'];
  function extractReflectionFromCached(cached) {
    if (cached._cachedReflection)
      return cached._cachedReflection;
    const reflectionItems = {
      paramNames: cached.paramNames || [],
      paramsJitFns: getJitFunctionsFromHash(cached.paramsJitHash),
      returnJitFns: getJitFunctionsFromHash(cached.returnJitHash),
      paramsJitHash: cached.paramsJitHash,
      returnJitHash: cached.returnJitHash,
      hasReturnData: cached.hasReturnData,
      isAsync: cached.isAsync
    };
    if (cached.headersParam) {
      reflectionItems.headersParam = {
        headerNames: cached.headersParam.headerNames,
        jitFns: getJitFunctionsFromHash(cached.headersParam.jitHash),
        jitHash: cached.headersParam.jitHash
      };
    }
    if (cached.headersReturn) {
      reflectionItems.headersReturn = {
        headerNames: cached.headersReturn.headerNames,
        jitFns: getJitFunctionsFromHash(cached.headersReturn.jitHash),
        jitHash: cached.headersReturn.jitHash
      };
    }
    cached._cachedReflection = reflectionItems;
    return reflectionItems;
  }
  extractReflectionFromCached.__type = [() => __ΩCachedMethodMetadata, "cached", () => __ΩMethodReflect, "extractReflectionFromCached", 'Pn!2"n#/$'];
  async function getHandlerReflection(handler, routeId, routerOptions2, isHeadersMiddleFn = false) {
    const cached = getPersistedMethodMetadata(routeId);
    if (cached)
      return extractReflectionFromCached(cached);
    if (routerOptions2.aot)
      throw new AOTCacheError(routeId, isHeadersMiddleFn ? "middleFn" : "route");
    const rt = await loadRunTypesModule();
    return generateHandlerReflection(handler, routeId, routerOptions2, isHeadersMiddleFn, rt);
  }
  getHandlerReflection.__type = [() => __ΩHandler, "handler", "routeId", () => __ΩRouterOptions, "routerOptions", "isHeadersMiddleFn", () => false, () => __ΩMethodReflect, "getHandlerReflection", "Pn!2\"&2#n$2%)2&>'n(`/)"];
  async function getRawMethodReflection(handler, routeId, routerOptions2) {
    const cached = getPersistedMethodMetadata(routeId);
    if (cached)
      return createRawMiddleFnReflection(cached.isAsync, cached.hasReturnData, cached.paramNames || []);
    if (routerOptions2.aot)
      return createRawMiddleFnReflection(true);
    const rt = await loadRunTypesModule();
    return generateRawMethodReflection(handler, routeId, rt);
  }
  getRawMethodReflection.__type = [() => __ΩHandler, "handler", "routeId", () => __ΩRouterOptions, "routerOptions", () => __ΩMethodReflect, "getRawMethodReflection", "Pn!2\"&2#n$2%n&`/'"];
  function generateHandlerReflection(handler, routeId, routerOptions2, isHeadersMiddleFn, rt) {
    const reflectionItems = {};
    let handlerRunType;
    const runTypeOptions = routerOptions2?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
    try {
      handlerRunType = rt.reflectFunction(handler);
    } catch (error) {
      throw new Error(`Can not get RunType of handler for route/middleFn "${routeId}." Error: ${error?.message}`);
    }
    const paramsSlice = isHeadersMiddleFn ? { start: HEADER_HOOK_DEFAULT_PARAMS.length } : { start: ROUTE_DEFAULT_PARAMS.length };
    const paramsOpts = { ...runTypeOptions, paramsSlice };
    try {
      reflectionItems.paramNames = handlerRunType.getParameterNames(paramsOpts);
      if (reflectionItems.paramNames.length === 0) {
        reflectionItems.paramsJitHash = EMPTY_HASH;
        reflectionItems.paramsJitFns = getNoopJitFns();
      } else {
        reflectionItems.paramsJitFns = getFunctionJitFns(handler, paramsOpts, rt, false);
        reflectionItems.paramsJitHash = handlerRunType.getParameters().getJitHash(paramsOpts);
      }
    } catch (error) {
      throw new Error(`Can not compile Jit Functions for Parameters of route/middleFn "${routeId}." Error: ${error?.message}`);
    }
    if (isHeadersMiddleFn) {
      const headersRunType = getParamsHeadersRunType(handlerRunType, routeId, routerOptions2, rt);
      const headerNames = getHeaderNames(headersRunType, routeId, rt);
      try {
        const opts2 = {
          ...runTypeOptions,
          paramsSlice: void 0
        };
        const jitFns = getTypeJitFunctions(headersRunType, opts2, rt);
        const jitHash = headersRunType.getJitHash(opts2);
        reflectionItems.headersParam = { headerNames, jitFns, jitHash };
      } catch (error) {
        throw new Error(`Can not compile Jit Functions for Headers of Headers MiddleFn "${routeId}." Error: ${error?.message}`);
      }
    }
    const returnHeadersRunType = getReturnHeadersRunType(handlerRunType, rt);
    if (returnHeadersRunType) {
      const opts2 = {};
      const headerNames = getHeaderNames(returnHeadersRunType, routeId, rt);
      const jitFns = getFunctionJitFns(handler, opts2, rt, true);
      const jitHash = returnHeadersRunType.getJitHash(opts2);
      reflectionItems.headersReturn = { headerNames, jitFns, jitHash };
    }
    const returnOpts = runTypeOptions;
    reflectionItems.hasReturnData = handlerRunType.hasReturnData();
    try {
      if (!reflectionItems.hasReturnData) {
        reflectionItems.returnJitFns = getNoopJitFns();
        reflectionItems.returnJitHash = EMPTY_HASH;
      } else {
        reflectionItems.returnJitFns = getFunctionJitFns(handler, returnOpts, rt, true);
        reflectionItems.returnJitHash = handlerRunType.getReturnType().getJitHash(returnOpts);
      }
    } catch (error) {
      throw new Error(`Can not get Jit Functions for Return of route/middleFn "${routeId}." Error: ${error?.message}`);
    }
    reflectionItems.isAsync = handlerRunType.isAsync();
    return reflectionItems;
  }
  generateHandlerReflection.__type = [() => __ΩHandler, "handler", "routeId", () => __ΩRouterOptions, "routerOptions", "isHeadersMiddleFn", () => __ΩRunTypesFunctions, "rt", () => __ΩMethodReflect, "generateHandlerReflection", `Pn!2"&2#n$2%)2&n'2(n)/*`];
  function generateRawMethodReflection(handler, routeId, rt) {
    let handlerRunType;
    try {
      handlerRunType = rt.reflectFunction(handler);
    } catch (error) {
      throw new Error(`Can not get RunType of handler for route/middleFn "${routeId}." Error: ${error?.message}`);
    }
    const isAsync = handlerRunType?.isAsync() || true;
    return createRawMiddleFnReflection(isAsync);
  }
  generateRawMethodReflection.__type = [() => __ΩHandler, "handler", "routeId", () => __ΩRunTypesFunctions, "rt", () => __ΩMethodReflect, "generateRawMethodReflection", `Pn!2"&2#n$2%n&/'`];
  function getParamsHeadersRunType(handlerRunType, routeId, routerOptions2, rt) {
    const paramRunTypes = handlerRunType.getParameters().getParamRunTypes(getFakeCompiler(routerOptions2));
    const headersSubset = paramRunTypes[1]?.getMemberType?.();
    if (!isHeaderSubSetRunType(headersSubset, rt)) {
      throw new Error(`Headers MiddleFn '${routeId}' second parameter must be a HeadersSubset.`);
    }
    return headersSubset;
  }
  getParamsHeadersRunType.__type = ["FunctionRunType", "handlerRunType", "routeId", () => __ΩRouterOptions, "routerOptions", () => __ΩRunTypesFunctions, "rt", "BaseRunType", "getParamsHeadersRunType", `P"w!2"&2#n$2%n&2'"w(/)`];
  function getReturnHeadersRunType(handlerRunType, rt) {
    const returnRunType = handlerRunType.getReturnType();
    if (rt.isUnionRunType(returnRunType)) {
      const headersSubset = returnRunType.getChildRunTypes().find(__assignType$5((child) => isHeaderSubSetRunType(child, rt), ["child", "", 'P"2!"/"']));
      if (!headersSubset)
        return void 0;
      return headersSubset;
    }
    if (!isHeaderSubSetRunType(returnRunType, rt))
      return void 0;
    return returnRunType;
  }
  getReturnHeadersRunType.__type = ["FunctionRunType", "handlerRunType", () => __ΩRunTypesFunctions, "rt", "BaseRunType", "getReturnHeadersRunType", 'P"w!2"n#2$P"w%-J/&'];
  function isHeaderSubSetRunType(runType, rt) {
    if (!runType)
      return false;
    return rt.isClassRunType(runType, HeadersSubset);
  }
  isHeaderSubSetRunType.__type = ["BaseRunType", "runType", () => __ΩRunTypesFunctions, "rt", "isHeaderSubSetRunType", 'PP"w!-J2"n#2$!/%'];
  function getHeaderNames(runType, routeId, rt) {
    const typeArguments = runType.src.typeArguments;
    if (!typeArguments || typeArguments.length === 0) {
      throw new Error(`HeadersSubset must have type arguments in route/middleFn ${routeId}`);
    }
    const headerNames = [];
    const requiredArg = typeArguments[0];
    if (requiredArg) {
      const requiredNames = extractLiteralStringsFromType(requiredArg._rt, rt);
      headerNames.push(...requiredNames);
    }
    if (typeArguments.length > 1) {
      const optionalArg = typeArguments[1];
      if (optionalArg) {
        const optionalNames = extractLiteralStringsFromType(optionalArg._rt, rt);
        headerNames.push(...optionalNames);
      }
    }
    if (headerNames.length === 0)
      throw new Error(`Header names array cannot be empty in route/middleFn ${routeId}`);
    return headerNames;
  }
  getHeaderNames.__type = ["BaseRunType", "runType", "routeId", () => __ΩRunTypesFunctions, "rt", "getHeaderNames", 'P"w!2"&2#n$2%&F/&'];
  function extractLiteralStringsFromTypeRecursive(runType, rt) {
    if (rt.isLiteralRunType(runType)) {
      const literal = runType.getLiteralValue();
      if (typeof literal === "string") {
        return [literal];
      }
      return [];
    }
    if (rt.isUnionRunType(runType)) {
      const children = runType.getChildRunTypes();
      const literals = [];
      for (const child of children) {
        const childLiterals = extractLiteralStringsFromTypeRecursive(child, rt);
        literals.push(...childLiterals);
      }
      return literals;
    }
    return [];
  }
  extractLiteralStringsFromTypeRecursive.__type = ["BaseRunType", "runType", () => __ΩRunTypesFunctions, "rt", "extractLiteralStringsFromTypeRecursive", 'P"w!2"n#2$&F/%'];
  function extractLiteralStringsFromType(runType, rt) {
    if (rt.isNeverRunType(runType))
      return [];
    return extractLiteralStringsFromTypeRecursive(runType, rt);
  }
  extractLiteralStringsFromType.__type = ["BaseRunType", "runType", () => __ΩRunTypesFunctions, "rt", "extractLiteralStringsFromType", 'P"w!2"n#2$&F/%'];
  function getFakeCompiler(routerOptions2) {
    return { opts: routerOptions2 };
  }
  getFakeCompiler.__type = [() => __ΩRouterOptions, "routerOptions", "JitFnCompiler", "getFakeCompiler", 'Pn!2""w#/$'];
  function getTypeJitFunctions(runType, opts2, rtModule) {
    const jitFns = {
      isType: runType.createJitCompiledFunction(rtModule.JitFunctions.isType.id, void 0, opts2),
      typeErrors: runType.createJitCompiledFunction(rtModule.JitFunctions.typeErrors.id, void 0, opts2),
      prepareForJson: runType.createJitCompiledFunction(rtModule.JitFunctions.prepareForJson.id, void 0, opts2),
      restoreFromJson: runType.createJitCompiledFunction(rtModule.JitFunctions.restoreFromJson.id, void 0, opts2),
      stringifyJson: runType.createJitCompiledFunction(rtModule.JitFunctions.stringifyJson.id, void 0, opts2),
      toBinary: runType.createJitCompiledFunction(rtModule.JitFunctions.toBinary.id, void 0, opts2),
      fromBinary: runType.createJitCompiledFunction(rtModule.JitFunctions.fromBinary.id, void 0, opts2)
    };
    return jitFns;
  }
  getTypeJitFunctions.__type = ["BaseRunType", "runType", "RunTypeOptions", "opts", () => __ΩRunTypesFunctions, "rtModule", "JitCompiledFunctions", "getTypeJitFunctions", `P"w!2"P"w#-J2$n%2&"w'/(`];
  const functionRunTypeCache = (WeakMap.Ω = [["AnyFn", '"w!'], ["FunctionRunType", '"w!']], /* @__PURE__ */ new WeakMap());
  function getFunctionJitFns(fn, opts2, rtModule, isReturn) {
    let runType = functionRunTypeCache.get(fn);
    if (!runType) {
      runType = rtModule.reflectFunction(fn);
      functionRunTypeCache.set(fn, runType);
    }
    const createFn = isReturn ? runType.createJitCompiledReturnFunction.bind(runType) : runType.createJitCompiledParamsFunction.bind(runType);
    const jitFunctions = {
      isType: createFn(rtModule.JitFunctions.isType, opts2),
      typeErrors: createFn(rtModule.JitFunctions.typeErrors, opts2),
      prepareForJson: createFn(rtModule.JitFunctions.prepareForJson, opts2),
      restoreFromJson: createFn(rtModule.JitFunctions.restoreFromJson, opts2),
      stringifyJson: createFn(rtModule.JitFunctions.stringifyJson, opts2),
      toBinary: createFn(rtModule.JitFunctions.toBinary, opts2),
      fromBinary: createFn(rtModule.JitFunctions.fromBinary, opts2)
    };
    return jitFunctions;
  }
  getFunctionJitFns.__type = ["fn", "RunTypeOptions", "opts", () => __ΩRunTypesFunctions, "rtModule", "isReturn", "JitCompiledFunctions", "getFunctionJitFns", `P"2!P"w"-J2#n$2%)2&"w'/(`];
  function route(handler, opts2) {
    return {
      type: HandlerType$1.route,
      handler,
      options: opts2
    };
  }
  function rawMiddleFn(handler, opts2) {
    return {
      type: HandlerType$1.rawMiddleFn,
      handler,
      options: opts2
    };
  }
  function getRouterFatalErrorResponse(returnErr, respHeaders) {
    const body = {
      "@thrownErrors": { [MION_ROUTES.platformError]: returnErr }
    };
    respHeaders.set("content-type", "application/json; charset=utf-8");
    const response = {
      statusCode: returnErr.statusCode || StatusCodes.SERVER_ERROR,
      // Global errors are always unexpected
      hasErrors: true,
      headers: respHeaders,
      body,
      rawBody: JSON.stringify(body),
      serializer: SerializerModes.json
      // global errors are always json
    };
    return response;
  }
  function onExecutableError(context, executable, err) {
    const response = context.response;
    const path = executable.id;
    const rpcError = err instanceof RpcError ? err : new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      publicMessage: `Unknown error in handler "${path}" of route ExecutionChain.`,
      originalError: err,
      type: "unknown-error"
    });
    if (!response.hasErrors) response.headers.set("x-rpc-error", rpcError.type);
    response.statusCode = rpcError.statusCode ?? StatusCodes.UNEXPECTED_ERROR;
    response.hasErrors = true;
    const thrownErrors = context.request.thrownErrors || {};
    thrownErrors[path] = rpcError;
    context.request.thrownErrors = thrownErrors;
  }
  function deserializeRequestBody(context) {
    if (!context.request.rawBody)
      return;
    let parsedBody;
    switch (context.request.bodyType) {
      case SerializerModes.stringifyJson:
        try {
          parsedBody = JSON.parse(context.request.rawBody);
        } catch (err) {
          throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: "parsing-json-request-error",
            publicMessage: `Invalid json request body: ${err?.message || "unknown parsing error."}`
          });
        }
        break;
      case SerializerModes.binary: {
        const rawBody = context.request.rawBody;
        const { body } = deserializeBinaryBody(context.path, rawBody, false);
        parsedBody = body;
        break;
      }
      case SerializerModes.json:
        parsedBody = context.request.rawBody;
        break;
      default:
        throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
    if (parsedBody) {
      if (Array.isArray(parsedBody)) {
        parsedBody = { [getRouteExecutableFromPath(context.path).id]: parsedBody };
      }
      if (typeof parsedBody !== "object")
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "invalid-request-body",
          publicMessage: "Wrong request body. Expecting a body containing the route name and parameters."
        });
      context.request.body = parsedBody;
    }
  }
  deserializeRequestBody.__type = [() => __ΩCallContext, "context", () => __ΩMayReturnError, "deserializeRequestBody", 'Pn!2"n#/$'];
  function serializeResponseBody(context, opts2) {
    const response = context.response;
    const respBody = response.body;
    const bodyType = context.response.serializer;
    const thrownErrors = context.request.thrownErrors;
    if (thrownErrors)
      response.body["@thrownErrors"] = thrownErrors;
    switch (bodyType) {
      case SerializerModes.stringifyJson: {
        response.headers.set("content-type", "application/json; charset=utf-8");
        const body = stringifyBody(context, context.executionChain.methods, respBody);
        response.rawBody = body;
        break;
      }
      case SerializerModes.json: {
        response.headers.set("content-type", "application/json; charset=utf-8");
        prepareBodyForJson(context, context.executionChain.methods, respBody);
        break;
      }
      case SerializerModes.binary: {
        response.headers.set("content-type", "application/octet-stream");
        serializeBinaryBody(context, context.executionChain.methods, respBody);
        break;
      }
      default:
        throw new Error(`Invalid body type ${context.request.bodyType}`);
    }
  }
  serializeResponseBody.__type = [() => __ΩCallContext, "context", () => __ΩRouterOptions, "opts", () => __ΩMayReturnError, "serializeResponseBody", 'Pn!2"n#2$n%/&'];
  function serializeBinaryBody(context, executionChain, respBody) {
    const response = context.response;
    const { serializer, buffer } = serializeBinaryBody$1(context.path, executionChain, respBody, true, context.routesFlowRouteIds);
    response.binSerializer = serializer;
    response.rawBody = new Uint8Array(buffer);
  }
  serializeBinaryBody.__type = [() => __ΩCallContext, "context", () => __ΩRemoteMethod, "executionChain", () => __ΩResponseBody, "respBody", "serializeBinaryBody", `Pn!2"n#F2$n%2&$/'`];
  function stringifyBody(context, executionChain, respBody) {
    const props = [];
    for (let i = 0; i < executionChain.length; i++) {
      const method = executionChain[i];
      const returnValue = respBody[method.id];
      if (!method.hasReturnData || typeof returnValue === "undefined")
        continue;
      try {
        const jsonValue = stringifyHandlerReturnValue(method, returnValue);
        if (!jsonValue)
          continue;
        props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
      } catch (e) {
        onStringifyExecutableError(context, method, e);
      }
    }
    const thrownErrors = respBody["@thrownErrors"];
    if (thrownErrors) {
      const method = getRouteExecutable(MION_ROUTES.thrownErrors);
      try {
        const jsonValue = stringifyHandlerReturnValue(method, thrownErrors);
        if (jsonValue)
          props.push(`${JSON.stringify(method.id)}:${jsonValue}`);
      } catch (e) {
        onStringifyExecutableError(context, method, e);
      }
    }
    return `{${props.join(",")}}`;
  }
  stringifyBody.__type = [() => __ΩCallContext, "context", () => __ΩRemoteMethod, "executionChain", () => __ΩResponseBody, "respBody", "stringifyBody", `Pn!2"n#F2$n%2&&/'`];
  function onStringifyExecutableError(context, method, e) {
    const err = new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: "json-stringify-response-error",
      publicMessage: `Failed to stringify return value for handler ${method.id}, expected response type: ${method.returnJitFns.stringifyJson.typeName}`,
      originalError: e,
      errorData: { methodId: method.id }
    });
    onExecutableError(context, method, err);
  }
  onStringifyExecutableError.__type = [() => __ΩCallContext, "context", () => __ΩRemoteMethod, "method", "e", "onStringifyExecutableError", 'Pn!2"n#2$"2%"/&'];
  function stringifyHandlerReturnValue(method, returnValue) {
    if (!method.hasReturnData)
      return "";
    if (method.returnJitFns.prepareForJson.isNoop)
      JSON.stringify(returnValue);
    return method.returnJitFns.stringifyJson.fn(returnValue);
  }
  stringifyHandlerReturnValue.__type = [() => __ΩRemoteMethod, "method", "returnValue", "stringifyHandlerReturnValue", 'Pn!2""2#&/$'];
  function prepareBodyForJson(context, executionChain, respBody) {
    for (let i = 0; i < executionChain.length; i++) {
      const method = executionChain[i];
      const returnValue = respBody[method.id];
      if (!method.hasReturnData || typeof returnValue === "undefined")
        continue;
      try {
        const preparedValue = prepareHandlerReturnValue(method, returnValue);
        if (preparedValue !== void 0)
          respBody[method.id] = preparedValue;
      } catch (e) {
        onPrepareForJsonExecutableError(context, method, e);
      }
    }
    const thrownErrors = respBody["@thrownErrors"];
    if (thrownErrors) {
      const method = getRouteExecutable(MION_ROUTES.thrownErrors);
      try {
        const preparedValue = prepareHandlerReturnValue(method, thrownErrors);
        if (preparedValue !== void 0)
          respBody[method.id] = preparedValue;
      } catch (e) {
        onPrepareForJsonExecutableError(context, method, e);
      }
    }
  }
  prepareBodyForJson.__type = [() => __ΩCallContext, "context", () => __ΩRemoteMethod, "executionChain", () => __ΩResponseBody, "respBody", "prepareBodyForJson", `Pn!2"n#F2$n%2&$/'`];
  function onPrepareForJsonExecutableError(context, method, e) {
    const err = new RpcError({
      statusCode: StatusCodes.UNEXPECTED_ERROR,
      type: "prepare-for-json-response-error",
      publicMessage: `Failed to prepare return value for JSON for handler ${method.id}, expected response type: ${method.returnJitFns.prepareForJson.typeName}`,
      originalError: e,
      errorData: { methodId: method.id }
    });
    onExecutableError(context, method, err);
  }
  onPrepareForJsonExecutableError.__type = [() => __ΩCallContext, "context", () => __ΩRemoteMethod, "method", "e", "onPrepareForJsonExecutableError", 'Pn!2"n#2$"2%"/&'];
  function prepareHandlerReturnValue(method, returnValue) {
    if (!method.hasReturnData)
      return void 0;
    if (method.returnJitFns.prepareForJson.isNoop)
      return returnValue;
    return method.returnJitFns.prepareForJson.fn(returnValue);
  }
  prepareHandlerReturnValue.__type = [() => __ΩRemoteMethod, "method", "returnValue", "prepareHandlerReturnValue", 'Pn!2""2#"/$'];
  const serializerMiddleFns = {
    mionDeserializeRequest: rawMiddleFn(deserializeRequestBody, { runOnError: true }),
    mionSerializeResponse: rawMiddleFn(serializeResponseBody, { runOnError: true })
  };
  const publicMethods = /* @__PURE__ */ new Map();
  function resetRemoteMethodsMetadata() {
    publicMethods.clear();
  }
  function getPublicApi(routes) {
    return recursiveGetSerializableRoutes(routes);
  }
  function recursiveGetSerializableRoutes(routes, currentPointer = [], publicData = {}) {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]) => {
      const itemPointer = [...currentPointer, key];
      const id = getRouterItemId(itemPointer);
      if (isPrivateDefinition(item, id)) {
        publicData[key] = null;
      } else if (isMiddleFnDef(item) || isHeadersMiddleFnDef(item) || isRoute(item)) {
        const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
        if (!executable)
          throw new Error(`Route or MiddleFn ${id} not found. Please check you have called router.registerRoutes first.`);
        publicData[key] = getSerializableMethod(executable);
      } else {
        const subRoutes = routes[key];
        publicData[key] = recursiveGetSerializableRoutes(subRoutes, itemPointer);
      }
    });
    return publicData;
  }
  function getSerializableMethod(executable) {
    const existing = publicMethods.get(executable.id);
    if (existing) return existing;
    const newRemoteMethod = {
      type: executable.type,
      id: executable.id,
      nestLevel: executable.nestLevel,
      isAsync: executable.isAsync,
      hasReturnData: executable.hasReturnData,
      paramsJitHash: executable.paramsJitHash,
      returnJitHash: executable.returnJitHash,
      pointer: executable.pointer,
      ...executable.paramNames ? { paramNames: executable.paramNames } : {},
      options: executable.options
    };
    if (executable.headersParam) newRemoteMethod.headersParam = executable.headersParam;
    if (executable.middleFnIds) newRemoteMethod.middleFnIds = executable.middleFnIds;
    publicMethods.set(executable.id, newRemoteMethod);
    return newRemoteMethod;
  }
  function serializePureDeps(namespacedDepHash, purFnDeps, depth = 0) {
    if (depth >= MAX_STACK_DEPTH)
      throw new Error(`Max depth reached serializing pure function dependencies, for: ${namespacedDepHash}`);
    const parts = namespacedDepHash.split("::");
    if (parts.length !== 2)
      throw new Error(`Invalid pure function dependency format: ${namespacedDepHash}, expected "namespace::fnHash"`);
    const [namespace, fnHash] = parts;
    if (!purFnDeps[namespace]) purFnDeps[namespace] = {};
    if (purFnDeps[namespace][fnHash]) return;
    const pureDep = getJitUtils().getCompiledPureFn(namespace, fnHash);
    if (!pureDep) throw new Error(`Pure function ${fnHash} not found in namespace ${namespace}`);
    const serializedPureDep = { ...pureDep, pureFnDependencies: [...pureDep.pureFnDependencies] };
    purFnDeps[namespace][fnHash] = serializedPureDep;
    pureDep.pureFnDependencies.forEach((depFnHash) => serializePureDeps(`${namespace}::${depFnHash}`, purFnDeps, depth + 1));
  }
  function serializeJitFn(jitFnHash, deps, purFnDeps, depth = 0) {
    if (depth >= MAX_STACK_DEPTH)
      throw new Error(`Max depth reached serializing jit function dependencies for jitHash: ${jitFnHash}`);
    const jitFn = getJitUtils().getJIT(jitFnHash);
    if (!jitFn) throw new Error(`Jit function ${jitFnHash} not found`);
    if (deps[jitFnHash]) return;
    const serializedJitFn = getSerializableJitCompiler(jitFn);
    deps[jitFnHash] = serializedJitFn;
    jitFn.jitDependencies.forEach((h) => serializeJitFn(h, deps, purFnDeps, depth + 1));
    jitFn.pureFnDependencies.forEach((h) => serializePureDeps(h, purFnDeps));
  }
  function serializeMethodDeps(method, deps, purFnDeps) {
    const { paramsJitHash, returnJitHash } = method;
    if (paramsJitHash !== EMPTY_HASH) {
      const paramsJitHashes = getJitFnHashes(paramsJitHash);
      for (const k in paramsJitHashes) serializeJitFn(paramsJitHashes[k], deps, purFnDeps);
    }
    if (returnJitHash !== EMPTY_HASH) {
      const returnJitHashes = getJitFnHashes(returnJitHash);
      for (const k in returnJitHashes) serializeJitFn(returnJitHashes[k], deps, purFnDeps);
    }
  }
  function getSerializableJitCompiler(comp) {
    return {
      typeName: comp.typeName,
      fnID: comp.fnID,
      jitFnHash: comp.jitFnHash,
      args: structuredClone(comp.args),
      isNoop: comp.isNoop,
      defaultParamValues: structuredClone(comp.defaultParamValues),
      code: comp.code,
      jitDependencies: [...comp.jitDependencies],
      pureFnDependencies: [...comp.pureFnDependencies],
      ...comp.paramNames ? { paramNames: [...comp.paramNames] } : {}
    };
  }
  function __assignType$4(fn, args) {
    fn.__type = args;
    return fn;
  }
  const __ΩClientRouteOptions = [() => __ΩRouterOptions, "getAllRemoteMethodsMaxNumber", "ClientRouteOptions", `Pn!'4"8Mw#y`];
  const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100
  };
  const mionInternalRoutes$1 = Object.values(MION_ROUTES);
  function mionGetRemoteMethodsDataById(ctx, methodsIds, getAllRemoteMethods) {
    const resp = {
      methods: {},
      deps: {},
      purFnDeps: {}
    };
    const errorData = {};
    const maxMethods = (getRouterOptions.Ω = [[() => __ΩClientRouteOptions, "n!"]], getRouterOptions()).getAllRemoteMethodsMaxNumber || defaultClientRouteOptions.getAllRemoteMethodsMaxNumber;
    const shouldReturnAll = getAllRemoteMethods && getTotalExecutables() <= maxMethods;
    const idsToReturn = shouldReturnAll ? getAllExecutablesIds().filter(__assignType$4((id) => !mionInternalRoutes$1.includes(id) && !isPrivateExecutable(getAnyExecutable(id)), ["id", "", 'P"2!"/"'])) : methodsIds;
    idsToReturn.forEach(__assignType$4((id) => addRequiredRemoteMethodsToResponse(id, resp, errorData), ["id", "", 'P"2!"/"']));
    if (Object.keys(errorData).length)
      return new RpcError({
        type: "rpc-metadata-not-found",
        publicMessage: "Errors getting Remote Methods Metadata",
        errorData
      });
    return resp;
  }
  mionGetRemoteMethodsDataById.__type = ["ctx", "methodsIds", "getAllRemoteMethods", () => __ΩSerializableMethodsData, "rpc-metadata-not-found", () => RpcError, "mionGetRemoteMethodsDataById", `P"2!&F2")2#8Pn$P.%7&J/'`];
  function mionGetRemoteMethodsDataByPath(ctx, path, getAllRemoteMethods) {
    const executables = getRouteExecutionChain(path);
    if (!executables)
      return new RpcError({
        type: "rpc-metadata-not-found",
        publicMessage: `Route ${path} not found`
      });
    const privateExecutables = executables.methods.filter(__assignType$4((e) => !isPrivateExecutable(e), ["e", "", 'P"2!"/"']));
    return mionGetRemoteMethodsDataById(ctx, privateExecutables.map(__assignType$4((e) => e.id, ["e", "", 'P"2!"/"'])), getAllRemoteMethods);
  }
  mionGetRemoteMethodsDataByPath.__type = ["ctx", "path", "getAllRemoteMethods", () => __ΩSerializableMethodsData, "rpc-metadata-not-found", () => RpcError, "mionGetRemoteMethodsDataByPath", `P"2!&2")2#8Pn$P.%7&J/'`];
  function addRequiredRemoteMethodsToResponse(id, resp, errorData) {
    const { methods, deps, purFnDeps } = resp;
    if (methods[id])
      return;
    if (mionInternalRoutes$1.includes(id))
      return;
    const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
    if (!executable) {
      errorData[id] = `Remote Method ${id} not found`;
      return;
    }
    if (isPrivateExecutable(executable))
      return;
    const method = getSerializableMethod(executable);
    methods[id] = method;
    method.middleFnIds?.forEach(__assignType$4((middleFnId) => addRequiredRemoteMethodsToResponse(middleFnId, resp, errorData), ["middleFnId", "", 'P"2!"/"']));
    serializeMethodDeps(method, deps, purFnDeps);
  }
  addRequiredRemoteMethodsToResponse.__type = ["id", () => __ΩSerializableMethodsData, "resp", () => __ΩAnyObject, "errorData", "addRequiredRemoteMethodsToResponse", 'P&2!n"2#n$2%$/&'];
  const mionClientRoutes = {
    // Client routes always use stringifyJson serialization to avoid mutating data as is cached
    // These routes are used by the client to fetch metadata and must work regardless of router's default serialization
    [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, { serializer: "stringifyJson" }),
    [MION_ROUTES.methodsMetadataByPath]: route(mionGetRemoteMethodsDataByPath, { serializer: "stringifyJson" })
  };
  const __ΩRecord$1 = ["K", "T", "Record", `l'e#"Rb!b"Pde"!N#!w#y`];
  function __assignType$3(fn, args) {
    fn.__type = args;
    return fn;
  }
  const mionErrorsRoutes = {
    /**
     * !IMPORTANT!
     * This is declared as route mostly to reuse existing router serialization/deserialization functionality.
     * But "@thrownErrors" is expected to be a field in response body that contain all thrown errors from other executables.
     * thrown Errors are not strongly typed and are all serialized/deserialized as RpcError<string>.
     * this also prevents users to register a route with the same name.
     */
    [MION_ROUTES.thrownErrors]: route(__assignType$3((ctx) => {
      return ctx.request.thrownErrors || {};
    }, ["CallContext", "ctx", () => __ΩRecord$1, () => RpcError, "", 'P"w!2"&P&7$o##/%'])),
    /**
     * Route that handles not-found scenarios when a requested route doesn't exist.
     * This route is registered as an internal mion route.
     * The route is called by dispatch logic when no matching route is found.
     * Throws an RpcError that will be caught and stored in thrownErrors by the router.
     */
    [MION_ROUTES.notFound]: route(__assignType$3((ctx) => {
      throw new RpcError({
        statusCode: StatusCodes.NOT_FOUND,
        publicMessage: `Route not found`,
        type: "route-not-found"
      });
    }, ["CallContext", "ctx", "route-not-found", () => RpcError, "", 'P"w!2"P.#7$/%'])),
    /**
     * Platform error route for strongly typing platform/adapter errors.
     * Platform errors occur before reaching the router or outside the router
     * and are platform/adapter related (e.g., HTTP server errors, connection issues).
     * This route is used for serialization/deserialization of platform errors.
     * This also prevents users to register a route with the same name.
     */
    [MION_ROUTES.platformError]: route(__assignType$3((_ctx) => {
      return new RpcError({
        publicMessage: "Platform error",
        type: "platform-error"
      });
    }, ["CallContext", "_ctx", () => RpcError, "", 'P"w!2"P&7#/$']))
  };
  const serverPureFnsCache = {};
  function __assignType$2(fn, args) {
    fn.__type = args;
    return fn;
  }
  const routesFlowCache = (Map.Ω = [["&"], [() => __ΩMethodsExecutionChain, "n!"]], /* @__PURE__ */ new Map());
  const cacheOrder = [];
  const mappingMethodCache = (Map.Ω = [["&"], [() => __ΩRemoteMethod, "n!"]], /* @__PURE__ */ new Map());
  function clearRoutesFlowCache() {
    routesFlowCache.clear();
    cacheOrder.length = 0;
    mappingMethodCache.clear();
  }
  clearRoutesFlowCache.__type = ["clearRoutesFlowCache", "P$/!"];
  function addToRoutesFlowCache(query, chain) {
    const routerOpts = getRouterOptions();
    const maxSize = routerOpts.maxRoutesFlowsCacheSize;
    if (maxSize <= 0)
      return;
    while (cacheOrder.length >= maxSize) {
      const oldestKey = cacheOrder.shift();
      if (oldestKey)
        routesFlowCache.delete(oldestKey);
    }
    routesFlowCache.set(query, chain);
    cacheOrder.push(query);
  }
  addToRoutesFlowCache.__type = ["query", () => __ΩMethodsExecutionChain, "chain", "addToRoutesFlowCache", 'P&2!n"2#$/$'];
  function decodeRoutesFlowQuery(urlQuery) {
    try {
      const dataParam = urlQuery.startsWith("data=") ? urlQuery.slice(5) : urlQuery;
      const jsonString = fromBase64Url(dataParam);
      return JSON.parse(jsonString);
    } catch (e) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "routesFlow-invalid-query",
        publicMessage: "RoutesFlow query string is not valid base64url-encoded JSON.",
        errorData: { parseError: e?.message || "Unknown error" }
      });
    }
  }
  decodeRoutesFlowQuery.__type = ["urlQuery", "RoutesFlowQuery", "decodeRoutesFlowQuery", 'P&2!"w"/#'];
  function getRoutesFlowExecutionChain(rawRequest, opts2, urlQuery) {
    if (!urlQuery) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "routesFlow-missing-query",
        publicMessage: "RoutesFlow request requires a query string with route paths."
      });
    }
    const query = decodeRoutesFlowQuery(urlQuery);
    const routePaths = query.routes;
    const mappings = query.mappings;
    if (!routePaths || routePaths.length === 0) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "routesFlow-empty-routes",
        publicMessage: "RoutesFlow request requires at least one route path in query string."
      });
    }
    const routeIds = routePaths.map(__assignType$2((path) => path.startsWith("/") ? path.slice(1) : path, ["path", "", 'P"2!"/"']));
    let executionChain = routesFlowCache.get(urlQuery);
    if (executionChain)
      return { executionChain, routesFlowRouteIds: routeIds, mappings };
    executionChain = buildMergedExecutionChain(routePaths, rawRequest, opts2, mappings);
    addToRoutesFlowCache(urlQuery, executionChain);
    return { executionChain, routesFlowRouteIds: routeIds, mappings };
  }
  getRoutesFlowExecutionChain.__type = ["rawRequest", () => __ΩRouterOptions, "opts", "urlQuery", () => __ΩRoutesFlowExecutionResult, "getRoutesFlowExecutionChain", 'P#2!n"2#&2$8n%/&'];
  function buildMergedExecutionChain(routePaths, rawRequest, opts2, mappings) {
    const seenIds = (Set.Ω = [["&"]], /* @__PURE__ */ new Set());
    const middleMethods = [];
    let resolvedSerializer;
    let firstRouteIndex = -1;
    const defaultSerializerCode = SerializerModes[opts2.serializer];
    const startMiddleFnIds = new Set(startMiddleFns.map(__assignType$2((m) => m.id, ["m", "", 'P"2!"/"'])));
    const endMiddleFnIds = new Set(endMiddleFns.map(__assignType$2((m) => m.id, ["m", "", 'P"2!"/"'])));
    for (const routePath of routePaths) {
      const transformedPath = opts2.pathTransform?.(rawRequest, routePath) || routePath;
      const chain = getRouteExecutionChain(transformedPath);
      if (!chain) {
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "routesFlow-route-not-found",
          publicMessage: `Route not found in routesFlow: ${routePath}`,
          errorData: { routePath }
        });
      }
      if (!resolvedSerializer) {
        resolvedSerializer = chain.serializer;
        firstRouteIndex = chain.routeIndex;
      } else if (resolvedSerializer !== chain.serializer) {
        resolvedSerializer = defaultSerializerCode;
      }
      for (const method of chain.methods) {
        if (seenIds.has(method.id))
          continue;
        if (startMiddleFnIds.has(method.id))
          continue;
        if (endMiddleFnIds.has(method.id))
          continue;
        seenIds.add(method.id);
        middleMethods.push(method);
      }
    }
    if (mappings && mappings.length > 0) {
      insertMappingMethods(middleMethods, mappings);
    }
    const mergedMethods = [...startMiddleFns, ...middleMethods, ...endMiddleFns];
    return {
      // Use the first route's routeIndex since that's where the first route handler is
      routeIndex: firstRouteIndex,
      methods: mergedMethods,
      serializer: resolvedSerializer ?? defaultSerializerCode
    };
  }
  buildMergedExecutionChain.__type = ["routePaths", "rawRequest", () => __ΩRouterOptions, "opts", "RoutesFlowMapping", "mappings", () => __ΩMethodsExecutionChain, "buildMergedExecutionChain", `P&F2!#2"n#2$"w%F2&8n'/(`];
  function insertMappingMethods(middleMethods, mappings) {
    const idToIndex = (Map.Ω = [["&"], ["'"]], /* @__PURE__ */ new Map());
    for (let i = 0; i < middleMethods.length; i++) {
      idToIndex.set(middleMethods[i].id, i);
    }
    const insertions = [];
    for (const mapping of mappings) {
      const fromIndex = idToIndex.get(mapping.fromId);
      const toIndex = idToIndex.get(mapping.toId);
      if (fromIndex === void 0) {
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "routesFlow-mapping-invalid-source",
          publicMessage: `Mapping source route '${mapping.fromId}' not found in routesFlow execution chain.`,
          errorData: { mapping }
        });
      }
      if (toIndex === void 0) {
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "routesFlow-mapping-invalid-target",
          publicMessage: `Mapping target route '${mapping.toId}' not found in routesFlow execution chain.`,
          errorData: { mapping }
        });
      }
      if (!serverPureFnsCache[PURE_SERVER_FN_NAMESPACE]?.[mapping.bodyHash]?.fn) {
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "routesFlow-mapping-missing-pure-fn",
          publicMessage: `Mapping pure function '${mapping.bodyHash}' not found. Ensure the function is registered on the server.`,
          errorData: { mapping }
        });
      }
      insertions.push({
        index: fromIndex + 1,
        method: createMappingMethod(mapping)
      });
    }
    insertions.sort(__assignType$2((a, b) => b.index - a.index, ["a", "b", "", 'P"2!"2""/#']));
    for (const { index, method } of insertions) {
      middleMethods.splice(index, 0, method);
    }
  }
  insertMappingMethods.__type = [() => __ΩRemoteMethod, "middleMethods", "RoutesFlowMapping", "mappings", "insertMappingMethods", 'Pn!F2""w#F2$$/%'];
  function createMappingMethod(mapping) {
    const id = `mionMapFrom_${mapping.fromId}_${mapping.bodyHash}_to_${mapping.toId}`;
    const cached = mappingMethodCache.get(id);
    if (cached)
      return cached;
    const noopJitFns2 = getNoopJitFns();
    const method = {
      type: HandlerType$1.rawMiddleFn,
      id,
      isAsync: false,
      hasReturnData: false,
      paramsJitHash: "",
      returnJitHash: "",
      paramsJitFns: noopJitFns2,
      returnJitFns: noopJitFns2,
      handler: createMappingHandler(mapping),
      options: { runOnError: false, validateParams: false },
      methodCaller: runMappingHandler
    };
    mappingMethodCache.set(id, method);
    return method;
  }
  createMappingMethod.__type = ["RoutesFlowMapping", "mapping", () => __ΩRemoteMethod, "createMappingMethod", 'P"w!2"n#/$'];
  function createMappingHandler(mapping) {
    return __assignType$2((ctx) => {
      const sourceOutput = ctx.response.body[mapping.fromId];
      const entry = serverPureFnsCache[PURE_SERVER_FN_NAMESPACE]?.[mapping.bodyHash];
      if (!entry?.fn) {
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "routesFlow-mapping-missing-pure-fn",
          publicMessage: `Mapping pure function '${mapping.bodyHash}' not found at runtime.`
        });
      }
      const mappedValue = entry.fn(sourceOutput);
      const targetParams = ctx.request.body[mapping.toId];
      if (targetParams)
        targetParams[mapping.paramIndex] = mappedValue;
    }, ["CallContext", "ctx", "", 'P"w!2""/#']);
  }
  createMappingHandler.__type = ["RoutesFlowMapping", "mapping", "createMappingHandler", 'P"w!2""/#'];
  async function runMappingHandler(context, executable, ...args) {
    return executable.handler(context);
  }
  runMappingHandler.__type = ["CallContext", "context", () => __ΩRemoteMethod, "executable", "args", "runMappingHandler", 'P"w!2"n#2$#@2%"/&'];
  let contextPool = [];
  function clearContextPool() {
    contextPool = [];
  }
  function createCallContext(path, opts2, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType, urlQuery) {
    const transformedPath = opts2.pathTransform?.(rawRequest, path) || path;
    const { executionChain, routesFlowRouteIds } = getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts2);
    return {
      path: transformedPath,
      request: {
        headers: reqHeaders,
        rawBody: reqRawBody,
        bodyType: reqBodyType ?? getRequestBodyType(reqRawBody),
        body: {},
        thrownErrors: void 0
      },
      response: {
        statusCode: StatusCodes.OK,
        hasErrors: false,
        headers: respHeaders,
        body: {},
        rawBody: "",
        serializer: SerializerModes.json,
        binSerializer: void 0
      },
      executionChain,
      shared: opts2.contextDataFactory ? opts2.contextDataFactory() : {},
      urlQuery,
      routesFlowRouteIds
    };
  }
  function acquireCallContext(usePooling, path, opts2, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType, urlQuery) {
    if (!usePooling) return createCallContext(path, opts2, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType, urlQuery);
    const pooledContext = contextPool.pop();
    const transformedPath = opts2.pathTransform?.(rawRequest, path) || path;
    if (pooledContext) {
      const ctx = pooledContext;
      ctx.path = transformedPath;
      const req = ctx.request;
      req.headers = reqHeaders;
      req.rawBody = reqRawBody;
      req.bodyType = reqBodyType ?? getRequestBodyType(reqRawBody);
      req.body = {};
      req.thrownErrors = void 0;
      const resp = ctx.response;
      resp.statusCode = StatusCodes.OK;
      resp.hasErrors = false;
      resp.headers = respHeaders;
      resp.body = {};
      resp.rawBody = "";
      resp.serializer = SerializerModes.json;
      resp.binSerializer = void 0;
      const { executionChain, routesFlowRouteIds } = getExecutionChain(path, transformedPath, urlQuery, rawRequest, opts2);
      ctx.executionChain = executionChain;
      ctx.routesFlowRouteIds = routesFlowRouteIds;
      ctx.shared = opts2.contextDataFactory ? opts2.contextDataFactory() : {};
      ctx.urlQuery = urlQuery;
      return ctx;
    }
    return createCallContext(path, opts2, reqRawBody, rawRequest, reqHeaders, respHeaders, reqBodyType, urlQuery);
  }
  function releaseCallContext(ctx, maxPoolSize) {
    if (contextPool.length < maxPoolSize) {
      const mutableCtx = ctx;
      const req = mutableCtx.request;
      req.rawBody = "";
      req.body = null;
      req.thrownErrors = void 0;
      mutableCtx.response = {
        statusCode: StatusCodes.OK,
        hasErrors: false,
        headers: null,
        // Will be set when context is acquired
        body: null,
        // Will be set when context is acquired
        rawBody: "",
        serializer: SerializerModes.json,
        binSerializer: void 0
      };
      mutableCtx.shared = null;
      mutableCtx.executionChain = null;
      mutableCtx.routesFlowRouteIds = void 0;
      contextPool.push(ctx);
    }
  }
  function getRequestBodyType(rawBody) {
    if (typeof rawBody === "string") return SerializerModes.stringifyJson;
    if (rawBody instanceof ArrayBuffer || rawBody instanceof Uint8Array) return SerializerModes.binary;
    return SerializerModes.json;
  }
  function getExecutionChain(originalPath, transformedPath, urlQuery, rawRequest, opts2) {
    const hasPrefix = !!opts2.basePath;
    const isRoutesFlowPath = hasPrefix ? originalPath.endsWith(WORKFLOW_PATH) : originalPath === WORKFLOW_PATH;
    if (isRoutesFlowPath) return getRoutesFlowExecutionChain(rawRequest, opts2, urlQuery);
    let executionChain = getRouteExecutionChain(transformedPath);
    if (!executionChain) {
      const notFoundPath = getRoutePath([MION_ROUTES.notFound], opts2);
      executionChain = getRouteExecutionChain(notFoundPath);
      if (!executionChain) {
        throw new RpcError({
          statusCode: StatusCodes.UNEXPECTED_ERROR,
          type: "not-found",
          publicMessage: "Not-found route is not registered. This should never happen."
        });
      }
    }
    return { executionChain };
  }
  const mionInternalRoutes = Object.values(MION_ROUTES);
  const flatRouter = /* @__PURE__ */ new Map();
  const middleFnsById = /* @__PURE__ */ new Map();
  const routesById = /* @__PURE__ */ new Map();
  const rawMiddleFnsById = /* @__PURE__ */ new Map();
  const middleFnNames = /* @__PURE__ */ new Set();
  const routeNames = /* @__PURE__ */ new Set();
  let routerOptions = { ...DEFAULT_ROUTE_OPTIONS };
  let isRouterInitialized = false;
  let allExecutablesIds;
  const defaultStartMiddleFns = {
    mionDeserializeRequest: serializerMiddleFns.mionDeserializeRequest
  };
  const defaultEndMiddleFns = {
    mionSerializeResponse: serializerMiddleFns.mionSerializeResponse
  };
  let startMiddleFnsDef = { ...defaultStartMiddleFns };
  let endMiddleFnsDef = { ...defaultEndMiddleFns };
  let startMiddleFns = [];
  let endMiddleFns = [];
  const getRouteExecutionChain = (path) => flatRouter.get(path);
  const getRouteExecutable = (id) => routesById.get(id);
  const getMiddleFnExecutable = (id) => middleFnsById.get(id);
  const getRouterOptions = () => routerOptions;
  const getAnyExecutable = (id) => routesById.get(id) || middleFnsById.get(id) || rawMiddleFnsById.get(id);
  const resetRouter = () => {
    flatRouter.clear();
    middleFnsById.clear();
    routesById.clear();
    rawMiddleFnsById.clear();
    middleFnNames.clear();
    routeNames.clear();
    routerOptions = { ...DEFAULT_ROUTE_OPTIONS };
    startMiddleFnsDef = { ...defaultStartMiddleFns };
    endMiddleFnsDef = { ...defaultEndMiddleFns };
    startMiddleFns = [];
    endMiddleFns = [];
    isRouterInitialized = false;
    allExecutablesIds = void 0;
    resetRemoteMethodsMetadata();
    resetPersistedMethods();
    resetRoutesCache();
    clearContextPool();
    clearRoutesFlowCache();
  };
  async function initMionRouter(routes, opts2) {
    await initRouter(opts2);
    const publicApi = await registerRoutes(routes);
    await emitAOTCaches$1();
    return publicApi;
  }
  async function initRouter(opts2) {
    if (isRouterInitialized) throw new Error("Router has already been initialized");
    routerOptions = { ...routerOptions, ...opts2 };
    validateSharedDataFactory(routerOptions);
    Object.freeze(routerOptions);
    setErrorOptions(routerOptions);
    if (routerOptions.aot) await loadAOTCaches$1();
    isRouterInitialized = true;
    await registerRoutes({ ...mionErrorsRoutes });
    if (!routerOptions.skipClientRoutes) await registerRoutes({ ...mionClientRoutes });
    if (!isTestEnv()) console.log("mion router initialized", { routerOptions });
    return routerOptions;
  }
  async function registerRoutes(routes) {
    if (!isRouterInitialized) throw new Error("initRouter should be called first");
    startMiddleFns = await getExecutablesFromMiddleFnsCollection(startMiddleFnsDef);
    endMiddleFns = await getExecutablesFromMiddleFnsCollection(endMiddleFnsDef);
    await recursiveFlatRoutes(routes);
    if (shouldFullGenerateSpec()) {
      return getPublicApi(routes);
    }
    return {};
  }
  function isPrivateDefinition(entry, id) {
    if (isRoute(entry)) return false;
    if (isRawMiddleFnDef(entry)) return true;
    try {
      const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
      if (!executable)
        throw new Error(`Route or MiddleFn ${id} not found. Please check you have called router.registerRoutes first.`);
      return isPrivateExecutable(executable);
    } catch {
      return false;
    }
  }
  function isPrivateExecutable(executable) {
    if (executable.type === HandlerType$1.rawMiddleFn) return true;
    if (executable.type === HandlerType$1.route) return false;
    const hasPublicParams = !!executable.paramNames?.length;
    const hasHeaderParams = !!executable.headersParam?.headerNames?.length;
    return !hasPublicParams && !hasHeaderParams && !executable.hasReturnData;
  }
  function getTotalExecutables() {
    return routesById.size + middleFnsById.size + rawMiddleFnsById.size;
  }
  function getAllExecutablesIds() {
    if (allExecutablesIds) return allExecutablesIds;
    allExecutablesIds = [...routesById.keys(), ...middleFnsById.keys(), ...rawMiddleFnsById.keys()];
    return allExecutablesIds;
  }
  function shouldFullGenerateSpec() {
    return routerOptions.getPublicRoutesData || getENV("GENERATE_ROUTER_SPEC") === "true" || isMionCompileMode();
  }
  function getRouteExecutableFromPath(path) {
    const executionChain = flatRouter.get(path);
    if (!executionChain) {
      return getAnyExecutable(MION_ROUTES.notFound);
    }
    return executionChain.methods[executionChain.routeIndex];
  }
  async function loadAOTCaches$1() {
    const loader = await Promise.resolve().then(() => aotCacheLoader);
    return loader.loadRouterAOTCaches();
  }
  async function emitAOTCaches$1() {
    if (!isMionAOTEmitMode()) return;
    const aotEmitter$1 = await Promise.resolve().then(() => aotEmitter);
    return aotEmitter$1.emitAOTCaches();
  }
  async function recursiveFlatRoutes(routes, currentPointer = [], preMiddleFns = [], postMiddleFns = [], nestLevel = 0) {
    if (nestLevel > MAX_ROUTE_NESTING)
      throw new Error("Too many nested routes, you can only nest routes ${MAX_ROUTE_NESTING} levels");
    const entries = Object.entries(routes);
    if (entries.length === 0)
      throw new Error(
        `Invalid route: ${currentPointer.length ? joinPath(...currentPointer) : "*"}. Can Not define empty routes`
      );
    let minus1Props = null;
    for (let index = 0; index < entries.length; index++) {
      const [key, item] = entries[index];
      const newPointer = [...currentPointer, key];
      let routeEntry;
      if (typeof key !== "string" || !isNaN(key))
        throw new Error(`Invalid route: ${joinPath(...newPointer)}. Numeric route names are not allowed`);
      if (key.includes(",")) throw new Error(`Invalid route: ${joinPath(...newPointer)}. Route names cannot contain commas.`);
      if (key === WORKFLOW_KEY)
        throw new Error(`Invalid route: ${joinPath(...newPointer)}. '${WORKFLOW_KEY}' is a reserved mion route name.`);
      if (isAnyMiddleFnDef(item)) {
        routeEntry = await getExecutableFromAnyMiddleFn(item, newPointer, nestLevel);
        if (middleFnNames.has(routeEntry.id))
          throw new Error(
            `Invalid middleFn: ${joinPath(...newPointer)}. Naming collision, Naming collision, duplicated middleFn.`
          );
        middleFnNames.add(routeEntry.id);
      } else if (isRoute(item)) {
        routeEntry = await getExecutableFromRoute(item, newPointer, nestLevel);
        if (routeNames.has(routeEntry.id))
          throw new Error(`Invalid route: ${joinPath(...newPointer)}. Naming collision, duplicated route`);
        routeNames.add(routeEntry.id);
      } else if (isRoutes(item)) {
        routeEntry = {
          pathPointer: newPointer,
          routes: item
        };
      } else {
        const itemType = typeof item;
        throw new Error(`Invalid route: ${joinPath(...newPointer)}. Type <${itemType}> is not a valid route.`);
      }
      minus1Props = await recursiveCreateExecutionChainAsync(
        routeEntry,
        newPointer,
        preMiddleFns,
        postMiddleFns,
        nestLevel,
        index,
        entries,
        minus1Props
      );
    }
  }
  async function recursiveCreateExecutionChainAsync(routeEntry, currentPointer, preMiddleFns, postMiddleFns, nestLevel, index, routeKeyedEntries, minus1Props) {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);
    if (props.isBetweenRoutes && minus1Props) {
      props.preLevelMiddleFns = minus1Props.preLevelMiddleFns;
      props.postLevelMiddleFns = minus1Props.postLevelMiddleFns;
    } else {
      for (let i = 0; i < routeKeyedEntries.length; i++) {
        const [k, entry] = routeKeyedEntries[i];
        if (!isAnyMiddleFnDef(entry)) continue;
        const newPointer = [...currentPointer.slice(0, -1), k];
        const executable = await getExecutableFromAnyMiddleFn(entry, newPointer, nestLevel);
        if (i < index) props.preLevelMiddleFns.push(executable);
        if (i > index) props.postLevelMiddleFns.push(executable);
      }
    }
    const isExec = isExecutable(routeEntry);
    if (isExec && props.isRoute) {
      const path = getRoutePath(routeEntry.pointer, routerOptions);
      const routeMethod = routeEntry;
      const levelMethods = [
        ...preMiddleFns,
        ...props.preLevelMiddleFns,
        routeEntry,
        ...props.postLevelMiddleFns,
        ...postMiddleFns
      ];
      const methods = [...startMiddleFns, ...levelMethods, ...endMiddleFns];
      const executionChain = {
        routeIndex: startMiddleFns.length + preMiddleFns.length + props.preLevelMiddleFns.length,
        methods,
        serializer: getSerializerCodeFromMode(routeMethod.options.serializer)
      };
      const middleFnIds = getPublicMiddleFnIds(methods);
      if (middleFnIds.length) routeMethod.middleFnIds = middleFnIds;
      flatRouter.set(path, executionChain);
    } else if (!isExec) {
      await recursiveFlatRoutes(
        routeEntry.routes,
        routeEntry.pathPointer,
        [...preMiddleFns, ...props.preLevelMiddleFns],
        [...props.postLevelMiddleFns, ...postMiddleFns],
        nestLevel + 1
      );
    }
    return props;
  }
  async function getExecutableFromAnyMiddleFn(middleFn, middleFnPointer, nestLevel) {
    if (isRawMiddleFnDef(middleFn)) return getExecutableFromRawMiddleFn(middleFn, middleFnPointer, nestLevel);
    return getExecutableFromMiddleFn(middleFn, middleFnPointer, nestLevel);
  }
  async function getExecutableFromMiddleFn(middleFn, middleFnPointer, nestLevel) {
    const isHeader = isHeadersMiddleFnDef(middleFn);
    const middleFnId = getRouterItemId(middleFnPointer);
    const existing = middleFnsById.get(middleFnId);
    if (existing) return existing;
    const compiledMethod = getPersistedMethod(middleFnId, middleFn.handler);
    let executable;
    if (compiledMethod) {
      executable = compiledMethod;
    } else {
      const reflectionData = await getHandlerReflection(middleFn.handler, middleFnId, routerOptions, isHeader);
      executable = {
        id: middleFnId,
        type: isHeader ? HandlerType$1.headersMiddleFn : HandlerType$1.middleFn,
        nestLevel,
        handler: middleFn.handler,
        pointer: middleFnPointer,
        ...reflectionData,
        options: {
          runOnError: !!middleFn.options?.runOnError,
          validateParams: middleFn.options?.validateParams ?? true,
          validateReturn: middleFn.options?.validateReturn ?? false,
          description: middleFn.options?.description
        }
      };
      addToPersistedMethods(middleFnId, executable);
    }
    middleFnsById.set(middleFnId, executable);
    routesCache.setMethodJitFns(middleFnId, executable);
    return executable;
  }
  async function getExecutableFromRawMiddleFn(middleFn, middleFnPointer, nestLevel) {
    const middleFnId = getRouterItemId(middleFnPointer);
    const existing = rawMiddleFnsById.get(middleFnId);
    if (existing) return existing;
    const reflectionData = await getRawMethodReflection(middleFn.handler, middleFnId, routerOptions);
    const executable = {
      id: middleFnId,
      type: HandlerType$1.rawMiddleFn,
      nestLevel,
      handler: middleFn.handler,
      pointer: middleFnPointer,
      ...reflectionData,
      options: {
        runOnError: !!middleFn.options?.runOnError,
        validateParams: false,
        validateReturn: false,
        description: middleFn.options?.description
      }
    };
    rawMiddleFnsById.set(middleFnId, executable);
    routesCache.setMethodJitFns(middleFnId, executable);
    return executable;
  }
  async function getExecutableFromRoute(route2, routePointer, nestLevel) {
    const routeId = getRouterItemId(routePointer);
    const existing = routesById.get(routeId);
    if (existing) return existing;
    const compiledMethod = getPersistedMethod(routeId, route2.handler);
    let executable;
    if (compiledMethod) {
      executable = compiledMethod;
    } else {
      const reflectionData = await getHandlerReflection(route2.handler, routeId, routerOptions);
      executable = {
        id: routeId,
        type: HandlerType$1.route,
        nestLevel,
        handler: route2.handler,
        pointer: routePointer,
        ...reflectionData,
        options: {
          runOnError: false,
          validateParams: route2.options?.validateParams ?? true,
          validateReturn: route2.options?.validateReturn ?? false,
          description: route2.options?.description,
          serializer: route2.options?.serializer ?? routerOptions.serializer,
          isMutation: route2.options?.isMutation
        }
      };
      addToPersistedMethods(routeId, executable);
    }
    routesById.set(routeId, executable);
    routesCache.setMethodJitFns(routeId, executable);
    return executable;
  }
  function getPublicMiddleFnIds(methods) {
    const ids = methods.filter((exec) => isPublicExecutable(exec)).map((exec) => getRouterItemId(exec.pointer)).filter((mfId) => {
      if (mionInternalRoutes.includes(mfId)) return false;
      const exec = getMiddleFnExecutable(mfId);
      return exec && isPublicExecutable(exec);
    });
    return ids;
  }
  function getEntry(index, keyEntryList) {
    return keyEntryList[index]?.[1];
  }
  function getRouteEntryProperties(minus1, zero, plus1) {
    const minus1IsRoute = minus1 && isRoute(minus1);
    const zeroIsRoute = zero.type === HandlerType$1.route;
    const plus1IsRoute = plus1 && isRoute(plus1);
    const isExec = !!zero.handler;
    return {
      isBetweenRoutes: minus1IsRoute && zeroIsRoute && plus1IsRoute,
      isExecutable: isExec,
      isRoute: zeroIsRoute,
      preLevelMiddleFns: [],
      postLevelMiddleFns: []
    };
  }
  async function getExecutablesFromMiddleFnsCollection(middleFnsDef) {
    const results = [];
    for (const [key, middleFn] of Object.entries(middleFnsDef)) {
      if (isRawMiddleFnDef(middleFn)) {
        results.push(await getExecutableFromRawMiddleFn(middleFn, [key], 0));
      } else if (isHeadersMiddleFnDef(middleFn) || isMiddleFnDef(middleFn)) {
        results.push(await getExecutableFromMiddleFn(middleFn, [key], 0));
      } else {
        throw new Error(`Invalid middleFn: ${key}. Invalid middleFn definition`);
      }
    }
    return results;
  }
  function validateSharedDataFactory(opts2) {
    if (!opts2?.contextDataFactory) return;
    const testSharedData = opts2.contextDataFactory();
    if (typeof testSharedData !== "object" || Array.isArray(testSharedData) || testSharedData === null || Object.keys(testSharedData).length === 0) {
      throw new Error("contextDataFactory must return a plain object with at least one property");
    }
  }
  function getSerializerCodeFromMode(mode) {
    switch (mode) {
      case "binary":
        return SerializerModes.binary;
      case "stringifyJson":
        return SerializerModes.stringifyJson;
      case "json":
      default:
        return SerializerModes.json;
    }
  }
  function joinPath(...parts) {
    return parts.filter(Boolean).join("/");
  }
  async function dispatchRoute(path, reqRawBody, reqHeaders, respHeaders, rawRequest, rawResponse, reqBodyType, urlQuery) {
    const opts2 = getRouterOptions();
    const usePooling = opts2.maxContextPoolSize > 0;
    const context = acquireCallContext(
      usePooling,
      path,
      opts2,
      reqRawBody,
      rawRequest,
      reqHeaders,
      respHeaders,
      reqBodyType,
      urlQuery
    );
    try {
      await runExecutionChain(context, rawRequest, rawResponse, opts2);
      return context.response;
    } catch (err) {
      return Promise.reject(err);
    } finally {
      if (usePooling) {
        releaseCallContext(context, opts2.maxContextPoolSize);
      }
    }
  }
  async function runExecutionChain(context, rawRequest, rawResponse, opts2) {
    const { response, request } = context;
    const executionList = context.executionChain.methods;
    response.serializer = context.executionChain.serializer;
    for (let i = 0; i < executionList.length; i++) {
      const executable = executionList[i];
      if (response.hasErrors && !executable.options.runOnError) continue;
      try {
        const methodCaller = executable.methodCaller || getMethodCaller(executable);
        const result = await methodCaller(context, executable, request, response, opts2, rawRequest, rawResponse);
        if (result === void 0 || !executable.hasReturnData) continue;
        if (executable.headersReturn && result instanceof HeadersSubset) {
          const headersMap = result.headers;
          for (const name in headersMap) {
            const value = headersMap[name];
            if (value !== void 0 && value !== null) {
              response.headers.set(name, value);
            }
          }
          continue;
        }
        response.body[executable.id] = result;
      } catch (err) {
        onExecutableError(context, executable, err);
      }
    }
    return context.response;
  }
  async function runRawMiddleFn(context, executable, req, resp, opts2, rawRequest, rawResponse) {
    const result = await executable.handler(context, rawRequest, rawResponse, opts2);
    return result;
  }
  async function runHeadersMiddleFn(context, executable, request) {
    const headerNames = executable.headersParam.headerNames;
    const params = deserializeBodyParamsOrThrow(request, executable);
    const headersMap = {};
    headerNames.forEach((name) => {
      const value = request.headers.get(name);
      if (value) headersMap[name] = value;
    });
    const headersSubset = new HeadersSubset(headersMap);
    validateHeaderParamsOrThrow(headersSubset, executable);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable);
    const result = await executable.handler(context, headersSubset, ...params);
    return result;
  }
  async function runRouteOrMiddleFn(context, executable, request) {
    const params = deserializeBodyParamsOrThrow(request, executable);
    if (executable.options.validateParams) validateParametersOrThrow(params, executable);
    const result = await executable.handler(context, ...params);
    return result;
  }
  function getMethodCaller(executable) {
    if (executable.type === HandlerType$1.rawMiddleFn) {
      executable.methodCaller = runRawMiddleFn;
    } else if (executable.type === HandlerType$1.headersMiddleFn) {
      executable.methodCaller = runHeadersMiddleFn;
    } else {
      executable.methodCaller = runRouteOrMiddleFn;
    }
    return executable.methodCaller;
  }
  function deserializeBodyParamsOrThrow(request, executable) {
    const params = request.body[executable.id] || [];
    if (request.bodyType === SerializerModes.binary) return params;
    if (executable.paramsJitFns.restoreFromJson.isNoop) return params;
    try {
      request.body[executable.id] = executable.paramsJitFns.restoreFromJson.fn(params);
      return request.body[executable.id];
    } catch (e) {
      throw new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "serialization-error",
        publicMessage: `Invalid params '${executable.id}', can not deserialize. Parameters might be of the wrong type.`,
        originalError: e,
        errorData: {
          deserializeError: e?.message || "Unknown error"
        }
      });
    }
  }
  function validateParametersOrThrow(params, executable) {
    if (executable.paramsJitFns.isType.isNoop) return;
    if (!executable.paramsJitFns.isType.fn(params)) {
      const validationError = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "validation-error",
        publicMessage: `Invalid params in '${executable.id}', validation failed.`,
        errorData: {
          typeErrors: executable.paramsJitFns.typeErrors.fn(params)
        }
      });
      throw validationError;
    }
  }
  function validateHeaderParamsOrThrow(headers, executable) {
    if (!executable.headersParam.jitFns.isType.fn(headers)) {
      const validationError = new RpcError({
        statusCode: StatusCodes.UNEXPECTED_ERROR,
        type: "validation-error",
        publicMessage: `Invalid params in '${executable.id}', validation failed.`,
        errorData: {
          typeErrors: executable.headersParam.jitFns.typeErrors.fn(headers)
        }
      });
      throw validationError;
    }
  }
  const __ΩQueryBodyResult = ["rawBody", "SerializerCode", "bodyType", "QueryBodyResult", 'P&4!"w"4#Mw$y'];
  function decodeQueryBody(urlQuery, rawBody) {
    if (rawBody)
      return void 0;
    if (!urlQuery)
      return void 0;
    const dataValue = extractDataParam(urlQuery);
    if (!dataValue)
      return void 0;
    return {
      rawBody: fromBase64Url(dataValue),
      bodyType: SerializerModes.stringifyJson
    };
  }
  decodeQueryBody.__type = ["urlQuery", "rawBody", () => __ΩQueryBodyResult, "decodeQueryBody", 'PP&-J2!#2"Pn#-J/$'];
  function extractDataParam(urlQuery) {
    if (urlQuery.startsWith("data=")) {
      const ampIndex2 = urlQuery.indexOf("&", 5);
      return ampIndex2 === -1 ? urlQuery.slice(5) : urlQuery.slice(5, ampIndex2);
    }
    const idx = urlQuery.indexOf("&data=");
    if (idx === -1)
      return void 0;
    const start = idx + 6;
    const ampIndex = urlQuery.indexOf("&", start);
    return ampIndex === -1 ? urlQuery.slice(start) : urlQuery.slice(start, ampIndex);
  }
  extractDataParam.__type = ["urlQuery", "extractDataParam", 'P&2!P&-J/"'];
  const DEFAULT_VERCEL_OPTIONS = {
    defaultResponseHeaders: {}
  };
  let vercelOptions = { ...DEFAULT_VERCEL_OPTIONS };
  let defaultHeaders = [["server", "@mionjs"]];
  function resetVercelHandlerOpts() {
    vercelOptions = { ...DEFAULT_VERCEL_OPTIONS };
    defaultHeaders = [["server", "@mionjs"]];
    resetRouter();
  }
  function setVercelHandlerOpts(options2) {
    vercelOptions = {
      ...vercelOptions,
      ...options2
    };
    defaultHeaders = [["server", "@mionjs"], ...Object.entries(vercelOptions.defaultResponseHeaders)];
    return vercelOptions;
  }
  async function handleRequest(req) {
    const reqUrl = req.url;
    const urlObj = new URL(reqUrl);
    const path = urlObj.pathname;
    const urlQuery = urlObj.search ? urlObj.search.slice(1) : void 0;
    const contentType = req.headers.get("content-type") || "";
    const isBinary = contentType.startsWith("application/octet-stream");
    let rawBody = req.body ? isBinary ? await req.arrayBuffer() : await req.json() : void 0;
    let reqBodyType = isBinary ? SerializerModes.binary : SerializerModes.json;
    const queryBody = decodeQueryBody(urlQuery, rawBody);
    if (queryBody) {
      rawBody = queryBody.rawBody;
      reqBodyType = queryBody.bodyType;
    }
    const responseHeaders = new Headers(defaultHeaders);
    try {
      const platformResp = await dispatchRoute(
        path,
        rawBody,
        req.headers,
        responseHeaders,
        req,
        void 0,
        reqBodyType,
        urlQuery
      );
      return reply(platformResp, responseHeaders);
    } catch (e) {
      const error = e instanceof RpcError ? e : new RpcError({
        publicMessage: "Unknown Error",
        type: "unknown-error",
        originalError: e
      });
      return fatalFail(error, responseHeaders);
    }
  }
  function createVercelHandler() {
    return {
      GET: handleRequest,
      POST: handleRequest,
      PUT: handleRequest,
      DELETE: handleRequest,
      PATCH: handleRequest
    };
  }
  function fatalFail(err, responseHeaders) {
    const routeResponse = getRouterFatalErrorResponse(err, responseHeaders);
    return reply(routeResponse, responseHeaders);
  }
  function reply(mionResp, responseHeaders) {
    const bodyType = mionResp.serializer;
    switch (bodyType) {
      case SerializerModes.stringifyJson: {
        return new Response(mionResp.rawBody, {
          status: mionResp.statusCode,
          headers: responseHeaders
        });
      }
      case SerializerModes.json: {
        return Response.json(mionResp.body, {
          status: mionResp.statusCode,
          headers: responseHeaders
        });
      }
      case SerializerModes.binary: {
        const serializer = mionResp.binSerializer;
        responseHeaders.set("content-length", String(serializer.getLength()));
        const response = new Response(serializer.getBufferView(), {
          status: mionResp.statusCode,
          headers: responseHeaders
        });
        serializer.markAsEnded();
        return response;
      }
      default: {
        const error = new RpcError({
          publicMessage: "unknown-mion-response-format",
          type: "unknown-error",
          errorData: { bodyType }
        });
        return fatalFail(error, responseHeaders);
      }
    }
  }
  const __ΩReturnType = ["T", "args", "", "ReturnType", `l>e"!R"RPde#!P"@2"h"!/#qk#'QRb!Pde"!p)w$y`];
  const __ΩRecord = ["K", "T", "Record", `l'e#"Rb!b"Pde"!N#!w#y`];
  function __assignType$1(fn, args) {
    fn.__type = args;
    return fn;
  }
  const __ΩSimpleUser = ["name", "surname", "SimpleUser", 'P&4!&4"Mw#y'];
  const __ΩDataPoint = ["date", "DataPoint", 'PT4!Mw"y'];
  const __ΩMySharedData = [() => __ΩReturnType, () => getSharedData, "MySharedData", 'i"o!"w#y'];
  const __ΩContext = [() => __ΩCallContext, () => __ΩMySharedData, "Context", 'n"o!"w#y'];
  const getSharedData = () => ({ auth: { me: null } });
  const changeUserName = route(__assignType$1((ctx, user) => {
    return { name: "NewName", surname: user.surname };
  }, [() => __ΩContext, "ctx", () => __ΩSimpleUser, "user", () => __ΩSimpleUser, "", 'Pn!2"n#2$n%/&']));
  const getDate = route(__assignType$1((ctx, dataPoint) => {
    return dataPoint || { date: /* @__PURE__ */ new Date("2022-04-10T02:13:00.000Z") };
  }, [() => __ΩContext, "ctx", () => __ΩDataPoint, "dataPoint", () => __ΩDataPoint, "", 'Pn!2"n#2$8n%/&']));
  const updateHeaders = route(__assignType$1((context) => {
    context.response.headers.set("x-something", "true");
    context.response.headers.set("server", "my-server");
  }, [() => __ΩContext, "context", "", 'Pn!2"$/#']));
  const edgeRoutes = { changeUserName, getDate, updateHeaders };
  (async () => {
    const mionCompile = typeof process !== "undefined" ? process.env?.MION_COMPILE : void 0;
    if (mionCompile === "onlyAOT" || mionCompile === "viteSSR") {
      await initMionRouter(edgeRoutes, {
        contextDataFactory: getSharedData,
        basePath: "api/"
      });
    }
  })();
  const __ΩEdgeSetupOptions = ["basePath", "stringifyJson", "json", "serializer", () => __ΩRecord, "defaultResponseHeaders", "EdgeSetupOptions", `P&4!8P.".#J4$8&&o%#4&8Mw'y`];
  async function setup(options2) {
    resetVercelHandlerOpts();
    resetRouter();
    setVercelHandlerOpts({
      defaultResponseHeaders: options2?.defaultResponseHeaders ?? {}
    });
    await initMionRouter(edgeRoutes, {
      contextDataFactory: getSharedData,
      basePath: "api/",
      serializer: options2?.serializer,
      aot: true
      // Use pre-compiled AOT caches (bundled via virtual modules)
    });
    const handler = createVercelHandler();
    globalThis.handler = handler;
    return handler;
  }
  setup.__type = [() => __ΩEdgeSetupOptions, "options", "setup", 'Pn!2"8"/#'];
  function resetServer() {
    resetVercelHandlerOpts();
    resetRouter();
    globalThis.handler = void 0;
  }
  resetServer.__type = ["resetServer", 'P"/!'];
  const runTypes = {};
  const runTypes$1 = /* @__PURE__ */ _mergeNamespaces({
    __proto__: null,
    default: runTypes
  }, [runTypes]);
  const pureFnsCache = { "mion": { "asJSONString": { namespace: "mion", paramNames: [], code: `if (typeof Bun !== "undefined") return JSON.stringify;
  const STR_ESCAPE = /[\\u0000-\\u001f\\u0022\\u005c\\ud800-\\udfff]/;
  const MAX_SCAPE_TEST_LENGTH = 1e3;
  return function _asJSONStringRegexOnly(str) {
    if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
      return '"' + str + '"';
    } else {
      return JSON.stringify(str);
    }
  };`, fnName: "asJSONString", bodyHash: "4WYkR03dXOzAUe", pureFnDependencies: [], createPureFn: function get_asJSONString() {
    if (typeof Bun !== "undefined") return JSON.stringify;
    const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
    const MAX_SCAPE_TEST_LENGTH = 1e3;
    return function _asJSONStringRegexOnly(str) {
      if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
        return '"' + str + '"';
      } else {
        return JSON.stringify(str);
      }
    };
  }, fn: void 0 }, "getUnknownKeysFromArray": { namespace: "mion", paramNames: [], code: 'const MAX_UNKNOWN_KEYS = 10;\n  return function _getUnknownKeysFromArray(obj, keys) {\n    const unknownKeys = [];\n    for (const prop in obj) {\n      let found = false;\n      for (let j = 0; j < keys.length; j++) {\n        if (keys[j] === prop) {\n          found = true;\n          break;\n        }\n      }\n      if (!found) {\n        unknownKeys.push(prop);\n        if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error("Too many unknown keys");\n      }\n    }\n    return unknownKeys;\n  };', fnName: "getUnknownKeysFromArray", bodyHash: "D2CDXI8OoGLGyW", pureFnDependencies: [], createPureFn: function get_getUnknownKeysFromArray() {
    const MAX_UNKNOWN_KEYS = 10;
    return function _getUnknownKeysFromArray(obj, keys) {
      const unknownKeys = [];
      for (const prop in obj) {
        let found = false;
        for (let j = 0; j < keys.length; j++) {
          if (keys[j] === prop) {
            found = true;
            break;
          }
        }
        if (!found) {
          unknownKeys.push(prop);
          if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error("Too many unknown keys");
        }
      }
      return unknownKeys;
    };
  }, fn: void 0 }, "hasUnknownKeysFromArray": { namespace: "mion", paramNames: [], code: "return function _hasUnknownKeysFromArray(obj, keys) {\n    for (const prop in obj) {\n      let found = false;\n      for (let j = 0; j < keys.length; j++) {\n        if (keys[j] === prop) {\n          found = true;\n          break;\n        }\n      }\n      if (!found) return true;\n    }\n    return false;\n  };", fnName: "hasUnknownKeysFromArray", bodyHash: "K7uzDGNnPwcqQ9", pureFnDependencies: [], createPureFn: function get_hasUnknownKeysFromArray() {
    return function _hasUnknownKeysFromArray(obj, keys) {
      for (const prop in obj) {
        let found = false;
        for (let j = 0; j < keys.length; j++) {
          if (keys[j] === prop) {
            found = true;
            break;
          }
        }
        if (!found) return true;
      }
      return false;
    };
  }, fn: void 0 }, "newRunTypeErr": { namespace: "mion", paramNames: [], code: "return function _err(p\\u03BBth, \\u03B5rr, expected, accessPath) {\n    const path = accessPath?.length ? [...p\\u03BBth, ...accessPath] : [...p\\u03BBth];\n    const runTypeErr = { expected, path };\n    \\u03B5rr.push(runTypeErr);\n  };", fnName: "newRunTypeErr", bodyHash: "eCwDrS1nuSv7ge", pureFnDependencies: [], createPureFn: function get_newRunTypeErr() {
    return function _err(pλth, εrr, expected, accessPath) {
      const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
      const runTypeErr = { expected, path };
      εrr.push(runTypeErr);
    };
  }, fn: void 0 }, "formatErr": { namespace: "mion", paramNames: [], code: "return function _formatErr(p\\u03BBth, \\u03B5rr, expected, fmtName, paramName, paramVal, fmtPath, accessPath, fmtAccessPath) {\n    const path = accessPath?.length ? [...p\\u03BBth, ...accessPath] : [...p\\u03BBth];\n    const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];\n    const format = { name: fmtName, formatPath, val: paramVal };\n    const runTypeErr = { expected, path, format };\n    \\u03B5rr.push(runTypeErr);\n  };", fnName: "formatErr", bodyHash: "2isPiuLWPtohVR", pureFnDependencies: [], createPureFn: function get_formatErr() {
    return function _formatErr(pλth, εrr, expected, fmtName, paramName, paramVal, fmtPath, accessPath, fmtAccessPath) {
      const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
      const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];
      const format = { name: fmtName, formatPath, val: paramVal };
      const runTypeErr = { expected, path, format };
      εrr.push(runTypeErr);
    };
  }, fn: void 0 }, "safeIterableKey": { namespace: "mion", paramNames: [], code: 'return function _safeKey(value) {\n    if (value === void 0) return null;\n    if (value === null) return null;\n    const type = typeof value;\n    if (type === "number" || type === "string" || type === "boolean") return value;\n    return null;\n  };', fnName: "safeIterableKey", bodyHash: "BrjL47E-GRjUpQ", pureFnDependencies: [], createPureFn: function get_safeIterableKey() {
    return function _safeKey(value) {
      if (value === void 0) return null;
      if (value === null) return null;
      const type = typeof value;
      if (type === "number" || type === "string" || type === "boolean") return value;
      return null;
    };
  }, fn: void 0 } } };
  const jitFnsCache = { "is_cm6MsK": { isNoop: false, typeName: "Record", fnID: "is", jitFnHash: "is_cm6MsK", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_zxRrbt = utl.getJIT("is_zxRrbt"); return function is_cm6MsK(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_zxRrbt.fn(v[p0]))) return false;} return true;})())}`, jitDependencies: ["is_zxRrbt"], pureFnDependencies: [], createJitFn: function get_is_cm6MsK(utl) {
    const is_zxRrbt = utl.getJIT("is_zxRrbt");
    return function is_cm6MsK(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && (function() {
        for (const p0 in v) {
          if (!is_zxRrbt.fn(v[p0])) return false;
        }
        return true;
      })();
    };
  }, fn: void 0 }, "is_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "is", jitFnHash: "is_zxRrbt", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_WEWIGI = utl.getJIT("is_WEWIGI"); return function is_zxRrbt(v){return (typeof v === 'object' && v !== null && v["mion@isΣrrθr"] === true && typeof v.type === 'string' && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && typeof v.publicMessage === 'string' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)) && (v.statusCode === undefined || Number.isFinite(v.statusCode)))}`, jitDependencies: ["is_WEWIGI"], pureFnDependencies: [], createJitFn: function get_is_zxRrbt(utl) {
    const is_WEWIGI = utl.getJIT("is_WEWIGI");
    return function is_zxRrbt(v) {
      return typeof v === "object" && v !== null && v["mion@isΣrrθr"] === true && typeof v.type === "string" && (v.id === void 0 || (Number.isFinite(v.id) || typeof v.id === "string")) && typeof v.publicMessage === "string" && (v.errorData === void 0 || is_WEWIGI.fn(v.errorData)) && (v.statusCode === void 0 || Number.isFinite(v.statusCode));
    };
  }, fn: void 0 }, "is_WEWIGI": { isNoop: false, typeName: "Readonly", fnID: "is", jitFnHash: "is_WEWIGI", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_WEWIGI(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(true)) return false;} return true;})())}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_WEWIGI(utl) {
    return function is_WEWIGI(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && /* @__PURE__ */ (function() {
        return true;
      })();
    };
  }, fn: void 0 }, "te_cm6MsK": { isNoop: false, typeName: "Record", fnID: "te", jitFnHash: "te_cm6MsK", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const te_zxRrbt = utl.getJIT("te_zxRrbt");
const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_cm6MsK(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'))) {
 Iqa2M8Ms(pth,er,"object");
 } else {
 for (const p0 in v) {pth.push(p0); te_zxRrbt.fn(v[p0],pth,er); pth.splice(-1);}
 }
 ; return er}`, jitDependencies: ["te_zxRrbt"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_cm6MsK(utl) {
    const te_zxRrbt = utl.getJIT("te_zxRrbt");
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_cm6MsK(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]"))) {
        Iqa2M8Ms(pth, er, "object");
      } else {
        for (const p0 in v) {
          pth.push(p0);
          te_zxRrbt.fn(v[p0], pth, er);
          pth.splice(-1);
        }
      }
      return er;
    };
  }, fn: void 0 }, "te_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "te", jitFnHash: "te_zxRrbt", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
const te_WEWIGI = utl.getJIT("te_WEWIGI"); return function te_zxRrbt(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null)) {
 Iqa2M8Ms(pth,er,"class");
 } else {
 if (v["mion@isΣrrθr"] !== true) Iqa2M8Ms(pth,er,"literal",["mion@isΣrrθr"]);if (typeof v.type !== 'string') Iqa2M8Ms(pth,er,"string",["type"]);if (v.id !== undefined) {if (!(Number.isFinite(v.id) || typeof v.id === 'string')) Iqa2M8Ms(pth,er,"union",["id"]);};if (typeof v.publicMessage !== 'string') Iqa2M8Ms(pth,er,"string",["publicMessage"]);if (v.errorData !== undefined) {pth.push("errorData"); te_WEWIGI.fn(v.errorData,pth,er); pth.splice(-1);};if (v.statusCode !== undefined) {if(!(Number.isFinite(v.statusCode))) Iqa2M8Ms(pth,er,"number",["statusCode"]);}
 }
 ; return er}`, jitDependencies: ["te_WEWIGI"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_zxRrbt(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    const te_WEWIGI = utl.getJIT("te_WEWIGI");
    return function te_zxRrbt(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null)) {
        Iqa2M8Ms(pth, er, "class");
      } else {
        if (v["mion@isΣrrθr"] !== true) Iqa2M8Ms(pth, er, "literal", ["mion@isΣrrθr"]);
        if (typeof v.type !== "string") Iqa2M8Ms(pth, er, "string", ["type"]);
        if (v.id !== void 0) {
          if (!(Number.isFinite(v.id) || typeof v.id === "string")) Iqa2M8Ms(pth, er, "union", ["id"]);
        }
        if (typeof v.publicMessage !== "string") Iqa2M8Ms(pth, er, "string", ["publicMessage"]);
        if (v.errorData !== void 0) {
          pth.push("errorData");
          te_WEWIGI.fn(v.errorData, pth, er);
          pth.splice(-1);
        }
        if (v.statusCode !== void 0) {
          if (!Number.isFinite(v.statusCode)) Iqa2M8Ms(pth, er, "number", ["statusCode"]);
        }
      }
      return er;
    };
  }, fn: void 0 }, "te_WEWIGI": { isNoop: false, typeName: "Readonly", fnID: "te", jitFnHash: "te_WEWIGI", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_WEWIGI(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'))) {
 Iqa2M8Ms(pth,er,"object");
 } else {
 
 }
 ; return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_WEWIGI(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_WEWIGI(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]"))) {
        Iqa2M8Ms(pth, er, "object");
      }
      return er;
    };
  }, fn: void 0 }, "tj_cm6MsK": { isNoop: false, typeName: "Record", fnID: "tj", jitFnHash: "tj_cm6MsK", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const tj_zxRrbt = utl.getJIT("tj_zxRrbt"); return function tj_cm6MsK(v){for (const p0 in v){ v[p0] = tj_zxRrbt.fn(v[p0]);} return v}`, jitDependencies: ["tj_zxRrbt"], pureFnDependencies: [], createJitFn: function get_tj_cm6MsK(utl) {
    const tj_zxRrbt = utl.getJIT("tj_zxRrbt");
    return function tj_cm6MsK(v) {
      for (const p0 in v) {
        v[p0] = tj_zxRrbt.fn(v[p0]);
      }
      return v;
    };
  }, fn: void 0 }, "tj_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "tj", jitFnHash: "tj_zxRrbt", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json encode union: item does not belong to the union"; return function tj_zxRrbt(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/}else {throw new Error(uErr0);}} return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_zxRrbt(utl) {
    const uErr0 = "Can not json encode union: item does not belong to the union";
    return function tj_zxRrbt(v) {
      if (v.id !== void 0) {
        if (Number.isFinite(v.id)) ;
        else if (typeof v.id === "string") ;
        else {
          throw new Error(uErr0);
        }
      }
      return v;
    };
  }, fn: void 0 }, "tj_WEWIGI": { isNoop: true, typeName: "Readonly", fnID: "tj", jitFnHash: "tj_WEWIGI", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_WEWIGI(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_WEWIGI(utl) {
    return function tj_WEWIGI(v) {
      return v;
    };
  }, fn: void 0 }, "fj_cm6MsK": { isNoop: false, typeName: "Record", fnID: "fj", jitFnHash: "fj_cm6MsK", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const fj_zxRrbt = utl.getJIT("fj_zxRrbt"); return function fj_cm6MsK(v){for (const p0 in v){ v[p0] = fj_zxRrbt.fn(v[p0]);} return v}`, jitDependencies: ["fj_zxRrbt"], pureFnDependencies: [], createJitFn: function get_fj_cm6MsK(utl) {
    const fj_zxRrbt = utl.getJIT("fj_zxRrbt");
    return function fj_cm6MsK(v) {
      for (const p0 in v) {
        v[p0] = fj_zxRrbt.fn(v[p0]);
      }
      return v;
    };
  }, fn: void 0 }, "fj_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "fj", jitFnHash: "fj_zxRrbt", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json decode union: invalid union index"; return function fj_zxRrbt(v){
 if (v.id !== undefined) {
 if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === 'number') {
 const dec0 = v.id[0]; v.id = v.id[1];
 if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}
 else {throw new Error(uErr0)}
 }
 ;};
 let desFn1 = utl.getDeserializeFn("RpcError");
 if (desFn1) {v = desFn1(v)}
 else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}
 ; return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_zxRrbt(utl) {
    const uErr0 = "Can not json decode union: invalid union index";
    return function fj_zxRrbt(v) {
      if (v.id !== void 0) {
        if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === "number") {
          const dec0 = v.id[0];
          v.id = v.id[1];
          if (dec0 === 0) ;
          else if (dec0 === 1) ;
          else {
            throw new Error(uErr0);
          }
        }
      }
      let desFn1 = utl.getDeserializeFn("RpcError");
      if (desFn1) {
        v = desFn1(v);
      } else if (desFn1 = utl.getSerializeClass("RpcError")) {
        v = new desFn1(v);
      }
      return v;
    };
  }, fn: void 0 }, "fj_WEWIGI": { isNoop: true, typeName: "Readonly", fnID: "fj", jitFnHash: "fj_WEWIGI", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_WEWIGI(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_WEWIGI(utl) {
    return function fj_WEWIGI(v) {
      return v;
    };
  }, fn: void 0 }, "sj_cm6MsK": { isNoop: false, typeName: "Record", fnID: "sj", jitFnHash: "sj_cm6MsK", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_zxRrbt = utl.getJIT("sj_zxRrbt");
const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_cm6MsK(v){return (function(){const ns0 = [];ns0.push((function(){
 const ls1 = [];
 for (const p1 in v) {
 
 if (p1 !== undefined) ls1.push(zT3pfXdp(p1) + ':' + sj_zxRrbt.fn(v[p1]));
 }
 if (!ls1.length) return '';
 return ls1.join(',');
 })());return '{'+ns0.join(',')+'}'})()}`, jitDependencies: ["sj_zxRrbt"], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_cm6MsK(utl) {
    const sj_zxRrbt = utl.getJIT("sj_zxRrbt");
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_cm6MsK(v) {
      return (function() {
        const ns0 = [];
        ns0.push((function() {
          const ls1 = [];
          for (const p1 in v) {
            if (p1 !== void 0) ls1.push(zT3pfXdp(p1) + ":" + sj_zxRrbt.fn(v[p1]));
          }
          if (!ls1.length) return "";
          return ls1.join(",");
        })());
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "sj_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "sj", jitFnHash: "sj_zxRrbt", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not StringifyJson union: item does not belong to the union";
const sj_WEWIGI = utl.getJIT("sj_WEWIGI"); return function sj_zxRrbt(v){return '{'+(v.id === undefined ? '' : '"id":'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === 'string') {return JSON.stringify(v.id)}else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? '' : '"errorData":'+sj_WEWIGI.fn(v.errorData)+",")+(v.statusCode === undefined ? '' : '"statusCode":'+v.statusCode+",")+"\\"mion@isΣrrθr\\""+':'+(v["mion@isΣrrθr"] ? 'true' : 'false')+","+'"type":'+JSON.stringify(v.type)+","+'"publicMessage":'+JSON.stringify(v.publicMessage)+'}'}`, jitDependencies: ["sj_WEWIGI"], pureFnDependencies: [], createJitFn: function get_sj_zxRrbt(utl) {
    const uErr0 = "Can not StringifyJson union: item does not belong to the union";
    const sj_WEWIGI = utl.getJIT("sj_WEWIGI");
    return function sj_zxRrbt(v) {
      return "{" + (v.id === void 0 ? "" : '"id":' + (function() {
        if (Number.isFinite(v.id)) {
          return v.id;
        } else if (typeof v.id === "string") {
          return JSON.stringify(v.id);
        } else {
          throw new Error(uErr0);
        }
      })() + ",") + (v.errorData === void 0 ? "" : '"errorData":' + sj_WEWIGI.fn(v.errorData) + ",") + (v.statusCode === void 0 ? "" : '"statusCode":' + v.statusCode + ",") + '"mion@isΣrrθr":' + (v["mion@isΣrrθr"] ? "true" : "false") + ',"type":' + JSON.stringify(v.type) + ',"publicMessage":' + JSON.stringify(v.publicMessage) + "}";
    };
  }, fn: void 0 }, "sj_WEWIGI": { isNoop: false, typeName: "Readonly", fnID: "sj", jitFnHash: "sj_WEWIGI", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_WEWIGI(v){return (function(){const ns0 = [];ns0.push((function(){
 const ls1 = [];
 for (const p1 in v) {
 
 if (p1 !== undefined) ls1.push(zT3pfXdp(p1) + ':' + JSON.stringify(v[p1]));
 }
 if (!ls1.length) return '';
 return ls1.join(',');
 })());return '{'+ns0.join(',')+'}'})()}`, jitDependencies: [], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_WEWIGI(utl) {
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_WEWIGI(v) {
      return (function() {
        const ns0 = [];
        ns0.push((function() {
          const ls1 = [];
          for (const p1 in v) {
            if (p1 !== void 0) ls1.push(zT3pfXdp(p1) + ":" + JSON.stringify(v[p1]));
          }
          if (!ls1.length) return "";
          return ls1.join(",");
        })());
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "tBi_cm6MsK": { isNoop: false, typeName: "Record", fnID: "tBi", jitFnHash: "tBi_cm6MsK", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_zxRrbt = utl.getJIT("tBi_zxRrbt"); return function tBi_cm6MsK(v,Ser){
 let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;
 for (const p0 in v) {Ser.serString(p0); tBi_zxRrbt.fn(v[p0],Ser); cnt0++;}
 Ser.view.setUint32(piI0, cnt0, 1);
 ; return Ser}`, jitDependencies: ["tBi_zxRrbt"], pureFnDependencies: [], createJitFn: function get_tBi_cm6MsK(utl) {
    const tBi_zxRrbt = utl.getJIT("tBi_zxRrbt");
    return function tBi_cm6MsK(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        tBi_zxRrbt.fn(v[p0], Ser);
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "tBi_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "tBi", jitFnHash: "tBi_zxRrbt", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const uErr1 = "Can not encode union to binary: item does not belong to the union";
const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_zxRrbt(v,Ser){;Ser.serString(v.type);Ser.serString(v.publicMessage);
const bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === 'string') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);}else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.statusCode !== undefined) {Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.setBitMask(bmI0, 2 & 7)} return Ser}`, jitDependencies: ["tBi_WEWIGI"], pureFnDependencies: [], createJitFn: function get_tBi_zxRrbt(utl) {
    const uErr1 = "Can not encode union to binary: item does not belong to the union";
    const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
    return function tBi_zxRrbt(v, Ser) {
      Ser.serString(v.type);
      Ser.serString(v.publicMessage);
      const bmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v.id !== void 0) {
        if (Number.isFinite(v.id)) {
          Ser.view.setUint8(Ser.index++, 0);
          Ser.view.setFloat64(Ser.index, v.id, 1, Ser.index += 8);
        } else if (typeof v.id === "string") {
          Ser.view.setUint8(Ser.index++, 1);
          Ser.serString(v.id);
        } else {
          throw new Error(uErr1);
        }
        Ser.setBitMask(bmI0, 0 & 7);
      }
      if (v.errorData !== void 0) {
        tBi_WEWIGI.fn(v.errorData, Ser);
        Ser.setBitMask(bmI0, 1 & 7);
      }
      if (v.statusCode !== void 0) {
        Ser.view.setFloat64(Ser.index, v.statusCode, 1, Ser.index += 8);
        Ser.setBitMask(bmI0, 2 & 7);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_WEWIGI": { isNoop: false, typeName: "Readonly", fnID: "tBi", jitFnHash: "tBi_WEWIGI", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_WEWIGI(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); Ser.serString(JSON.stringify(v[p0])); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_WEWIGI(utl) {
    return function tBi_WEWIGI(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        Ser.serString(JSON.stringify(v[p0]));
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "fBi_cm6MsK": { isNoop: false, typeName: "Record", fnID: "fBi", jitFnHash: "fBi_cm6MsK", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_zxRrbt = utl.getJIT("fBi_zxRrbt"); return function fBi_cm6MsK(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_zxRrbt.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_zxRrbt"], pureFnDependencies: [], createJitFn: function get_fBi_cm6MsK(utl) {
    const fBi_zxRrbt = utl.getJIT("fBi_zxRrbt");
    return function fBi_cm6MsK(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = fBi_zxRrbt.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_zxRrbt": { isNoop: false, typeName: "RpcError", fnID: "fBi", jitFnHash: "fBi_zxRrbt", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const uErr1 = "Can not binary decode union: invalid union index";
const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_zxRrbt(ret,Des){ret = {"mion@isΣrrθr":true,type:Des.desString(),publicMessage:Des.desString()}

const bimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
 const dec1 = Des.view.getUint8(Des.index++);
 if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}
 else {throw new Error(uErr1)}
 ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}`, jitDependencies: ["fBi_WEWIGI"], pureFnDependencies: [], createJitFn: function get_fBi_zxRrbt(utl) {
    const uErr1 = "Can not binary decode union: invalid union index";
    const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
    return function fBi_zxRrbt(ret, Des) {
      ret = { "mion@isΣrrθr": true, type: Des.desString(), publicMessage: Des.desString() };
      const bimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(bimI0, 1) & 1 << (0 & 7)) {
        const dec1 = Des.view.getUint8(Des.index++);
        if (dec1 === 0) {
          ret.id = Des.view.getFloat64(Des.index, 1, Des.index += 8);
        } else if (dec1 === 1) {
          ret.id = Des.desString();
        } else {
          throw new Error(uErr1);
        }
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (1 & 7)) {
        ret.errorData = fBi_WEWIGI.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (2 & 7)) {
        ret.statusCode = Des.view.getFloat64(Des.index, 1, Des.index += 8);
      }
      let desFn0 = utl.getDeserializeFn("RpcError");
      if (desFn0) {
        ret = desFn0(ret);
      } else if (desFn0 = utl.getSerializeClass("RpcError")) {
        ret = new desFn0(ret);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_WEWIGI": { isNoop: false, typeName: "Readonly", fnID: "fBi", jitFnHash: "fBi_WEWIGI", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_WEWIGI(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = JSON.parse(Des.desString());} return ret}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_WEWIGI(utl) {
    return function fBi_WEWIGI(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = JSON.parse(Des.desString());
      }
      return ret;
    };
  }, fn: void 0 }, "is_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "is", jitFnHash: "is_a8UQwC", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_WEWIGI = utl.getJIT("is_WEWIGI"); return function is_a8UQwC(v){return (typeof v === 'object' && v !== null && v["mion@isΣrrθr"] === true && v.type === "route-not-found" && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && typeof v.publicMessage === 'string' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)) && (v.statusCode === undefined || Number.isFinite(v.statusCode)))}`, jitDependencies: ["is_WEWIGI"], pureFnDependencies: [], createJitFn: function get_is_a8UQwC(utl) {
    const is_WEWIGI = utl.getJIT("is_WEWIGI");
    return function is_a8UQwC(v) {
      return typeof v === "object" && v !== null && v["mion@isΣrrθr"] === true && v.type === "route-not-found" && (v.id === void 0 || (Number.isFinite(v.id) || typeof v.id === "string")) && typeof v.publicMessage === "string" && (v.errorData === void 0 || is_WEWIGI.fn(v.errorData)) && (v.statusCode === void 0 || Number.isFinite(v.statusCode));
    };
  }, fn: void 0 }, "te_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "te", jitFnHash: "te_a8UQwC", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
const te_WEWIGI = utl.getJIT("te_WEWIGI"); return function te_a8UQwC(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null)) {
 Iqa2M8Ms(pth,er,"class");
 } else {
 if (v["mion@isΣrrθr"] !== true) Iqa2M8Ms(pth,er,"literal",["mion@isΣrrθr"]);if (v.type !== "route-not-found") Iqa2M8Ms(pth,er,"literal",["type"]);if (v.id !== undefined) {if (!(Number.isFinite(v.id) || typeof v.id === 'string')) Iqa2M8Ms(pth,er,"union",["id"]);};if (typeof v.publicMessage !== 'string') Iqa2M8Ms(pth,er,"string",["publicMessage"]);if (v.errorData !== undefined) {pth.push("errorData"); te_WEWIGI.fn(v.errorData,pth,er); pth.splice(-1);};if (v.statusCode !== undefined) {if(!(Number.isFinite(v.statusCode))) Iqa2M8Ms(pth,er,"number",["statusCode"]);}
 }
 ; return er}`, jitDependencies: ["te_WEWIGI"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_a8UQwC(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    const te_WEWIGI = utl.getJIT("te_WEWIGI");
    return function te_a8UQwC(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null)) {
        Iqa2M8Ms(pth, er, "class");
      } else {
        if (v["mion@isΣrrθr"] !== true) Iqa2M8Ms(pth, er, "literal", ["mion@isΣrrθr"]);
        if (v.type !== "route-not-found") Iqa2M8Ms(pth, er, "literal", ["type"]);
        if (v.id !== void 0) {
          if (!(Number.isFinite(v.id) || typeof v.id === "string")) Iqa2M8Ms(pth, er, "union", ["id"]);
        }
        if (typeof v.publicMessage !== "string") Iqa2M8Ms(pth, er, "string", ["publicMessage"]);
        if (v.errorData !== void 0) {
          pth.push("errorData");
          te_WEWIGI.fn(v.errorData, pth, er);
          pth.splice(-1);
        }
        if (v.statusCode !== void 0) {
          if (!Number.isFinite(v.statusCode)) Iqa2M8Ms(pth, er, "number", ["statusCode"]);
        }
      }
      return er;
    };
  }, fn: void 0 }, "tj_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "tj", jitFnHash: "tj_a8UQwC", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json encode union: item does not belong to the union"; return function tj_a8UQwC(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/}else {throw new Error(uErr0);}} return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_a8UQwC(utl) {
    const uErr0 = "Can not json encode union: item does not belong to the union";
    return function tj_a8UQwC(v) {
      if (v.id !== void 0) {
        if (Number.isFinite(v.id)) ;
        else if (typeof v.id === "string") ;
        else {
          throw new Error(uErr0);
        }
      }
      return v;
    };
  }, fn: void 0 }, "fj_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "fj", jitFnHash: "fj_a8UQwC", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json decode union: invalid union index"; return function fj_a8UQwC(v){
 if (v.id !== undefined) {
 if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === 'number') {
 const dec0 = v.id[0]; v.id = v.id[1];
 if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}
 else {throw new Error(uErr0)}
 }
 ;};
 let desFn1 = utl.getDeserializeFn("RpcError");
 if (desFn1) {v = desFn1(v)}
 else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}
 ; return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_a8UQwC(utl) {
    const uErr0 = "Can not json decode union: invalid union index";
    return function fj_a8UQwC(v) {
      if (v.id !== void 0) {
        if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === "number") {
          const dec0 = v.id[0];
          v.id = v.id[1];
          if (dec0 === 0) ;
          else if (dec0 === 1) ;
          else {
            throw new Error(uErr0);
          }
        }
      }
      let desFn1 = utl.getDeserializeFn("RpcError");
      if (desFn1) {
        v = desFn1(v);
      } else if (desFn1 = utl.getSerializeClass("RpcError")) {
        v = new desFn1(v);
      }
      return v;
    };
  }, fn: void 0 }, "sj_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "sj", jitFnHash: "sj_a8UQwC", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not StringifyJson union: item does not belong to the union";
const sj_WEWIGI = utl.getJIT("sj_WEWIGI"); return function sj_a8UQwC(v){return '{'+(v.id === undefined ? '' : '"id":'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === 'string') {return JSON.stringify(v.id)}else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? '' : '"errorData":'+sj_WEWIGI.fn(v.errorData)+",")+(v.statusCode === undefined ? '' : '"statusCode":'+v.statusCode+",")+"\\"mion@isΣrrθr\\""+':'+(v["mion@isΣrrθr"] ? 'true' : 'false')+","+'"type":'+JSON.stringify(v.type)+","+'"publicMessage":'+JSON.stringify(v.publicMessage)+'}'}`, jitDependencies: ["sj_WEWIGI"], pureFnDependencies: [], createJitFn: function get_sj_a8UQwC(utl) {
    const uErr0 = "Can not StringifyJson union: item does not belong to the union";
    const sj_WEWIGI = utl.getJIT("sj_WEWIGI");
    return function sj_a8UQwC(v) {
      return "{" + (v.id === void 0 ? "" : '"id":' + (function() {
        if (Number.isFinite(v.id)) {
          return v.id;
        } else if (typeof v.id === "string") {
          return JSON.stringify(v.id);
        } else {
          throw new Error(uErr0);
        }
      })() + ",") + (v.errorData === void 0 ? "" : '"errorData":' + sj_WEWIGI.fn(v.errorData) + ",") + (v.statusCode === void 0 ? "" : '"statusCode":' + v.statusCode + ",") + '"mion@isΣrrθr":' + (v["mion@isΣrrθr"] ? "true" : "false") + ',"type":' + JSON.stringify(v.type) + ',"publicMessage":' + JSON.stringify(v.publicMessage) + "}";
    };
  }, fn: void 0 }, "tBi_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "tBi", jitFnHash: "tBi_a8UQwC", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const uErr1 = "Can not encode union to binary: item does not belong to the union";
const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_a8UQwC(v,Ser){;Ser.serString(v.publicMessage);
const bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === 'string') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);}else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.statusCode !== undefined) {Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.setBitMask(bmI0, 2 & 7)} return Ser}`, jitDependencies: ["tBi_WEWIGI"], pureFnDependencies: [], createJitFn: function get_tBi_a8UQwC(utl) {
    const uErr1 = "Can not encode union to binary: item does not belong to the union";
    const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
    return function tBi_a8UQwC(v, Ser) {
      Ser.serString(v.publicMessage);
      const bmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v.id !== void 0) {
        if (Number.isFinite(v.id)) {
          Ser.view.setUint8(Ser.index++, 0);
          Ser.view.setFloat64(Ser.index, v.id, 1, Ser.index += 8);
        } else if (typeof v.id === "string") {
          Ser.view.setUint8(Ser.index++, 1);
          Ser.serString(v.id);
        } else {
          throw new Error(uErr1);
        }
        Ser.setBitMask(bmI0, 0 & 7);
      }
      if (v.errorData !== void 0) {
        tBi_WEWIGI.fn(v.errorData, Ser);
        Ser.setBitMask(bmI0, 1 & 7);
      }
      if (v.statusCode !== void 0) {
        Ser.view.setFloat64(Ser.index, v.statusCode, 1, Ser.index += 8);
        Ser.setBitMask(bmI0, 2 & 7);
      }
      return Ser;
    };
  }, fn: void 0 }, "fBi_a8UQwC": { isNoop: false, typeName: "RpcError", fnID: "fBi", jitFnHash: "fBi_a8UQwC", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const uErr1 = "Can not binary decode union: invalid union index";
const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_a8UQwC(ret,Des){ret = {"mion@isΣrrθr":true,type:"route-not-found",publicMessage:Des.desString()}

const bimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
 const dec1 = Des.view.getUint8(Des.index++);
 if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}
 else {throw new Error(uErr1)}
 ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}`, jitDependencies: ["fBi_WEWIGI"], pureFnDependencies: [], createJitFn: function get_fBi_a8UQwC(utl) {
    const uErr1 = "Can not binary decode union: invalid union index";
    const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
    return function fBi_a8UQwC(ret, Des) {
      ret = { "mion@isΣrrθr": true, type: "route-not-found", publicMessage: Des.desString() };
      const bimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(bimI0, 1) & 1 << (0 & 7)) {
        const dec1 = Des.view.getUint8(Des.index++);
        if (dec1 === 0) {
          ret.id = Des.view.getFloat64(Des.index, 1, Des.index += 8);
        } else if (dec1 === 1) {
          ret.id = Des.desString();
        } else {
          throw new Error(uErr1);
        }
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (1 & 7)) {
        ret.errorData = fBi_WEWIGI.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (2 & 7)) {
        ret.statusCode = Des.view.getFloat64(Des.index, 1, Des.index += 8);
      }
      let desFn0 = utl.getDeserializeFn("RpcError");
      if (desFn0) {
        ret = desFn0(ret);
      } else if (desFn0 = utl.getSerializeClass("RpcError")) {
        ret = new desFn0(ret);
      }
      return ret;
    };
  }, fn: void 0 }, "is_JtnVhp": { isNoop: false, typeName: "params", fnID: "is", jitFnHash: "is_JtnVhp", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_b1N57x = utl.getJIT("is_b1N57x"); return function is_JtnVhp(v){return (v.length <= 2 && is_b1N57x.fn(v[0]) && (v[1] === undefined || (typeof v[1] === 'boolean')))}`, jitDependencies: ["is_b1N57x"], pureFnDependencies: [], createJitFn: function get_is_JtnVhp(utl) {
    const is_b1N57x = utl.getJIT("is_b1N57x");
    return function is_JtnVhp(v) {
      return v.length <= 2 && is_b1N57x.fn(v[0]) && (v[1] === void 0 || typeof v[1] === "boolean");
    };
  }, fn: void 0 }, "is_b1N57x": { isNoop: false, typeName: "array", fnID: "is", jitFnHash: "is_b1N57x", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_b1N57x(v){\n if (!Array.isArray(v)) return false;\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = typeof v[i0] === 'string';\n if (!(res0)) return false;\n }\n return true;\n }", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_b1N57x(utl) {
    return function is_b1N57x(v) {
      if (!Array.isArray(v)) return false;
      for (let i0 = 0; i0 < v.length; i0++) {
        const res0 = typeof v[i0] === "string";
        if (!res0) return false;
      }
      return true;
    };
  }, fn: void 0 }, "te_JtnVhp": { isNoop: false, typeName: "params", fnID: "te", jitFnHash: "te_JtnVhp", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const te_b1N57x = utl.getJIT("te_b1N57x");
const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_JtnVhp(v,pth=[],er=[]){if (v.length > 2) Iqa2M8Ms(pth,er,"params"); else {pth.push(0); te_b1N57x.fn(v[0],pth,er); pth.splice(-1);if (v[1] !== undefined) {if (typeof v[1] !== 'boolean') Iqa2M8Ms(pth,er,"boolean",[1]);}} return er}`, jitDependencies: ["te_b1N57x"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_JtnVhp(utl) {
    const te_b1N57x = utl.getJIT("te_b1N57x");
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_JtnVhp(v, pth = [], er = []) {
      if (v.length > 2) Iqa2M8Ms(pth, er, "params");
      else {
        pth.push(0);
        te_b1N57x.fn(v[0], pth, er);
        pth.splice(-1);
        if (v[1] !== void 0) {
          if (typeof v[1] !== "boolean") Iqa2M8Ms(pth, er, "boolean", [1]);
        }
      }
      return er;
    };
  }, fn: void 0 }, "te_b1N57x": { isNoop: false, typeName: "array", fnID: "te", jitFnHash: "te_b1N57x", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_b1N57x(v,pth=[],er=[]){if (!Array.isArray(v)) {Iqa2M8Ms(pth,er,"array")} else {for (let i0 = 0; i0 < v.length; i0++) {if (typeof v[i0] !== 'string') Iqa2M8Ms(pth,er,"string",[i0]);}} return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_b1N57x(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_b1N57x(v, pth = [], er = []) {
      if (!Array.isArray(v)) {
        Iqa2M8Ms(pth, er, "array");
      } else {
        for (let i0 = 0; i0 < v.length; i0++) {
          if (typeof v[i0] !== "string") Iqa2M8Ms(pth, er, "string", [i0]);
        }
      }
      return er;
    };
  }, fn: void 0 }, "tj_JtnVhp": { isNoop: false, typeName: "params", fnID: "tj", jitFnHash: "tj_JtnVhp", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_JtnVhp(v){if (v[1] === undefined ) {if (v.length > 1) v[1] = null} return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_JtnVhp(utl) {
    return function tj_JtnVhp(v) {
      if (v[1] === void 0) {
        if (v.length > 1) v[1] = null;
      }
      return v;
    };
  }, fn: void 0 }, "tj_b1N57x": { isNoop: true, typeName: "array", fnID: "tj", jitFnHash: "tj_b1N57x", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_b1N57x(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_b1N57x(utl) {
    return function tj_b1N57x(v) {
      return v;
    };
  }, fn: void 0 }, "fj_JtnVhp": { isNoop: false, typeName: "params", fnID: "fj", jitFnHash: "fj_JtnVhp", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_JtnVhp(v){if (v[1] === null ) {v[1] = undefined} return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_JtnVhp(utl) {
    return function fj_JtnVhp(v) {
      if (v[1] === null) {
        v[1] = void 0;
      }
      return v;
    };
  }, fn: void 0 }, "fj_b1N57x": { isNoop: true, typeName: "array", fnID: "fj", jitFnHash: "fj_b1N57x", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_b1N57x(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_b1N57x(utl) {
    return function fj_b1N57x(v) {
      return v;
    };
  }, fn: void 0 }, "sj_JtnVhp": { isNoop: false, typeName: "params", fnID: "sj", jitFnHash: "sj_JtnVhp", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_b1N57x = utl.getJIT("sj_b1N57x"); return function sj_JtnVhp(v){return '['+sj_b1N57x.fn(v[0])+(v[1] === undefined ? ','+'null' : ','+(v[1] ? 'true' : 'false'))+']'}`, jitDependencies: ["sj_b1N57x"], pureFnDependencies: [], createJitFn: function get_sj_JtnVhp(utl) {
    const sj_b1N57x = utl.getJIT("sj_b1N57x");
    return function sj_JtnVhp(v) {
      return "[" + sj_b1N57x.fn(v[0]) + (v[1] === void 0 ? ",null" : "," + (v[1] ? "true" : "false")) + "]";
    };
  }, fn: void 0 }, "sj_b1N57x": { isNoop: false, typeName: "array", fnID: "sj", jitFnHash: "sj_b1N57x", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function sj_b1N57x(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = JSON.stringify(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_b1N57x(utl) {
    return function sj_b1N57x(v) {
      const ls0 = [];
      for (let i0 = 0; i0 < v.length; i0++) {
        const res0 = JSON.stringify(v[i0]);
        ls0.push(res0);
      }
      return "[" + ls0.join(",") + "]";
    };
  }, fn: void 0 }, "tBi_JtnVhp": { isNoop: false, typeName: "params", fnID: "tBi", jitFnHash: "tBi_JtnVhp", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_b1N57x = utl.getJIT("tBi_b1N57x"); return function tBi_JtnVhp(v,Ser){const tbmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v[0] !== undefined) {tBi_b1N57x.fn(v[0],Ser);Ser.setBitMask(tbmI0, 0)} if (v[1] !== undefined) {Ser.view.setUint8(Ser.index++, !!v[1]);Ser.setBitMask(tbmI0, 1)} ; return Ser}`, jitDependencies: ["tBi_b1N57x"], pureFnDependencies: [], createJitFn: function get_tBi_JtnVhp(utl) {
    const tBi_b1N57x = utl.getJIT("tBi_b1N57x");
    return function tBi_JtnVhp(v, Ser) {
      const tbmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v[0] !== void 0) {
        tBi_b1N57x.fn(v[0], Ser);
        Ser.setBitMask(tbmI0, 0);
      }
      if (v[1] !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v[1]);
        Ser.setBitMask(tbmI0, 1);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_b1N57x": { isNoop: false, typeName: "array", fnID: "tBi", jitFnHash: "tBi_b1N57x", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_b1N57x(v,Ser){\n Ser.view.setUint32(Ser.index, v.length, 1); Ser.index += 4;\n for (let i0 = 0; i0 < v.length; i0++) {Ser.serString(v[i0]);}\n ; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_b1N57x(utl) {
    return function tBi_b1N57x(v, Ser) {
      Ser.view.setUint32(Ser.index, v.length, 1);
      Ser.index += 4;
      for (let i0 = 0; i0 < v.length; i0++) {
        Ser.serString(v[i0]);
      }
      return Ser;
    };
  }, fn: void 0 }, "fBi_JtnVhp": { isNoop: false, typeName: "params", fnID: "fBi", jitFnHash: "fBi_JtnVhp", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_b1N57x = utl.getJIT("fBi_b1N57x"); return function fBi_JtnVhp(ret,Des){ret = [];const tbimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(tbimI0, 1) & (1 << (0))) {ret[0] = fBi_b1N57x.fn(undefined,Des)} if (Des.view.getUint8(tbimI0, 1) & (1 << (1))) {ret[1] = Des.view.getUint8(Des.index++) === 1} ; return ret}`, jitDependencies: ["fBi_b1N57x"], pureFnDependencies: [], createJitFn: function get_fBi_JtnVhp(utl) {
    const fBi_b1N57x = utl.getJIT("fBi_b1N57x");
    return function fBi_JtnVhp(ret, Des) {
      ret = [];
      const tbimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(tbimI0, 1) & 1 << 0) {
        ret[0] = fBi_b1N57x.fn(void 0, Des);
      }
      if (Des.view.getUint8(tbimI0, 1) & 1 << 1) {
        ret[1] = Des.view.getUint8(Des.index++) === 1;
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_b1N57x": { isNoop: false, typeName: "array", fnID: "fBi", jitFnHash: "fBi_b1N57x", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_b1N57x(ret,Des){\n const arrL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = new Array(arrL0);\n for (let i0 = 0; i0 < arrL0; i0++) {ret[i0] = Des.desString();}\n ; return ret}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_b1N57x(utl) {
    return function fBi_b1N57x(ret, Des) {
      const arrL0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = new Array(arrL0);
      for (let i0 = 0; i0 < arrL0; i0++) {
        ret[i0] = Des.desString();
      }
      return ret;
    };
  }, fn: void 0 }, "is_rFrbJx": { isNoop: false, typeName: "union", fnID: "is", jitFnHash: "is_rFrbJx", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_akEgIA = utl.getJIT("is_akEgIA");
const is_OQaagS = utl.getJIT("is_OQaagS"); return function is_rFrbJx(v){return ((typeof v === 'object' && v !== null && (is_akEgIA.fn(v) || is_OQaagS.fn(v))))}`, jitDependencies: ["is_akEgIA", "is_OQaagS"], pureFnDependencies: [], createJitFn: function get_is_rFrbJx(utl) {
    const is_akEgIA = utl.getJIT("is_akEgIA");
    const is_OQaagS = utl.getJIT("is_OQaagS");
    return function is_rFrbJx(v) {
      return typeof v === "object" && v !== null && (is_akEgIA.fn(v) || is_OQaagS.fn(v));
    };
  }, fn: void 0 }, "is_akEgIA": { isNoop: false, typeName: "SerializableMethodsData", fnID: "is", jitFnHash: "is_akEgIA", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_mkeGCe = utl.getJIT("is_mkeGCe");
const is_AaIC6c = utl.getJIT("is_AaIC6c");
const is_cuUMAa = utl.getJIT("is_cuUMAa"); return function is_akEgIA(v){return (is_mkeGCe.fn(v.purFnDeps) && is_AaIC6c.fn(v.methods) && is_cuUMAa.fn(v.deps))}`, jitDependencies: ["is_mkeGCe", "is_AaIC6c", "is_cuUMAa"], pureFnDependencies: [], createJitFn: function get_is_akEgIA(utl) {
    const is_mkeGCe = utl.getJIT("is_mkeGCe");
    const is_AaIC6c = utl.getJIT("is_AaIC6c");
    const is_cuUMAa = utl.getJIT("is_cuUMAa");
    return function is_akEgIA(v) {
      return is_mkeGCe.fn(v.purFnDeps) && is_AaIC6c.fn(v.methods) && is_cuUMAa.fn(v.deps);
    };
  }, fn: void 0 }, "is_mkeGCe": { isNoop: false, typeName: "PureFnsDataCache", fnID: "is", jitFnHash: "is_mkeGCe", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_FX3Pr5 = utl.getJIT("is_FX3Pr5"); return function is_mkeGCe(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_FX3Pr5.fn(v[p0]))) return false;} return true;})())}`, jitDependencies: ["is_FX3Pr5"], pureFnDependencies: [], createJitFn: function get_is_mkeGCe(utl) {
    const is_FX3Pr5 = utl.getJIT("is_FX3Pr5");
    return function is_mkeGCe(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && (function() {
        for (const p0 in v) {
          if (!is_FX3Pr5.fn(v[p0])) return false;
        }
        return true;
      })();
    };
  }, fn: void 0 }, "is_FX3Pr5": { isNoop: false, typeName: "Record", fnID: "is", jitFnHash: "is_FX3Pr5", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_QqGqA2 = utl.getJIT("is_QqGqA2"); return function is_FX3Pr5(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_QqGqA2.fn(v[p0]))) return false;} return true;})())}`, jitDependencies: ["is_QqGqA2"], pureFnDependencies: [], createJitFn: function get_is_FX3Pr5(utl) {
    const is_QqGqA2 = utl.getJIT("is_QqGqA2");
    return function is_FX3Pr5(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && (function() {
        for (const p0 in v) {
          if (!is_QqGqA2.fn(v[p0])) return false;
        }
        return true;
      })();
    };
  }, fn: void 0 }, "is_QqGqA2": { isNoop: false, typeName: "PureFunctionData", fnID: "is", jitFnHash: "is_QqGqA2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_Ei8qua = utl.getJIT("is_Ei8qua"); return function is_QqGqA2(v){return (typeof v === 'object' && v !== null && typeof v.namespace === 'string' && is_Ei8qua.fn(v.paramNames) && typeof v.code === 'string' && typeof v.fnName === 'string' && typeof v.bodyHash === 'string' && is_Ei8qua.fn(v.pureFnDependencies))}`, jitDependencies: ["is_Ei8qua"], pureFnDependencies: [], createJitFn: function get_is_QqGqA2(utl) {
    const is_Ei8qua = utl.getJIT("is_Ei8qua");
    return function is_QqGqA2(v) {
      return typeof v === "object" && v !== null && typeof v.namespace === "string" && is_Ei8qua.fn(v.paramNames) && typeof v.code === "string" && typeof v.fnName === "string" && typeof v.bodyHash === "string" && is_Ei8qua.fn(v.pureFnDependencies);
    };
  }, fn: void 0 }, "is_Ei8qua": { isNoop: false, typeName: "array", fnID: "is", jitFnHash: "is_Ei8qua", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_Ei8qua(v){\n if (!Array.isArray(v)) return false;\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = typeof v[i0] === 'string';\n if (!(res0)) return false;\n }\n return true;\n }", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_Ei8qua(utl) {
    return function is_Ei8qua(v) {
      if (!Array.isArray(v)) return false;
      for (let i0 = 0; i0 < v.length; i0++) {
        const res0 = typeof v[i0] === "string";
        if (!res0) return false;
      }
      return true;
    };
  }, fn: void 0 }, "is_AaIC6c": { isNoop: false, typeName: "MethodsCache", fnID: "is", jitFnHash: "is_AaIC6c", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_LZl713 = utl.getJIT("is_LZl713"); return function is_AaIC6c(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_LZl713.fn(v[p0]))) return false;} return true;})())}`, jitDependencies: ["is_LZl713"], pureFnDependencies: [], createJitFn: function get_is_AaIC6c(utl) {
    const is_LZl713 = utl.getJIT("is_LZl713");
    return function is_AaIC6c(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && (function() {
        for (const p0 in v) {
          if (!is_LZl713.fn(v[p0])) return false;
        }
        return true;
      })();
    };
  }, fn: void 0 }, "is_LZl713": { isNoop: false, typeName: "MethodWithOptions", fnID: "is", jitFnHash: "is_LZl713", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_Ei8qua = utl.getJIT("is_Ei8qua");
const is_s8eky2 = utl.getJIT("is_s8eky2");
const is_eQeowW = utl.getJIT("is_eQeowW"); return function is_LZl713(v){return (typeof v === 'object' && v !== null && Number.isFinite(v.type) && typeof v.id === 'string' && typeof v.isAsync === 'boolean' && typeof v.hasReturnData === 'boolean' && (v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)) && typeof v.paramsJitHash === 'string' && typeof v.returnJitHash === 'string' && (v.headersParam === undefined || is_s8eky2.fn(v.headersParam)) && (v.headersReturn === undefined || is_s8eky2.fn(v.headersReturn)) && (v.middleFnIds === undefined || is_Ei8qua.fn(v.middleFnIds)) && is_Ei8qua.fn(v.pointer) && Number.isFinite(v.nestLevel) && is_eQeowW.fn(v.options))}`, jitDependencies: ["is_Ei8qua", "is_s8eky2", "is_eQeowW"], pureFnDependencies: [], createJitFn: function get_is_LZl713(utl) {
    const is_Ei8qua = utl.getJIT("is_Ei8qua");
    const is_s8eky2 = utl.getJIT("is_s8eky2");
    const is_eQeowW = utl.getJIT("is_eQeowW");
    return function is_LZl713(v) {
      return typeof v === "object" && v !== null && Number.isFinite(v.type) && typeof v.id === "string" && typeof v.isAsync === "boolean" && typeof v.hasReturnData === "boolean" && (v.paramNames === void 0 || is_Ei8qua.fn(v.paramNames)) && typeof v.paramsJitHash === "string" && typeof v.returnJitHash === "string" && (v.headersParam === void 0 || is_s8eky2.fn(v.headersParam)) && (v.headersReturn === void 0 || is_s8eky2.fn(v.headersReturn)) && (v.middleFnIds === void 0 || is_Ei8qua.fn(v.middleFnIds)) && is_Ei8qua.fn(v.pointer) && Number.isFinite(v.nestLevel) && is_eQeowW.fn(v.options);
    };
  }, fn: void 0 }, "is_s8eky2": { isNoop: false, typeName: "HeadersMetaData", fnID: "is", jitFnHash: "is_s8eky2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_Ei8qua = utl.getJIT("is_Ei8qua"); return function is_s8eky2(v){return (typeof v === 'object' && v !== null && is_Ei8qua.fn(v.headerNames) && typeof v.jitHash === 'string')}`, jitDependencies: ["is_Ei8qua"], pureFnDependencies: [], createJitFn: function get_is_s8eky2(utl) {
    const is_Ei8qua = utl.getJIT("is_Ei8qua");
    return function is_s8eky2(v) {
      return typeof v === "object" && v !== null && is_Ei8qua.fn(v.headerNames) && typeof v.jitHash === "string";
    };
  }, fn: void 0 }, "is_eQeowW": { isNoop: false, typeName: "RemoteMethodOpts", fnID: "is", jitFnHash: "is_eQeowW", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_hxdrPr = utl.getJIT("is_hxdrPr"); return function is_eQeowW(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (v.runOnError === undefined || typeof v.runOnError === 'boolean') && (v.validateParams === undefined || typeof v.validateParams === 'boolean') && (v.validateReturn === undefined || typeof v.validateReturn === 'boolean') && (v.description === undefined || typeof v.description === 'string') && (v.serializer === undefined || is_hxdrPr.fn(v.serializer)) && (v.isMutation === undefined || typeof v.isMutation === 'boolean'))}`, jitDependencies: ["is_hxdrPr"], pureFnDependencies: [], createJitFn: function get_is_eQeowW(utl) {
    const is_hxdrPr = utl.getJIT("is_hxdrPr");
    return function is_eQeowW(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && (v.runOnError === void 0 || typeof v.runOnError === "boolean") && (v.validateParams === void 0 || typeof v.validateParams === "boolean") && (v.validateReturn === void 0 || typeof v.validateReturn === "boolean") && (v.description === void 0 || typeof v.description === "string") && (v.serializer === void 0 || is_hxdrPr.fn(v.serializer)) && (v.isMutation === void 0 || typeof v.isMutation === "boolean");
    };
  }, fn: void 0 }, "is_hxdrPr": { isNoop: false, typeName: "SerializerMode", fnID: "is", jitFnHash: "is_hxdrPr", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict';  return function is_hxdrPr(v){return (v === "json" || v === "binary" || v === "stringifyJson")}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_hxdrPr(utl) {
    return function is_hxdrPr(v) {
      return v === "json" || v === "binary" || v === "stringifyJson";
    };
  }, fn: void 0 }, "is_cuUMAa": { isNoop: false, typeName: "FnsDataCache", fnID: "is", jitFnHash: "is_cuUMAa", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_vnf9tn = utl.getJIT("is_vnf9tn"); return function is_cuUMAa(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_vnf9tn.fn(v[p0]))) return false;} return true;})())}`, jitDependencies: ["is_vnf9tn"], pureFnDependencies: [], createJitFn: function get_is_cuUMAa(utl) {
    const is_vnf9tn = utl.getJIT("is_vnf9tn");
    return function is_cuUMAa(v) {
      return typeof v === "object" && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === "[object Object]") && (function() {
        for (const p0 in v) {
          if (!is_vnf9tn.fn(v[p0])) return false;
        }
        return true;
      })();
    };
  }, fn: void 0 }, "is_vnf9tn": { isNoop: false, typeName: "JitCompiledFnData", fnID: "is", jitFnHash: "is_vnf9tn", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_gCQYSg = utl.getJIT("is_gCQYSg");
const is_Ei8qua = utl.getJIT("is_Ei8qua"); return function is_vnf9tn(v){return (typeof v === 'object' && v !== null && typeof v.typeName === 'string' && typeof v.fnID === 'string' && typeof v.jitFnHash === 'string' && is_gCQYSg.fn(v.args) && is_gCQYSg.fn(v.defaultParamValues) && (v.isNoop === undefined || typeof v.isNoop === 'boolean') && typeof v.code === 'string' && is_Ei8qua.fn(v.jitDependencies) && is_Ei8qua.fn(v.pureFnDependencies) && (v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)))}`, jitDependencies: ["is_gCQYSg", "is_Ei8qua"], pureFnDependencies: [], createJitFn: function get_is_vnf9tn(utl) {
    const is_gCQYSg = utl.getJIT("is_gCQYSg");
    const is_Ei8qua = utl.getJIT("is_Ei8qua");
    return function is_vnf9tn(v) {
      return typeof v === "object" && v !== null && typeof v.typeName === "string" && typeof v.fnID === "string" && typeof v.jitFnHash === "string" && is_gCQYSg.fn(v.args) && is_gCQYSg.fn(v.defaultParamValues) && (v.isNoop === void 0 || typeof v.isNoop === "boolean") && typeof v.code === "string" && is_Ei8qua.fn(v.jitDependencies) && is_Ei8qua.fn(v.pureFnDependencies) && (v.paramNames === void 0 || is_Ei8qua.fn(v.paramNames));
    };
  }, fn: void 0 }, "is_gCQYSg": { isNoop: false, typeName: "JitFnArgs", fnID: "is", jitFnHash: "is_gCQYSg", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict';  return function is_gCQYSg(v){return (typeof v === 'object' && v !== null && typeof v["vλl"] === 'string' && (function(){for (const p0 in v){if (!(typeof v[p0] === 'string')) return false;} return true;})())}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_gCQYSg(utl) {
    return function is_gCQYSg(v) {
      return typeof v === "object" && v !== null && typeof v["vλl"] === "string" && (function() {
        for (const p0 in v) {
          if (!(typeof v[p0] === "string")) return false;
        }
        return true;
      })();
    };
  }, fn: void 0 }, "is_OQaagS": { isNoop: false, typeName: "RpcError", fnID: "is", jitFnHash: "is_OQaagS", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_WEWIGI = utl.getJIT("is_WEWIGI"); return function is_OQaagS(v){return ((v.statusCode === undefined || Number.isFinite(v.statusCode)) && v["mion@isΣrrθr"] === true && v.type === "rpc-metadata-not-found" && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && typeof v.publicMessage === 'string' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)))}`, jitDependencies: ["is_WEWIGI"], pureFnDependencies: [], createJitFn: function get_is_OQaagS(utl) {
    const is_WEWIGI = utl.getJIT("is_WEWIGI");
    return function is_OQaagS(v) {
      return (v.statusCode === void 0 || Number.isFinite(v.statusCode)) && v["mion@isΣrrθr"] === true && v.type === "rpc-metadata-not-found" && (v.id === void 0 || (Number.isFinite(v.id) || typeof v.id === "string")) && typeof v.publicMessage === "string" && (v.errorData === void 0 || is_WEWIGI.fn(v.errorData));
    };
  }, fn: void 0 }, "te_rFrbJx": { isNoop: false, typeName: "union", fnID: "te", jitFnHash: "te_rFrbJx", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const is_akEgIA = utl.getJIT("is_akEgIA");
const is_OQaagS = utl.getJIT("is_OQaagS");
const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_rFrbJx(v,pth=[],er=[]){if (!((typeof v === 'object' && v !== null && (is_akEgIA.fn(v) || is_OQaagS.fn(v))))) Iqa2M8Ms(pth,er,"union"); return er}`, jitDependencies: ["is_akEgIA", "is_OQaagS"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_rFrbJx(utl) {
    const is_akEgIA = utl.getJIT("is_akEgIA");
    const is_OQaagS = utl.getJIT("is_OQaagS");
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_rFrbJx(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null && (is_akEgIA.fn(v) || is_OQaagS.fn(v)))) Iqa2M8Ms(pth, er, "union");
      return er;
    };
  }, fn: void 0 }, "tj_rFrbJx": { isNoop: false, typeName: "union", fnID: "tj", jitFnHash: "tj_rFrbJx", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json encode union: item does not belong to the union";
const is_akEgIA = utl.getJIT("is_akEgIA");
const tj_akEgIA = utl.getJIT("tj_akEgIA");
const fj_akEgIA = utl.getJIT("fj_akEgIA");
const is_OQaagS = utl.getJIT("is_OQaagS");
const tj_OQaagS = utl.getJIT("tj_OQaagS");
const fj_OQaagS = utl.getJIT("fj_OQaagS"); return function tj_rFrbJx(v){if (typeof v === 'object' && v !== null && is_akEgIA.fn(v)) {v = tj_akEgIA.fn(v); v = [0, v]}else if (typeof v === 'object' && v !== null && is_OQaagS.fn(v)) {v = tj_OQaagS.fn(v); v = [1, v]}else {throw new Error(uErr0);} return v}`, jitDependencies: ["is_akEgIA", "tj_akEgIA", "fj_akEgIA", "is_OQaagS", "tj_OQaagS", "fj_OQaagS"], pureFnDependencies: [], createJitFn: function get_tj_rFrbJx(utl) {
    const uErr0 = "Can not json encode union: item does not belong to the union";
    const is_akEgIA = utl.getJIT("is_akEgIA");
    const tj_akEgIA = utl.getJIT("tj_akEgIA");
    utl.getJIT("fj_akEgIA");
    const is_OQaagS = utl.getJIT("is_OQaagS");
    const tj_OQaagS = utl.getJIT("tj_OQaagS");
    utl.getJIT("fj_OQaagS");
    return function tj_rFrbJx(v) {
      if (typeof v === "object" && v !== null && is_akEgIA.fn(v)) {
        v = tj_akEgIA.fn(v);
        v = [0, v];
      } else if (typeof v === "object" && v !== null && is_OQaagS.fn(v)) {
        v = tj_OQaagS.fn(v);
        v = [1, v];
      } else {
        throw new Error(uErr0);
      }
      return v;
    };
  }, fn: void 0 }, "tj_akEgIA": { isNoop: false, typeName: "SerializableMethodsData", fnID: "tj", jitFnHash: "tj_akEgIA", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const tj_AaIC6c = utl.getJIT("tj_AaIC6c"); return function tj_akEgIA(v){v.methods = tj_AaIC6c.fn(v.methods); return v}`, jitDependencies: ["tj_AaIC6c"], pureFnDependencies: [], createJitFn: function get_tj_akEgIA(utl) {
    const tj_AaIC6c = utl.getJIT("tj_AaIC6c");
    return function tj_akEgIA(v) {
      v.methods = tj_AaIC6c.fn(v.methods);
      return v;
    };
  }, fn: void 0 }, "tj_mkeGCe": { isNoop: true, typeName: "PureFnsDataCache", fnID: "tj", jitFnHash: "tj_mkeGCe", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_mkeGCe(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_mkeGCe(utl) {
    return function tj_mkeGCe(v) {
      return v;
    };
  }, fn: void 0 }, "tj_FX3Pr5": { isNoop: true, typeName: "Record", fnID: "tj", jitFnHash: "tj_FX3Pr5", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_FX3Pr5(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_FX3Pr5(utl) {
    return function tj_FX3Pr5(v) {
      return v;
    };
  }, fn: void 0 }, "tj_QqGqA2": { isNoop: true, typeName: "PureFunctionData", fnID: "tj", jitFnHash: "tj_QqGqA2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_QqGqA2(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_QqGqA2(utl) {
    return function tj_QqGqA2(v) {
      return v;
    };
  }, fn: void 0 }, "tj_Ei8qua": { isNoop: true, typeName: "array", fnID: "tj", jitFnHash: "tj_Ei8qua", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_Ei8qua(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_Ei8qua(utl) {
    return function tj_Ei8qua(v) {
      return v;
    };
  }, fn: void 0 }, "tj_AaIC6c": { isNoop: false, typeName: "MethodsCache", fnID: "tj", jitFnHash: "tj_AaIC6c", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const tj_LZl713 = utl.getJIT("tj_LZl713"); return function tj_AaIC6c(v){for (const p0 in v){ v[p0] = tj_LZl713.fn(v[p0]);} return v}`, jitDependencies: ["tj_LZl713"], pureFnDependencies: [], createJitFn: function get_tj_AaIC6c(utl) {
    const tj_LZl713 = utl.getJIT("tj_LZl713");
    return function tj_AaIC6c(v) {
      for (const p0 in v) {
        v[p0] = tj_LZl713.fn(v[p0]);
      }
      return v;
    };
  }, fn: void 0 }, "tj_LZl713": { isNoop: false, typeName: "MethodWithOptions", fnID: "tj", jitFnHash: "tj_LZl713", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const tj_eQeowW = utl.getJIT("tj_eQeowW"); return function tj_LZl713(v){v.options = tj_eQeowW.fn(v.options); return v}`, jitDependencies: ["tj_eQeowW"], pureFnDependencies: [], createJitFn: function get_tj_LZl713(utl) {
    const tj_eQeowW = utl.getJIT("tj_eQeowW");
    return function tj_LZl713(v) {
      v.options = tj_eQeowW.fn(v.options);
      return v;
    };
  }, fn: void 0 }, "tj_s8eky2": { isNoop: true, typeName: "HeadersMetaData", fnID: "tj", jitFnHash: "tj_s8eky2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_s8eky2(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_s8eky2(utl) {
    return function tj_s8eky2(v) {
      return v;
    };
  }, fn: void 0 }, "tj_eQeowW": { isNoop: false, typeName: "RemoteMethodOpts", fnID: "tj", jitFnHash: "tj_eQeowW", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const tj_hxdrPr = utl.getJIT("tj_hxdrPr"); return function tj_eQeowW(v){if (v.serializer !== undefined) {v.serializer = tj_hxdrPr.fn(v.serializer);} return v}`, jitDependencies: ["tj_hxdrPr"], pureFnDependencies: [], createJitFn: function get_tj_eQeowW(utl) {
    const tj_hxdrPr = utl.getJIT("tj_hxdrPr");
    return function tj_eQeowW(v) {
      if (v.serializer !== void 0) {
        v.serializer = tj_hxdrPr.fn(v.serializer);
      }
      return v;
    };
  }, fn: void 0 }, "tj_hxdrPr": { isNoop: false, typeName: "SerializerMode", fnID: "tj", jitFnHash: "tj_hxdrPr", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json encode union: item does not belong to the union"; return function tj_hxdrPr(v){if (v === "json") { /*noop*/}else if (v === "binary") { /*noop*/}else if (v === "stringifyJson") { /*noop*/}else {throw new Error(uErr0);} return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_hxdrPr(utl) {
    const uErr0 = "Can not json encode union: item does not belong to the union";
    return function tj_hxdrPr(v) {
      if (v === "json") ;
      else if (v === "binary") ;
      else if (v === "stringifyJson") ;
      else {
        throw new Error(uErr0);
      }
      return v;
    };
  }, fn: void 0 }, "tj_cuUMAa": { isNoop: true, typeName: "FnsDataCache", fnID: "tj", jitFnHash: "tj_cuUMAa", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_cuUMAa(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_cuUMAa(utl) {
    return function tj_cuUMAa(v) {
      return v;
    };
  }, fn: void 0 }, "tj_vnf9tn": { isNoop: true, typeName: "JitCompiledFnData", fnID: "tj", jitFnHash: "tj_vnf9tn", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_vnf9tn(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_vnf9tn(utl) {
    return function tj_vnf9tn(v) {
      return v;
    };
  }, fn: void 0 }, "tj_gCQYSg": { isNoop: true, typeName: "JitFnArgs", fnID: "tj", jitFnHash: "tj_gCQYSg", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_gCQYSg(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_gCQYSg(utl) {
    return function tj_gCQYSg(v) {
      return v;
    };
  }, fn: void 0 }, "fj_akEgIA": { isNoop: false, typeName: "SerializableMethodsData", fnID: "fj", jitFnHash: "fj_akEgIA", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const fj_AaIC6c = utl.getJIT("fj_AaIC6c"); return function fj_akEgIA(v){v.methods = fj_AaIC6c.fn(v.methods); return v}`, jitDependencies: ["fj_AaIC6c"], pureFnDependencies: [], createJitFn: function get_fj_akEgIA(utl) {
    const fj_AaIC6c = utl.getJIT("fj_AaIC6c");
    return function fj_akEgIA(v) {
      v.methods = fj_AaIC6c.fn(v.methods);
      return v;
    };
  }, fn: void 0 }, "fj_mkeGCe": { isNoop: true, typeName: "PureFnsDataCache", fnID: "fj", jitFnHash: "fj_mkeGCe", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_mkeGCe(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_mkeGCe(utl) {
    return function fj_mkeGCe(v) {
      return v;
    };
  }, fn: void 0 }, "fj_FX3Pr5": { isNoop: true, typeName: "Record", fnID: "fj", jitFnHash: "fj_FX3Pr5", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_FX3Pr5(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_FX3Pr5(utl) {
    return function fj_FX3Pr5(v) {
      return v;
    };
  }, fn: void 0 }, "fj_QqGqA2": { isNoop: true, typeName: "PureFunctionData", fnID: "fj", jitFnHash: "fj_QqGqA2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_QqGqA2(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_QqGqA2(utl) {
    return function fj_QqGqA2(v) {
      return v;
    };
  }, fn: void 0 }, "fj_Ei8qua": { isNoop: true, typeName: "array", fnID: "fj", jitFnHash: "fj_Ei8qua", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_Ei8qua(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_Ei8qua(utl) {
    return function fj_Ei8qua(v) {
      return v;
    };
  }, fn: void 0 }, "fj_AaIC6c": { isNoop: false, typeName: "MethodsCache", fnID: "fj", jitFnHash: "fj_AaIC6c", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const fj_LZl713 = utl.getJIT("fj_LZl713"); return function fj_AaIC6c(v){for (const p0 in v){ v[p0] = fj_LZl713.fn(v[p0]);} return v}`, jitDependencies: ["fj_LZl713"], pureFnDependencies: [], createJitFn: function get_fj_AaIC6c(utl) {
    const fj_LZl713 = utl.getJIT("fj_LZl713");
    return function fj_AaIC6c(v) {
      for (const p0 in v) {
        v[p0] = fj_LZl713.fn(v[p0]);
      }
      return v;
    };
  }, fn: void 0 }, "fj_LZl713": { isNoop: false, typeName: "MethodWithOptions", fnID: "fj", jitFnHash: "fj_LZl713", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const fj_eQeowW = utl.getJIT("fj_eQeowW"); return function fj_LZl713(v){v.options = fj_eQeowW.fn(v.options); return v}`, jitDependencies: ["fj_eQeowW"], pureFnDependencies: [], createJitFn: function get_fj_LZl713(utl) {
    const fj_eQeowW = utl.getJIT("fj_eQeowW");
    return function fj_LZl713(v) {
      v.options = fj_eQeowW.fn(v.options);
      return v;
    };
  }, fn: void 0 }, "fj_s8eky2": { isNoop: true, typeName: "HeadersMetaData", fnID: "fj", jitFnHash: "fj_s8eky2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_s8eky2(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_s8eky2(utl) {
    return function fj_s8eky2(v) {
      return v;
    };
  }, fn: void 0 }, "fj_eQeowW": { isNoop: false, typeName: "RemoteMethodOpts", fnID: "fj", jitFnHash: "fj_eQeowW", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const fj_hxdrPr = utl.getJIT("fj_hxdrPr"); return function fj_eQeowW(v){if (v.serializer !== undefined) {v.serializer = fj_hxdrPr.fn(v.serializer);} return v}`, jitDependencies: ["fj_hxdrPr"], pureFnDependencies: [], createJitFn: function get_fj_eQeowW(utl) {
    const fj_hxdrPr = utl.getJIT("fj_hxdrPr");
    return function fj_eQeowW(v) {
      if (v.serializer !== void 0) {
        v.serializer = fj_hxdrPr.fn(v.serializer);
      }
      return v;
    };
  }, fn: void 0 }, "fj_hxdrPr": { isNoop: false, typeName: "SerializerMode", fnID: "fj", jitFnHash: "fj_hxdrPr", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json decode union: invalid union index"; return function fj_hxdrPr(v){
 if (v?.length === 2 && Array.isArray(v) && typeof v[0] === 'number') {
 const dec0 = v[0]; v = v[1];
 if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}else if (dec0 === 2) {/*noop*/}
 else {throw new Error(uErr0)}
 }
 ; return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_hxdrPr(utl) {
    const uErr0 = "Can not json decode union: invalid union index";
    return function fj_hxdrPr(v) {
      if (v?.length === 2 && Array.isArray(v) && typeof v[0] === "number") {
        const dec0 = v[0];
        v = v[1];
        if (dec0 === 0) ;
        else if (dec0 === 1) ;
        else if (dec0 === 2) ;
        else {
          throw new Error(uErr0);
        }
      }
      return v;
    };
  }, fn: void 0 }, "fj_cuUMAa": { isNoop: true, typeName: "FnsDataCache", fnID: "fj", jitFnHash: "fj_cuUMAa", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_cuUMAa(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_cuUMAa(utl) {
    return function fj_cuUMAa(v) {
      return v;
    };
  }, fn: void 0 }, "fj_vnf9tn": { isNoop: true, typeName: "JitCompiledFnData", fnID: "fj", jitFnHash: "fj_vnf9tn", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_vnf9tn(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_vnf9tn(utl) {
    return function fj_vnf9tn(v) {
      return v;
    };
  }, fn: void 0 }, "fj_gCQYSg": { isNoop: true, typeName: "JitFnArgs", fnID: "fj", jitFnHash: "fj_gCQYSg", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_gCQYSg(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_gCQYSg(utl) {
    return function fj_gCQYSg(v) {
      return v;
    };
  }, fn: void 0 }, "tj_OQaagS": { isNoop: false, typeName: "RpcError", fnID: "tj", jitFnHash: "tj_OQaagS", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json encode union: item does not belong to the union"; return function tj_OQaagS(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/}else {throw new Error(uErr0);}} return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_OQaagS(utl) {
    const uErr0 = "Can not json encode union: item does not belong to the union";
    return function tj_OQaagS(v) {
      if (v.id !== void 0) {
        if (Number.isFinite(v.id)) ;
        else if (typeof v.id === "string") ;
        else {
          throw new Error(uErr0);
        }
      }
      return v;
    };
  }, fn: void 0 }, "fj_OQaagS": { isNoop: false, typeName: "RpcError", fnID: "fj", jitFnHash: "fj_OQaagS", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json decode union: invalid union index"; return function fj_OQaagS(v){
 if (v.id !== undefined) {
 if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === 'number') {
 const dec0 = v.id[0]; v.id = v.id[1];
 if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}
 else {throw new Error(uErr0)}
 }
 ;};
 let desFn1 = utl.getDeserializeFn("RpcError");
 if (desFn1) {v = desFn1(v)}
 else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}
 ; return v}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_OQaagS(utl) {
    const uErr0 = "Can not json decode union: invalid union index";
    return function fj_OQaagS(v) {
      if (v.id !== void 0) {
        if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === "number") {
          const dec0 = v.id[0];
          v.id = v.id[1];
          if (dec0 === 0) ;
          else if (dec0 === 1) ;
          else {
            throw new Error(uErr0);
          }
        }
      }
      let desFn1 = utl.getDeserializeFn("RpcError");
      if (desFn1) {
        v = desFn1(v);
      } else if (desFn1 = utl.getSerializeClass("RpcError")) {
        v = new desFn1(v);
      }
      return v;
    };
  }, fn: void 0 }, "fj_rFrbJx": { isNoop: false, typeName: "union", fnID: "fj", jitFnHash: "fj_rFrbJx", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not json decode union: invalid union index";
const fj_akEgIA = utl.getJIT("fj_akEgIA");
const fj_OQaagS = utl.getJIT("fj_OQaagS"); return function fj_rFrbJx(v){
 if (v?.length === 2 && Array.isArray(v) && typeof v[0] === 'number') {
 const dec0 = v[0]; v = v[1];
 if (dec0 === 0) {v = fj_akEgIA.fn(v)}else if (dec0 === 1) {v = fj_OQaagS.fn(v)}
 else {throw new Error(uErr0)}
 }
 ; return v}`, jitDependencies: ["fj_akEgIA", "fj_OQaagS"], pureFnDependencies: [], createJitFn: function get_fj_rFrbJx(utl) {
    const uErr0 = "Can not json decode union: invalid union index";
    const fj_akEgIA = utl.getJIT("fj_akEgIA");
    const fj_OQaagS = utl.getJIT("fj_OQaagS");
    return function fj_rFrbJx(v) {
      if (v?.length === 2 && Array.isArray(v) && typeof v[0] === "number") {
        const dec0 = v[0];
        v = v[1];
        if (dec0 === 0) {
          v = fj_akEgIA.fn(v);
        } else if (dec0 === 1) {
          v = fj_OQaagS.fn(v);
        } else {
          throw new Error(uErr0);
        }
      }
      return v;
    };
  }, fn: void 0 }, "sj_rFrbJx": { isNoop: false, typeName: "union", fnID: "sj", jitFnHash: "sj_rFrbJx", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not StringifyJson union: item does not belong to the union";
const is_akEgIA = utl.getJIT("is_akEgIA");
const sj_akEgIA = utl.getJIT("sj_akEgIA");
const tj_akEgIA = utl.getJIT("tj_akEgIA");
const fj_akEgIA = utl.getJIT("fj_akEgIA");
const is_OQaagS = utl.getJIT("is_OQaagS");
const sj_OQaagS = utl.getJIT("sj_OQaagS");
const tj_OQaagS = utl.getJIT("tj_OQaagS");
const fj_OQaagS = utl.getJIT("fj_OQaagS"); return function sj_rFrbJx(v){if (typeof v === 'object' && v !== null && is_akEgIA.fn(v)) {return '[0,' + sj_akEgIA.fn(v) + ']'}else if (typeof v === 'object' && v !== null && is_OQaagS.fn(v)) {return '[1,' + sj_OQaagS.fn(v) + ']'}else {throw new Error(uErr0);}}`, jitDependencies: ["is_akEgIA", "sj_akEgIA", "tj_akEgIA", "fj_akEgIA", "is_OQaagS", "sj_OQaagS", "tj_OQaagS", "fj_OQaagS"], pureFnDependencies: [], createJitFn: function get_sj_rFrbJx(utl) {
    const uErr0 = "Can not StringifyJson union: item does not belong to the union";
    const is_akEgIA = utl.getJIT("is_akEgIA");
    const sj_akEgIA = utl.getJIT("sj_akEgIA");
    utl.getJIT("tj_akEgIA");
    utl.getJIT("fj_akEgIA");
    const is_OQaagS = utl.getJIT("is_OQaagS");
    const sj_OQaagS = utl.getJIT("sj_OQaagS");
    utl.getJIT("tj_OQaagS");
    utl.getJIT("fj_OQaagS");
    return function sj_rFrbJx(v) {
      if (typeof v === "object" && v !== null && is_akEgIA.fn(v)) {
        return "[0," + sj_akEgIA.fn(v) + "]";
      } else if (typeof v === "object" && v !== null && is_OQaagS.fn(v)) {
        return "[1," + sj_OQaagS.fn(v) + "]";
      } else {
        throw new Error(uErr0);
      }
    };
  }, fn: void 0 }, "sj_akEgIA": { isNoop: false, typeName: "SerializableMethodsData", fnID: "sj", jitFnHash: "sj_akEgIA", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_mkeGCe = utl.getJIT("sj_mkeGCe");
const sj_AaIC6c = utl.getJIT("sj_AaIC6c");
const sj_cuUMAa = utl.getJIT("sj_cuUMAa"); return function sj_akEgIA(v){return '{'+'"purFnDeps":'+sj_mkeGCe.fn(v.purFnDeps)+","+'"methods":'+sj_AaIC6c.fn(v.methods)+","+'"deps":'+sj_cuUMAa.fn(v.deps)+'}'}`, jitDependencies: ["sj_mkeGCe", "sj_AaIC6c", "sj_cuUMAa"], pureFnDependencies: [], createJitFn: function get_sj_akEgIA(utl) {
    const sj_mkeGCe = utl.getJIT("sj_mkeGCe");
    const sj_AaIC6c = utl.getJIT("sj_AaIC6c");
    const sj_cuUMAa = utl.getJIT("sj_cuUMAa");
    return function sj_akEgIA(v) {
      return '{"purFnDeps":' + sj_mkeGCe.fn(v.purFnDeps) + ',"methods":' + sj_AaIC6c.fn(v.methods) + ',"deps":' + sj_cuUMAa.fn(v.deps) + "}";
    };
  }, fn: void 0 }, "sj_mkeGCe": { isNoop: false, typeName: "PureFnsDataCache", fnID: "sj", jitFnHash: "sj_mkeGCe", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_FX3Pr5 = utl.getJIT("sj_FX3Pr5");
const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_mkeGCe(v){return (function(){const ns0 = [];ns0.push((function(){
 const ls1 = [];
 for (const p1 in v) {
 
 if (p1 !== undefined) ls1.push(zT3pfXdp(p1) + ':' + sj_FX3Pr5.fn(v[p1]));
 }
 if (!ls1.length) return '';
 return ls1.join(',');
 })());return '{'+ns0.join(',')+'}'})()}`, jitDependencies: ["sj_FX3Pr5"], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_mkeGCe(utl) {
    const sj_FX3Pr5 = utl.getJIT("sj_FX3Pr5");
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_mkeGCe(v) {
      return (function() {
        const ns0 = [];
        ns0.push((function() {
          const ls1 = [];
          for (const p1 in v) {
            if (p1 !== void 0) ls1.push(zT3pfXdp(p1) + ":" + sj_FX3Pr5.fn(v[p1]));
          }
          if (!ls1.length) return "";
          return ls1.join(",");
        })());
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "sj_FX3Pr5": { isNoop: false, typeName: "Record", fnID: "sj", jitFnHash: "sj_FX3Pr5", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_QqGqA2 = utl.getJIT("sj_QqGqA2");
const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_FX3Pr5(v){return (function(){const ns0 = [];ns0.push((function(){
 const ls1 = [];
 for (const p1 in v) {
 
 if (p1 !== undefined) ls1.push(zT3pfXdp(p1) + ':' + sj_QqGqA2.fn(v[p1]));
 }
 if (!ls1.length) return '';
 return ls1.join(',');
 })());return '{'+ns0.join(',')+'}'})()}`, jitDependencies: ["sj_QqGqA2"], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_FX3Pr5(utl) {
    const sj_QqGqA2 = utl.getJIT("sj_QqGqA2");
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_FX3Pr5(v) {
      return (function() {
        const ns0 = [];
        ns0.push((function() {
          const ls1 = [];
          for (const p1 in v) {
            if (p1 !== void 0) ls1.push(zT3pfXdp(p1) + ":" + sj_QqGqA2.fn(v[p1]));
          }
          if (!ls1.length) return "";
          return ls1.join(",");
        })());
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "sj_QqGqA2": { isNoop: false, typeName: "PureFunctionData", fnID: "sj", jitFnHash: "sj_QqGqA2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_Ei8qua = utl.getJIT("sj_Ei8qua"); return function sj_QqGqA2(v){return '{'+'"namespace":'+JSON.stringify(v.namespace)+","+'"paramNames":'+sj_Ei8qua.fn(v.paramNames)+","+'"code":'+JSON.stringify(v.code)+","+'"fnName":'+JSON.stringify(v.fnName)+","+'"bodyHash":'+JSON.stringify(v.bodyHash)+","+'"pureFnDependencies":'+sj_Ei8qua.fn(v.pureFnDependencies)+'}'}`, jitDependencies: ["sj_Ei8qua"], pureFnDependencies: [], createJitFn: function get_sj_QqGqA2(utl) {
    const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
    return function sj_QqGqA2(v) {
      return '{"namespace":' + JSON.stringify(v.namespace) + ',"paramNames":' + sj_Ei8qua.fn(v.paramNames) + ',"code":' + JSON.stringify(v.code) + ',"fnName":' + JSON.stringify(v.fnName) + ',"bodyHash":' + JSON.stringify(v.bodyHash) + ',"pureFnDependencies":' + sj_Ei8qua.fn(v.pureFnDependencies) + "}";
    };
  }, fn: void 0 }, "sj_Ei8qua": { isNoop: false, typeName: "array", fnID: "sj", jitFnHash: "sj_Ei8qua", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function sj_Ei8qua(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = JSON.stringify(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_Ei8qua(utl) {
    return function sj_Ei8qua(v) {
      const ls0 = [];
      for (let i0 = 0; i0 < v.length; i0++) {
        const res0 = JSON.stringify(v[i0]);
        ls0.push(res0);
      }
      return "[" + ls0.join(",") + "]";
    };
  }, fn: void 0 }, "sj_AaIC6c": { isNoop: false, typeName: "MethodsCache", fnID: "sj", jitFnHash: "sj_AaIC6c", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_LZl713 = utl.getJIT("sj_LZl713");
const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_AaIC6c(v){return (function(){const ns0 = [];ns0.push((function(){
 const ls1 = [];
 for (const p1 in v) {
 
 if (p1 !== undefined) ls1.push(zT3pfXdp(p1) + ':' + sj_LZl713.fn(v[p1]));
 }
 if (!ls1.length) return '';
 return ls1.join(',');
 })());return '{'+ns0.join(',')+'}'})()}`, jitDependencies: ["sj_LZl713"], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_AaIC6c(utl) {
    const sj_LZl713 = utl.getJIT("sj_LZl713");
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_AaIC6c(v) {
      return (function() {
        const ns0 = [];
        ns0.push((function() {
          const ls1 = [];
          for (const p1 in v) {
            if (p1 !== void 0) ls1.push(zT3pfXdp(p1) + ":" + sj_LZl713.fn(v[p1]));
          }
          if (!ls1.length) return "";
          return ls1.join(",");
        })());
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "sj_LZl713": { isNoop: false, typeName: "MethodWithOptions", fnID: "sj", jitFnHash: "sj_LZl713", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
const sj_s8eky2 = utl.getJIT("sj_s8eky2");
const sj_eQeowW = utl.getJIT("sj_eQeowW"); return function sj_LZl713(v){return '{'+(v.paramNames === undefined ? '' : '"paramNames":'+sj_Ei8qua.fn(v.paramNames)+",")+(v.headersParam === undefined ? '' : '"headersParam":'+sj_s8eky2.fn(v.headersParam)+",")+(v.headersReturn === undefined ? '' : '"headersReturn":'+sj_s8eky2.fn(v.headersReturn)+",")+(v.middleFnIds === undefined ? '' : '"middleFnIds":'+sj_Ei8qua.fn(v.middleFnIds)+",")+'"type":'+v.type+","+'"id":'+JSON.stringify(v.id)+","+'"isAsync":'+(v.isAsync ? 'true' : 'false')+","+'"hasReturnData":'+(v.hasReturnData ? 'true' : 'false')+","+'"paramsJitHash":'+JSON.stringify(v.paramsJitHash)+","+'"returnJitHash":'+JSON.stringify(v.returnJitHash)+","+'"pointer":'+sj_Ei8qua.fn(v.pointer)+","+'"nestLevel":'+v.nestLevel+","+'"options":'+sj_eQeowW.fn(v.options)+'}'}`, jitDependencies: ["sj_Ei8qua", "sj_s8eky2", "sj_eQeowW"], pureFnDependencies: [], createJitFn: function get_sj_LZl713(utl) {
    const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
    const sj_s8eky2 = utl.getJIT("sj_s8eky2");
    const sj_eQeowW = utl.getJIT("sj_eQeowW");
    return function sj_LZl713(v) {
      return "{" + (v.paramNames === void 0 ? "" : '"paramNames":' + sj_Ei8qua.fn(v.paramNames) + ",") + (v.headersParam === void 0 ? "" : '"headersParam":' + sj_s8eky2.fn(v.headersParam) + ",") + (v.headersReturn === void 0 ? "" : '"headersReturn":' + sj_s8eky2.fn(v.headersReturn) + ",") + (v.middleFnIds === void 0 ? "" : '"middleFnIds":' + sj_Ei8qua.fn(v.middleFnIds) + ",") + '"type":' + v.type + ',"id":' + JSON.stringify(v.id) + ',"isAsync":' + (v.isAsync ? "true" : "false") + ',"hasReturnData":' + (v.hasReturnData ? "true" : "false") + ',"paramsJitHash":' + JSON.stringify(v.paramsJitHash) + ',"returnJitHash":' + JSON.stringify(v.returnJitHash) + ',"pointer":' + sj_Ei8qua.fn(v.pointer) + ',"nestLevel":' + v.nestLevel + ',"options":' + sj_eQeowW.fn(v.options) + "}";
    };
  }, fn: void 0 }, "sj_s8eky2": { isNoop: false, typeName: "HeadersMetaData", fnID: "sj", jitFnHash: "sj_s8eky2", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_Ei8qua = utl.getJIT("sj_Ei8qua"); return function sj_s8eky2(v){return '{'+'"headerNames":'+sj_Ei8qua.fn(v.headerNames)+","+'"jitHash":'+JSON.stringify(v.jitHash)+'}'}`, jitDependencies: ["sj_Ei8qua"], pureFnDependencies: [], createJitFn: function get_sj_s8eky2(utl) {
    const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
    return function sj_s8eky2(v) {
      return '{"headerNames":' + sj_Ei8qua.fn(v.headerNames) + ',"jitHash":' + JSON.stringify(v.jitHash) + "}";
    };
  }, fn: void 0 }, "sj_eQeowW": { isNoop: false, typeName: "RemoteMethodOpts", fnID: "sj", jitFnHash: "sj_eQeowW", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_hxdrPr = utl.getJIT("sj_hxdrPr"); return function sj_eQeowW(v){return (function(){const ns0 = [];if (v.runOnError !== undefined){ns0.push((v.runOnError === undefined ? '' : '"runOnError":'+(v.runOnError ? 'true' : 'false')))}if (v.validateParams !== undefined){ns0.push((v.validateParams === undefined ? '' : '"validateParams":'+(v.validateParams ? 'true' : 'false')))}if (v.validateReturn !== undefined){ns0.push((v.validateReturn === undefined ? '' : '"validateReturn":'+(v.validateReturn ? 'true' : 'false')))}if (v.description !== undefined){ns0.push((v.description === undefined ? '' : '"description":'+JSON.stringify(v.description)))}if (v.serializer !== undefined){ns0.push((v.serializer === undefined ? '' : '"serializer":'+sj_hxdrPr.fn(v.serializer)))}if (v.isMutation !== undefined){ns0.push((v.isMutation === undefined ? '' : '"isMutation":'+(v.isMutation ? 'true' : 'false')))};return '{'+ns0.join(',')+'}'})()}`, jitDependencies: ["sj_hxdrPr"], pureFnDependencies: [], createJitFn: function get_sj_eQeowW(utl) {
    const sj_hxdrPr = utl.getJIT("sj_hxdrPr");
    return function sj_eQeowW(v) {
      return (function() {
        const ns0 = [];
        if (v.runOnError !== void 0) {
          ns0.push(v.runOnError === void 0 ? "" : '"runOnError":' + (v.runOnError ? "true" : "false"));
        }
        if (v.validateParams !== void 0) {
          ns0.push(v.validateParams === void 0 ? "" : '"validateParams":' + (v.validateParams ? "true" : "false"));
        }
        if (v.validateReturn !== void 0) {
          ns0.push(v.validateReturn === void 0 ? "" : '"validateReturn":' + (v.validateReturn ? "true" : "false"));
        }
        if (v.description !== void 0) {
          ns0.push(v.description === void 0 ? "" : '"description":' + JSON.stringify(v.description));
        }
        if (v.serializer !== void 0) {
          ns0.push(v.serializer === void 0 ? "" : '"serializer":' + sj_hxdrPr.fn(v.serializer));
        }
        if (v.isMutation !== void 0) {
          ns0.push(v.isMutation === void 0 ? "" : '"isMutation":' + (v.isMutation ? "true" : "false"));
        }
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "sj_hxdrPr": { isNoop: false, typeName: "SerializerMode", fnID: "sj", jitFnHash: "sj_hxdrPr", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not StringifyJson union: item does not belong to the union"; return function sj_hxdrPr(v){if (v === "json") {return JSON.stringify(v)}else if (v === "binary") {return JSON.stringify(v)}else if (v === "stringifyJson") {return JSON.stringify(v)}else {throw new Error(uErr0);}}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_hxdrPr(utl) {
    const uErr0 = "Can not StringifyJson union: item does not belong to the union";
    return function sj_hxdrPr(v) {
      if (v === "json") {
        return JSON.stringify(v);
      } else if (v === "binary") {
        return JSON.stringify(v);
      } else if (v === "stringifyJson") {
        return JSON.stringify(v);
      } else {
        throw new Error(uErr0);
      }
    };
  }, fn: void 0 }, "sj_cuUMAa": { isNoop: false, typeName: "FnsDataCache", fnID: "sj", jitFnHash: "sj_cuUMAa", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_vnf9tn = utl.getJIT("sj_vnf9tn");
const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_cuUMAa(v){return (function(){const ns0 = [];ns0.push((function(){
 const ls1 = [];
 for (const p1 in v) {
 
 if (p1 !== undefined) ls1.push(zT3pfXdp(p1) + ':' + sj_vnf9tn.fn(v[p1]));
 }
 if (!ls1.length) return '';
 return ls1.join(',');
 })());return '{'+ns0.join(',')+'}'})()}`, jitDependencies: ["sj_vnf9tn"], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_cuUMAa(utl) {
    const sj_vnf9tn = utl.getJIT("sj_vnf9tn");
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_cuUMAa(v) {
      return (function() {
        const ns0 = [];
        ns0.push((function() {
          const ls1 = [];
          for (const p1 in v) {
            if (p1 !== void 0) ls1.push(zT3pfXdp(p1) + ":" + sj_vnf9tn.fn(v[p1]));
          }
          if (!ls1.length) return "";
          return ls1.join(",");
        })());
        return "{" + ns0.join(",") + "}";
      })();
    };
  }, fn: void 0 }, "sj_vnf9tn": { isNoop: false, typeName: "JitCompiledFnData", fnID: "sj", jitFnHash: "sj_vnf9tn", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
const sj_gCQYSg = utl.getJIT("sj_gCQYSg"); return function sj_vnf9tn(v){return '{'+(v.isNoop === undefined ? '' : '"isNoop":'+(v.isNoop ? 'true' : 'false')+",")+(v.paramNames === undefined ? '' : '"paramNames":'+sj_Ei8qua.fn(v.paramNames)+",")+'"typeName":'+JSON.stringify(v.typeName)+","+'"fnID":'+JSON.stringify(v.fnID)+","+'"jitFnHash":'+JSON.stringify(v.jitFnHash)+","+'"args":'+sj_gCQYSg.fn(v.args)+","+'"defaultParamValues":'+sj_gCQYSg.fn(v.defaultParamValues)+","+'"code":'+JSON.stringify(v.code)+","+'"jitDependencies":'+sj_Ei8qua.fn(v.jitDependencies)+","+'"pureFnDependencies":'+sj_Ei8qua.fn(v.pureFnDependencies)+'}'}`, jitDependencies: ["sj_Ei8qua", "sj_gCQYSg"], pureFnDependencies: [], createJitFn: function get_sj_vnf9tn(utl) {
    const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
    const sj_gCQYSg = utl.getJIT("sj_gCQYSg");
    return function sj_vnf9tn(v) {
      return "{" + (v.isNoop === void 0 ? "" : '"isNoop":' + (v.isNoop ? "true" : "false") + ",") + (v.paramNames === void 0 ? "" : '"paramNames":' + sj_Ei8qua.fn(v.paramNames) + ",") + '"typeName":' + JSON.stringify(v.typeName) + ',"fnID":' + JSON.stringify(v.fnID) + ',"jitFnHash":' + JSON.stringify(v.jitFnHash) + ',"args":' + sj_gCQYSg.fn(v.args) + ',"defaultParamValues":' + sj_gCQYSg.fn(v.defaultParamValues) + ',"code":' + JSON.stringify(v.code) + ',"jitDependencies":' + sj_Ei8qua.fn(v.jitDependencies) + ',"pureFnDependencies":' + sj_Ei8qua.fn(v.pureFnDependencies) + "}";
    };
  }, fn: void 0 }, "sj_gCQYSg": { isNoop: false, typeName: "JitFnArgs", fnID: "sj", jitFnHash: "sj_gCQYSg", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const zT3pfXdp = utl.getPureFn("mion", "asJSONString"); return function sj_gCQYSg(v){return '{'+(function(){
 const ls0 = [];
 for (const p0 in v) {
 if ("vλl" === p0) continue;
 if (p0 !== undefined) ls0.push(zT3pfXdp(p0) + ':' + JSON.stringify(v[p0]));
 }
 if (!ls0.length) return '';
 return ls0.join(',')+",";
 })()+"\\"vλl\\""+':'+JSON.stringify(v["vλl"])+'}'}`, jitDependencies: [], pureFnDependencies: ["mion::asJSONString"], createJitFn: function get_sj_gCQYSg(utl) {
    const zT3pfXdp = utl.getPureFn("mion", "asJSONString");
    return function sj_gCQYSg(v) {
      return "{" + (function() {
        const ls0 = [];
        for (const p0 in v) {
          if ("vλl" === p0) continue;
          if (p0 !== void 0) ls0.push(zT3pfXdp(p0) + ":" + JSON.stringify(v[p0]));
        }
        if (!ls0.length) return "";
        return ls0.join(",") + ",";
      })() + '"vλl":' + JSON.stringify(v["vλl"]) + "}";
    };
  }, fn: void 0 }, "sj_OQaagS": { isNoop: false, typeName: "RpcError", fnID: "sj", jitFnHash: "sj_OQaagS", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const uErr0 = "Can not StringifyJson union: item does not belong to the union";
const sj_WEWIGI = utl.getJIT("sj_WEWIGI"); return function sj_OQaagS(v){return '{'+(v.statusCode === undefined ? '' : '"statusCode":'+v.statusCode+",")+(v.id === undefined ? '' : '"id":'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === 'string') {return JSON.stringify(v.id)}else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? '' : '"errorData":'+sj_WEWIGI.fn(v.errorData)+",")+"\\"mion@isΣrrθr\\""+':'+(v["mion@isΣrrθr"] ? 'true' : 'false')+","+'"type":'+JSON.stringify(v.type)+","+'"publicMessage":'+JSON.stringify(v.publicMessage)+'}'}`, jitDependencies: ["sj_WEWIGI"], pureFnDependencies: [], createJitFn: function get_sj_OQaagS(utl) {
    const uErr0 = "Can not StringifyJson union: item does not belong to the union";
    const sj_WEWIGI = utl.getJIT("sj_WEWIGI");
    return function sj_OQaagS(v) {
      return "{" + (v.statusCode === void 0 ? "" : '"statusCode":' + v.statusCode + ",") + (v.id === void 0 ? "" : '"id":' + (function() {
        if (Number.isFinite(v.id)) {
          return v.id;
        } else if (typeof v.id === "string") {
          return JSON.stringify(v.id);
        } else {
          throw new Error(uErr0);
        }
      })() + ",") + (v.errorData === void 0 ? "" : '"errorData":' + sj_WEWIGI.fn(v.errorData) + ",") + '"mion@isΣrrθr":' + (v["mion@isΣrrθr"] ? "true" : "false") + ',"type":' + JSON.stringify(v.type) + ',"publicMessage":' + JSON.stringify(v.publicMessage) + "}";
    };
  }, fn: void 0 }, "tBi_rFrbJx": { isNoop: false, typeName: "union", fnID: "tBi", jitFnHash: "tBi_rFrbJx", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const uErr0 = "Can not encode union to binary: item does not belong to the union";
const is_akEgIA = utl.getJIT("is_akEgIA");
const tBi_akEgIA = utl.getJIT("tBi_akEgIA");
const is_OQaagS = utl.getJIT("is_OQaagS");
const tBi_OQaagS = utl.getJIT("tBi_OQaagS"); return function tBi_rFrbJx(v,Ser){if (typeof v === 'object' && v !== null && is_akEgIA.fn(v)) {Ser.view.setUint8(Ser.index++, 0);tBi_akEgIA.fn(v,Ser)}else if (typeof v === 'object' && v !== null && is_OQaagS.fn(v)) {Ser.view.setUint8(Ser.index++, 1);tBi_OQaagS.fn(v,Ser)}else {throw new Error(uErr0);} return Ser}`, jitDependencies: ["is_akEgIA", "tBi_akEgIA", "is_OQaagS", "tBi_OQaagS"], pureFnDependencies: [], createJitFn: function get_tBi_rFrbJx(utl) {
    const uErr0 = "Can not encode union to binary: item does not belong to the union";
    const is_akEgIA = utl.getJIT("is_akEgIA");
    const tBi_akEgIA = utl.getJIT("tBi_akEgIA");
    const is_OQaagS = utl.getJIT("is_OQaagS");
    const tBi_OQaagS = utl.getJIT("tBi_OQaagS");
    return function tBi_rFrbJx(v, Ser) {
      if (typeof v === "object" && v !== null && is_akEgIA.fn(v)) {
        Ser.view.setUint8(Ser.index++, 0);
        tBi_akEgIA.fn(v, Ser);
      } else if (typeof v === "object" && v !== null && is_OQaagS.fn(v)) {
        Ser.view.setUint8(Ser.index++, 1);
        tBi_OQaagS.fn(v, Ser);
      } else {
        throw new Error(uErr0);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_akEgIA": { isNoop: false, typeName: "SerializableMethodsData", fnID: "tBi", jitFnHash: "tBi_akEgIA", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_AaIC6c = utl.getJIT("tBi_AaIC6c");
const tBi_cuUMAa = utl.getJIT("tBi_cuUMAa");
const tBi_mkeGCe = utl.getJIT("tBi_mkeGCe"); return function tBi_akEgIA(v,Ser){tBi_AaIC6c.fn(v.methods,Ser);tBi_cuUMAa.fn(v.deps,Ser);tBi_mkeGCe.fn(v.purFnDeps,Ser);
; return Ser}`, jitDependencies: ["tBi_AaIC6c", "tBi_cuUMAa", "tBi_mkeGCe"], pureFnDependencies: [], createJitFn: function get_tBi_akEgIA(utl) {
    const tBi_AaIC6c = utl.getJIT("tBi_AaIC6c");
    const tBi_cuUMAa = utl.getJIT("tBi_cuUMAa");
    const tBi_mkeGCe = utl.getJIT("tBi_mkeGCe");
    return function tBi_akEgIA(v, Ser) {
      tBi_AaIC6c.fn(v.methods, Ser);
      tBi_cuUMAa.fn(v.deps, Ser);
      tBi_mkeGCe.fn(v.purFnDeps, Ser);
      return Ser;
    };
  }, fn: void 0 }, "tBi_AaIC6c": { isNoop: false, typeName: "MethodsCache", fnID: "tBi", jitFnHash: "tBi_AaIC6c", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_LZl713 = utl.getJIT("tBi_LZl713"); return function tBi_AaIC6c(v,Ser){
 let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;
 for (const p0 in v) {Ser.serString(p0); tBi_LZl713.fn(v[p0],Ser); cnt0++;}
 Ser.view.setUint32(piI0, cnt0, 1);
 ; return Ser}`, jitDependencies: ["tBi_LZl713"], pureFnDependencies: [], createJitFn: function get_tBi_AaIC6c(utl) {
    const tBi_LZl713 = utl.getJIT("tBi_LZl713");
    return function tBi_AaIC6c(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        tBi_LZl713.fn(v[p0], Ser);
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "tBi_LZl713": { isNoop: false, typeName: "MethodWithOptions", fnID: "tBi", jitFnHash: "tBi_LZl713", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
const tBi_eQeowW = utl.getJIT("tBi_eQeowW");
const tBi_s8eky2 = utl.getJIT("tBi_s8eky2"); return function tBi_LZl713(v,Ser){Ser.view.setFloat64(Ser.index,v.type, 1, (Ser.index += 8));Ser.serString(v.id);Ser.view.setUint8(Ser.index++, !!v.isAsync);Ser.view.setUint8(Ser.index++, !!v.hasReturnData);Ser.serString(v.paramsJitHash);Ser.serString(v.returnJitHash);tBi_Ei8qua.fn(v.pointer,Ser);Ser.view.setFloat64(Ser.index,v.nestLevel, 1, (Ser.index += 8));tBi_eQeowW.fn(v.options,Ser);
const bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v.paramNames !== undefined) {tBi_Ei8qua.fn(v.paramNames,Ser);Ser.setBitMask(bmI0, 0 & 7)}if (v.headersParam !== undefined) {tBi_s8eky2.fn(v.headersParam,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.headersReturn !== undefined) {tBi_s8eky2.fn(v.headersReturn,Ser);Ser.setBitMask(bmI0, 2 & 7)}if (v.middleFnIds !== undefined) {tBi_Ei8qua.fn(v.middleFnIds,Ser);Ser.setBitMask(bmI0, 3 & 7)} return Ser}`, jitDependencies: ["tBi_Ei8qua", "tBi_eQeowW", "tBi_s8eky2"], pureFnDependencies: [], createJitFn: function get_tBi_LZl713(utl) {
    const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
    const tBi_eQeowW = utl.getJIT("tBi_eQeowW");
    const tBi_s8eky2 = utl.getJIT("tBi_s8eky2");
    return function tBi_LZl713(v, Ser) {
      Ser.view.setFloat64(Ser.index, v.type, 1, Ser.index += 8);
      Ser.serString(v.id);
      Ser.view.setUint8(Ser.index++, !!v.isAsync);
      Ser.view.setUint8(Ser.index++, !!v.hasReturnData);
      Ser.serString(v.paramsJitHash);
      Ser.serString(v.returnJitHash);
      tBi_Ei8qua.fn(v.pointer, Ser);
      Ser.view.setFloat64(Ser.index, v.nestLevel, 1, Ser.index += 8);
      tBi_eQeowW.fn(v.options, Ser);
      const bmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v.paramNames !== void 0) {
        tBi_Ei8qua.fn(v.paramNames, Ser);
        Ser.setBitMask(bmI0, 0 & 7);
      }
      if (v.headersParam !== void 0) {
        tBi_s8eky2.fn(v.headersParam, Ser);
        Ser.setBitMask(bmI0, 1 & 7);
      }
      if (v.headersReturn !== void 0) {
        tBi_s8eky2.fn(v.headersReturn, Ser);
        Ser.setBitMask(bmI0, 2 & 7);
      }
      if (v.middleFnIds !== void 0) {
        tBi_Ei8qua.fn(v.middleFnIds, Ser);
        Ser.setBitMask(bmI0, 3 & 7);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_Ei8qua": { isNoop: false, typeName: "array", fnID: "tBi", jitFnHash: "tBi_Ei8qua", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_Ei8qua(v,Ser){\n Ser.view.setUint32(Ser.index, v.length, 1); Ser.index += 4;\n for (let i0 = 0; i0 < v.length; i0++) {Ser.serString(v[i0]);}\n ; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_Ei8qua(utl) {
    return function tBi_Ei8qua(v, Ser) {
      Ser.view.setUint32(Ser.index, v.length, 1);
      Ser.index += 4;
      for (let i0 = 0; i0 < v.length; i0++) {
        Ser.serString(v[i0]);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_eQeowW": { isNoop: false, typeName: "RemoteMethodOpts", fnID: "tBi", jitFnHash: "tBi_eQeowW", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_hxdrPr = utl.getJIT("tBi_hxdrPr"); return function tBi_eQeowW(v,Ser){
const bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v.runOnError !== undefined) {Ser.view.setUint8(Ser.index++, !!v.runOnError);Ser.setBitMask(bmI0, 0 & 7)}if (v.validateParams !== undefined) {Ser.view.setUint8(Ser.index++, !!v.validateParams);Ser.setBitMask(bmI0, 1 & 7)}if (v.validateReturn !== undefined) {Ser.view.setUint8(Ser.index++, !!v.validateReturn);Ser.setBitMask(bmI0, 2 & 7)}if (v.description !== undefined) {Ser.serString(v.description);Ser.setBitMask(bmI0, 3 & 7)}if (v.serializer !== undefined) {tBi_hxdrPr.fn(v.serializer,Ser);Ser.setBitMask(bmI0, 4 & 7)}if (v.isMutation !== undefined) {Ser.view.setUint8(Ser.index++, !!v.isMutation);Ser.setBitMask(bmI0, 5 & 7)} return Ser}`, jitDependencies: ["tBi_hxdrPr"], pureFnDependencies: [], createJitFn: function get_tBi_eQeowW(utl) {
    const tBi_hxdrPr = utl.getJIT("tBi_hxdrPr");
    return function tBi_eQeowW(v, Ser) {
      const bmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v.runOnError !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v.runOnError);
        Ser.setBitMask(bmI0, 0 & 7);
      }
      if (v.validateParams !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v.validateParams);
        Ser.setBitMask(bmI0, 1 & 7);
      }
      if (v.validateReturn !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v.validateReturn);
        Ser.setBitMask(bmI0, 2 & 7);
      }
      if (v.description !== void 0) {
        Ser.serString(v.description);
        Ser.setBitMask(bmI0, 3 & 7);
      }
      if (v.serializer !== void 0) {
        tBi_hxdrPr.fn(v.serializer, Ser);
        Ser.setBitMask(bmI0, 4 & 7);
      }
      if (v.isMutation !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v.isMutation);
        Ser.setBitMask(bmI0, 5 & 7);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_hxdrPr": { isNoop: false, typeName: "SerializerMode", fnID: "tBi", jitFnHash: "tBi_hxdrPr", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const uErr0 = "Can not encode union to binary: item does not belong to the union"; return function tBi_hxdrPr(v,Ser){if (v === "json") {Ser.view.setUint8(Ser.index++, 0);}else if (v === "binary") {Ser.view.setUint8(Ser.index++, 1);}else if (v === "stringifyJson") {Ser.view.setUint8(Ser.index++, 2);}else {throw new Error(uErr0);} return Ser}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_hxdrPr(utl) {
    const uErr0 = "Can not encode union to binary: item does not belong to the union";
    return function tBi_hxdrPr(v, Ser) {
      if (v === "json") {
        Ser.view.setUint8(Ser.index++, 0);
      } else if (v === "binary") {
        Ser.view.setUint8(Ser.index++, 1);
      } else if (v === "stringifyJson") {
        Ser.view.setUint8(Ser.index++, 2);
      } else {
        throw new Error(uErr0);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_s8eky2": { isNoop: false, typeName: "HeadersMetaData", fnID: "tBi", jitFnHash: "tBi_s8eky2", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_s8eky2(v,Ser){tBi_Ei8qua.fn(v.headerNames,Ser);Ser.serString(v.jitHash);
; return Ser}`, jitDependencies: ["tBi_Ei8qua"], pureFnDependencies: [], createJitFn: function get_tBi_s8eky2(utl) {
    const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
    return function tBi_s8eky2(v, Ser) {
      tBi_Ei8qua.fn(v.headerNames, Ser);
      Ser.serString(v.jitHash);
      return Ser;
    };
  }, fn: void 0 }, "tBi_cuUMAa": { isNoop: false, typeName: "FnsDataCache", fnID: "tBi", jitFnHash: "tBi_cuUMAa", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_vnf9tn = utl.getJIT("tBi_vnf9tn"); return function tBi_cuUMAa(v,Ser){
 let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;
 for (const p0 in v) {Ser.serString(p0); tBi_vnf9tn.fn(v[p0],Ser); cnt0++;}
 Ser.view.setUint32(piI0, cnt0, 1);
 ; return Ser}`, jitDependencies: ["tBi_vnf9tn"], pureFnDependencies: [], createJitFn: function get_tBi_cuUMAa(utl) {
    const tBi_vnf9tn = utl.getJIT("tBi_vnf9tn");
    return function tBi_cuUMAa(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        tBi_vnf9tn.fn(v[p0], Ser);
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "tBi_vnf9tn": { isNoop: false, typeName: "JitCompiledFnData", fnID: "tBi", jitFnHash: "tBi_vnf9tn", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_gCQYSg = utl.getJIT("tBi_gCQYSg");
const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_vnf9tn(v,Ser){Ser.serString(v.typeName);Ser.serString(v.fnID);Ser.serString(v.jitFnHash);tBi_gCQYSg.fn(v.args,Ser);tBi_gCQYSg.fn(v.defaultParamValues,Ser);Ser.serString(v.code);tBi_Ei8qua.fn(v.jitDependencies,Ser);tBi_Ei8qua.fn(v.pureFnDependencies,Ser);
const bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v.isNoop !== undefined) {Ser.view.setUint8(Ser.index++, !!v.isNoop);Ser.setBitMask(bmI0, 0 & 7)}if (v.paramNames !== undefined) {tBi_Ei8qua.fn(v.paramNames,Ser);Ser.setBitMask(bmI0, 1 & 7)} return Ser}`, jitDependencies: ["tBi_gCQYSg", "tBi_Ei8qua"], pureFnDependencies: [], createJitFn: function get_tBi_vnf9tn(utl) {
    const tBi_gCQYSg = utl.getJIT("tBi_gCQYSg");
    const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
    return function tBi_vnf9tn(v, Ser) {
      Ser.serString(v.typeName);
      Ser.serString(v.fnID);
      Ser.serString(v.jitFnHash);
      tBi_gCQYSg.fn(v.args, Ser);
      tBi_gCQYSg.fn(v.defaultParamValues, Ser);
      Ser.serString(v.code);
      tBi_Ei8qua.fn(v.jitDependencies, Ser);
      tBi_Ei8qua.fn(v.pureFnDependencies, Ser);
      const bmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v.isNoop !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v.isNoop);
        Ser.setBitMask(bmI0, 0 & 7);
      }
      if (v.paramNames !== void 0) {
        tBi_Ei8qua.fn(v.paramNames, Ser);
        Ser.setBitMask(bmI0, 1 & 7);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_gCQYSg": { isNoop: false, typeName: "JitFnArgs", fnID: "tBi", jitFnHash: "tBi_gCQYSg", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_gCQYSg(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); Ser.serString(v[p0]); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_gCQYSg(utl) {
    return function tBi_gCQYSg(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        Ser.serString(v[p0]);
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "tBi_mkeGCe": { isNoop: false, typeName: "PureFnsDataCache", fnID: "tBi", jitFnHash: "tBi_mkeGCe", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_FX3Pr5 = utl.getJIT("tBi_FX3Pr5"); return function tBi_mkeGCe(v,Ser){
 let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;
 for (const p0 in v) {Ser.serString(p0); tBi_FX3Pr5.fn(v[p0],Ser); cnt0++;}
 Ser.view.setUint32(piI0, cnt0, 1);
 ; return Ser}`, jitDependencies: ["tBi_FX3Pr5"], pureFnDependencies: [], createJitFn: function get_tBi_mkeGCe(utl) {
    const tBi_FX3Pr5 = utl.getJIT("tBi_FX3Pr5");
    return function tBi_mkeGCe(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        tBi_FX3Pr5.fn(v[p0], Ser);
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "tBi_FX3Pr5": { isNoop: false, typeName: "Record", fnID: "tBi", jitFnHash: "tBi_FX3Pr5", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_QqGqA2 = utl.getJIT("tBi_QqGqA2"); return function tBi_FX3Pr5(v,Ser){
 let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;
 for (const p0 in v) {Ser.serString(p0); tBi_QqGqA2.fn(v[p0],Ser); cnt0++;}
 Ser.view.setUint32(piI0, cnt0, 1);
 ; return Ser}`, jitDependencies: ["tBi_QqGqA2"], pureFnDependencies: [], createJitFn: function get_tBi_FX3Pr5(utl) {
    const tBi_QqGqA2 = utl.getJIT("tBi_QqGqA2");
    return function tBi_FX3Pr5(v, Ser) {
      let cnt0 = 0;
      const piI0 = Ser.index;
      Ser.index += 4;
      for (const p0 in v) {
        Ser.serString(p0);
        tBi_QqGqA2.fn(v[p0], Ser);
        cnt0++;
      }
      Ser.view.setUint32(piI0, cnt0, 1);
      return Ser;
    };
  }, fn: void 0 }, "tBi_QqGqA2": { isNoop: false, typeName: "PureFunctionData", fnID: "tBi", jitFnHash: "tBi_QqGqA2", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_QqGqA2(v,Ser){Ser.serString(v.namespace);tBi_Ei8qua.fn(v.paramNames,Ser);Ser.serString(v.code);Ser.serString(v.fnName);Ser.serString(v.bodyHash);tBi_Ei8qua.fn(v.pureFnDependencies,Ser);
; return Ser}`, jitDependencies: ["tBi_Ei8qua"], pureFnDependencies: [], createJitFn: function get_tBi_QqGqA2(utl) {
    const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
    return function tBi_QqGqA2(v, Ser) {
      Ser.serString(v.namespace);
      tBi_Ei8qua.fn(v.paramNames, Ser);
      Ser.serString(v.code);
      Ser.serString(v.fnName);
      Ser.serString(v.bodyHash);
      tBi_Ei8qua.fn(v.pureFnDependencies, Ser);
      return Ser;
    };
  }, fn: void 0 }, "tBi_OQaagS": { isNoop: false, typeName: "RpcError", fnID: "tBi", jitFnHash: "tBi_OQaagS", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const uErr1 = "Can not encode union to binary: item does not belong to the union";
const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_OQaagS(v,Ser){;Ser.serString(v.publicMessage);
const bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === 'string') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);}else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.statusCode !== undefined) {Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.setBitMask(bmI0, 2 & 7)} return Ser}`, jitDependencies: ["tBi_WEWIGI"], pureFnDependencies: [], createJitFn: function get_tBi_OQaagS(utl) {
    const uErr1 = "Can not encode union to binary: item does not belong to the union";
    const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
    return function tBi_OQaagS(v, Ser) {
      Ser.serString(v.publicMessage);
      const bmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v.id !== void 0) {
        if (Number.isFinite(v.id)) {
          Ser.view.setUint8(Ser.index++, 0);
          Ser.view.setFloat64(Ser.index, v.id, 1, Ser.index += 8);
        } else if (typeof v.id === "string") {
          Ser.view.setUint8(Ser.index++, 1);
          Ser.serString(v.id);
        } else {
          throw new Error(uErr1);
        }
        Ser.setBitMask(bmI0, 0 & 7);
      }
      if (v.errorData !== void 0) {
        tBi_WEWIGI.fn(v.errorData, Ser);
        Ser.setBitMask(bmI0, 1 & 7);
      }
      if (v.statusCode !== void 0) {
        Ser.view.setFloat64(Ser.index, v.statusCode, 1, Ser.index += 8);
        Ser.setBitMask(bmI0, 2 & 7);
      }
      return Ser;
    };
  }, fn: void 0 }, "fBi_rFrbJx": { isNoop: false, typeName: "union", fnID: "fBi", jitFnHash: "fBi_rFrbJx", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const uErr0 = "Can not binary decode union: invalid union index";
const fBi_akEgIA = utl.getJIT("fBi_akEgIA");
const fBi_OQaagS = utl.getJIT("fBi_OQaagS"); return function fBi_rFrbJx(ret,Des){
 const dec0 = Des.view.getUint8(Des.index++);
 if (dec0 === 0) {ret = fBi_akEgIA.fn(undefined,Des)}else if (dec0 === 1) {ret = fBi_OQaagS.fn(undefined,Des)}
 else {throw new Error(uErr0)}
 ; return ret}`, jitDependencies: ["fBi_akEgIA", "fBi_OQaagS"], pureFnDependencies: [], createJitFn: function get_fBi_rFrbJx(utl) {
    const uErr0 = "Can not binary decode union: invalid union index";
    const fBi_akEgIA = utl.getJIT("fBi_akEgIA");
    const fBi_OQaagS = utl.getJIT("fBi_OQaagS");
    return function fBi_rFrbJx(ret, Des) {
      const dec0 = Des.view.getUint8(Des.index++);
      if (dec0 === 0) {
        ret = fBi_akEgIA.fn(void 0, Des);
      } else if (dec0 === 1) {
        ret = fBi_OQaagS.fn(void 0, Des);
      } else {
        throw new Error(uErr0);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_akEgIA": { isNoop: false, typeName: "SerializableMethodsData", fnID: "fBi", jitFnHash: "fBi_akEgIA", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_AaIC6c = utl.getJIT("fBi_AaIC6c");
const fBi_cuUMAa = utl.getJIT("fBi_cuUMAa");
const fBi_mkeGCe = utl.getJIT("fBi_mkeGCe"); return function fBi_akEgIA(ret,Des){return {methods:fBi_AaIC6c.fn(undefined,Des),deps:fBi_cuUMAa.fn(undefined,Des),purFnDeps:fBi_mkeGCe.fn(undefined,Des)}}`, jitDependencies: ["fBi_AaIC6c", "fBi_cuUMAa", "fBi_mkeGCe"], pureFnDependencies: [], createJitFn: function get_fBi_akEgIA(utl) {
    const fBi_AaIC6c = utl.getJIT("fBi_AaIC6c");
    const fBi_cuUMAa = utl.getJIT("fBi_cuUMAa");
    const fBi_mkeGCe = utl.getJIT("fBi_mkeGCe");
    return function fBi_akEgIA(ret, Des) {
      return { methods: fBi_AaIC6c.fn(void 0, Des), deps: fBi_cuUMAa.fn(void 0, Des), purFnDeps: fBi_mkeGCe.fn(void 0, Des) };
    };
  }, fn: void 0 }, "fBi_AaIC6c": { isNoop: false, typeName: "MethodsCache", fnID: "fBi", jitFnHash: "fBi_AaIC6c", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_LZl713 = utl.getJIT("fBi_LZl713"); return function fBi_AaIC6c(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_LZl713.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_LZl713"], pureFnDependencies: [], createJitFn: function get_fBi_AaIC6c(utl) {
    const fBi_LZl713 = utl.getJIT("fBi_LZl713");
    return function fBi_AaIC6c(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = fBi_LZl713.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_LZl713": { isNoop: false, typeName: "MethodWithOptions", fnID: "fBi", jitFnHash: "fBi_LZl713", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
const fBi_eQeowW = utl.getJIT("fBi_eQeowW");
const fBi_s8eky2 = utl.getJIT("fBi_s8eky2"); return function fBi_LZl713(ret,Des){ret = {type:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),id:Des.desString(),isAsync:Des.view.getUint8(Des.index++) === 1,hasReturnData:Des.view.getUint8(Des.index++) === 1,paramsJitHash:Des.desString(),returnJitHash:Des.desString(),pointer:fBi_Ei8qua.fn(undefined,Des),nestLevel:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),options:fBi_eQeowW.fn(undefined,Des)}

const bimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.paramNames = fBi_Ei8qua.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.headersParam = fBi_s8eky2.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.headersReturn = fBi_s8eky2.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {ret.middleFnIds = fBi_Ei8qua.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_Ei8qua", "fBi_eQeowW", "fBi_s8eky2"], pureFnDependencies: [], createJitFn: function get_fBi_LZl713(utl) {
    const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
    const fBi_eQeowW = utl.getJIT("fBi_eQeowW");
    const fBi_s8eky2 = utl.getJIT("fBi_s8eky2");
    return function fBi_LZl713(ret, Des) {
      ret = { type: Des.view.getFloat64(Des.index, 1, Des.index += 8), id: Des.desString(), isAsync: Des.view.getUint8(Des.index++) === 1, hasReturnData: Des.view.getUint8(Des.index++) === 1, paramsJitHash: Des.desString(), returnJitHash: Des.desString(), pointer: fBi_Ei8qua.fn(void 0, Des), nestLevel: Des.view.getFloat64(Des.index, 1, Des.index += 8), options: fBi_eQeowW.fn(void 0, Des) };
      const bimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(bimI0, 1) & 1 << (0 & 7)) {
        ret.paramNames = fBi_Ei8qua.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (1 & 7)) {
        ret.headersParam = fBi_s8eky2.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (2 & 7)) {
        ret.headersReturn = fBi_s8eky2.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (3 & 7)) {
        ret.middleFnIds = fBi_Ei8qua.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_Ei8qua": { isNoop: false, typeName: "array", fnID: "fBi", jitFnHash: "fBi_Ei8qua", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_Ei8qua(ret,Des){\n const arrL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = new Array(arrL0);\n for (let i0 = 0; i0 < arrL0; i0++) {ret[i0] = Des.desString();}\n ; return ret}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_Ei8qua(utl) {
    return function fBi_Ei8qua(ret, Des) {
      const arrL0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = new Array(arrL0);
      for (let i0 = 0; i0 < arrL0; i0++) {
        ret[i0] = Des.desString();
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_eQeowW": { isNoop: false, typeName: "RemoteMethodOpts", fnID: "fBi", jitFnHash: "fBi_eQeowW", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_hxdrPr = utl.getJIT("fBi_hxdrPr"); return function fBi_eQeowW(ret,Des){ret = {}

const bimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.runOnError = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.validateParams = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.validateReturn = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {ret.description = Des.desString();}if (Des.view.getUint8(bimI0, 1) & (1 << (4 & 7))) {ret.serializer = fBi_hxdrPr.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (5 & 7))) {ret.isMutation = Des.view.getUint8(Des.index++) === 1;} return ret}`, jitDependencies: ["fBi_hxdrPr"], pureFnDependencies: [], createJitFn: function get_fBi_eQeowW(utl) {
    const fBi_hxdrPr = utl.getJIT("fBi_hxdrPr");
    return function fBi_eQeowW(ret, Des) {
      ret = {};
      const bimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(bimI0, 1) & 1 << (0 & 7)) {
        ret.runOnError = Des.view.getUint8(Des.index++) === 1;
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (1 & 7)) {
        ret.validateParams = Des.view.getUint8(Des.index++) === 1;
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (2 & 7)) {
        ret.validateReturn = Des.view.getUint8(Des.index++) === 1;
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (3 & 7)) {
        ret.description = Des.desString();
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (4 & 7)) {
        ret.serializer = fBi_hxdrPr.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (5 & 7)) {
        ret.isMutation = Des.view.getUint8(Des.index++) === 1;
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_hxdrPr": { isNoop: false, typeName: "SerializerMode", fnID: "fBi", jitFnHash: "fBi_hxdrPr", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const uErr0 = "Can not binary decode union: invalid union index"; return function fBi_hxdrPr(ret,Des){
 const dec0 = Des.view.getUint8(Des.index++);
 if (dec0 === 0) {ret = "json"}else if (dec0 === 1) {ret = "binary"}else if (dec0 === 2) {ret = "stringifyJson"}
 else {throw new Error(uErr0)}
 ; return ret}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_hxdrPr(utl) {
    const uErr0 = "Can not binary decode union: invalid union index";
    return function fBi_hxdrPr(ret, Des) {
      const dec0 = Des.view.getUint8(Des.index++);
      if (dec0 === 0) {
        ret = "json";
      } else if (dec0 === 1) {
        ret = "binary";
      } else if (dec0 === 2) {
        ret = "stringifyJson";
      } else {
        throw new Error(uErr0);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_s8eky2": { isNoop: false, typeName: "HeadersMetaData", fnID: "fBi", jitFnHash: "fBi_s8eky2", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_s8eky2(ret,Des){return {headerNames:fBi_Ei8qua.fn(undefined,Des),jitHash:Des.desString()}}`, jitDependencies: ["fBi_Ei8qua"], pureFnDependencies: [], createJitFn: function get_fBi_s8eky2(utl) {
    const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
    return function fBi_s8eky2(ret, Des) {
      return { headerNames: fBi_Ei8qua.fn(void 0, Des), jitHash: Des.desString() };
    };
  }, fn: void 0 }, "fBi_cuUMAa": { isNoop: false, typeName: "FnsDataCache", fnID: "fBi", jitFnHash: "fBi_cuUMAa", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_vnf9tn = utl.getJIT("fBi_vnf9tn"); return function fBi_cuUMAa(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_vnf9tn.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_vnf9tn"], pureFnDependencies: [], createJitFn: function get_fBi_cuUMAa(utl) {
    const fBi_vnf9tn = utl.getJIT("fBi_vnf9tn");
    return function fBi_cuUMAa(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = fBi_vnf9tn.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_vnf9tn": { isNoop: false, typeName: "JitCompiledFnData", fnID: "fBi", jitFnHash: "fBi_vnf9tn", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_gCQYSg = utl.getJIT("fBi_gCQYSg");
const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_vnf9tn(ret,Des){ret = {typeName:Des.desString(),fnID:Des.desString(),jitFnHash:Des.desString(),args:fBi_gCQYSg.fn(undefined,Des),defaultParamValues:fBi_gCQYSg.fn(undefined,Des),code:Des.desString(),jitDependencies:fBi_Ei8qua.fn(undefined,Des),pureFnDependencies:fBi_Ei8qua.fn(undefined,Des)}

const bimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.isNoop = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.paramNames = fBi_Ei8qua.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_gCQYSg", "fBi_Ei8qua"], pureFnDependencies: [], createJitFn: function get_fBi_vnf9tn(utl) {
    const fBi_gCQYSg = utl.getJIT("fBi_gCQYSg");
    const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
    return function fBi_vnf9tn(ret, Des) {
      ret = { typeName: Des.desString(), fnID: Des.desString(), jitFnHash: Des.desString(), args: fBi_gCQYSg.fn(void 0, Des), defaultParamValues: fBi_gCQYSg.fn(void 0, Des), code: Des.desString(), jitDependencies: fBi_Ei8qua.fn(void 0, Des), pureFnDependencies: fBi_Ei8qua.fn(void 0, Des) };
      const bimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(bimI0, 1) & 1 << (0 & 7)) {
        ret.isNoop = Des.view.getUint8(Des.index++) === 1;
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (1 & 7)) {
        ret.paramNames = fBi_Ei8qua.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_gCQYSg": { isNoop: false, typeName: "JitFnArgs", fnID: "fBi", jitFnHash: "fBi_gCQYSg", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_gCQYSg(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = Des.desString();} return ret}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_gCQYSg(utl) {
    return function fBi_gCQYSg(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = Des.desString();
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_mkeGCe": { isNoop: false, typeName: "PureFnsDataCache", fnID: "fBi", jitFnHash: "fBi_mkeGCe", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_FX3Pr5 = utl.getJIT("fBi_FX3Pr5"); return function fBi_mkeGCe(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_FX3Pr5.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_FX3Pr5"], pureFnDependencies: [], createJitFn: function get_fBi_mkeGCe(utl) {
    const fBi_FX3Pr5 = utl.getJIT("fBi_FX3Pr5");
    return function fBi_mkeGCe(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = fBi_FX3Pr5.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_FX3Pr5": { isNoop: false, typeName: "Record", fnID: "fBi", jitFnHash: "fBi_FX3Pr5", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_QqGqA2 = utl.getJIT("fBi_QqGqA2"); return function fBi_FX3Pr5(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_QqGqA2.fn(undefined,Des);} return ret}`, jitDependencies: ["fBi_QqGqA2"], pureFnDependencies: [], createJitFn: function get_fBi_FX3Pr5(utl) {
    const fBi_QqGqA2 = utl.getJIT("fBi_QqGqA2");
    return function fBi_FX3Pr5(ret, Des) {
      const cnt0 = Des.view.getUint32(Des.index, 1);
      Des.index += 4;
      ret = {};
      for (let propI0 = 0; propI0 < cnt0; propI0++) {
        const p0 = Des.desSafePropName();
        ret[p0] = fBi_QqGqA2.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_QqGqA2": { isNoop: false, typeName: "PureFunctionData", fnID: "fBi", jitFnHash: "fBi_QqGqA2", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_QqGqA2(ret,Des){return {namespace:Des.desString(),paramNames:fBi_Ei8qua.fn(undefined,Des),code:Des.desString(),fnName:Des.desString(),bodyHash:Des.desString(),pureFnDependencies:fBi_Ei8qua.fn(undefined,Des)}}`, jitDependencies: ["fBi_Ei8qua"], pureFnDependencies: [], createJitFn: function get_fBi_QqGqA2(utl) {
    const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
    return function fBi_QqGqA2(ret, Des) {
      return { namespace: Des.desString(), paramNames: fBi_Ei8qua.fn(void 0, Des), code: Des.desString(), fnName: Des.desString(), bodyHash: Des.desString(), pureFnDependencies: fBi_Ei8qua.fn(void 0, Des) };
    };
  }, fn: void 0 }, "fBi_OQaagS": { isNoop: false, typeName: "RpcError", fnID: "fBi", jitFnHash: "fBi_OQaagS", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const uErr1 = "Can not binary decode union: invalid union index";
const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_OQaagS(ret,Des){ret = {"mion@isΣrrθr":true,type:"rpc-metadata-not-found",publicMessage:Des.desString()}

const bimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
 const dec1 = Des.view.getUint8(Des.index++);
 if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}
 else {throw new Error(uErr1)}
 ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}`, jitDependencies: ["fBi_WEWIGI"], pureFnDependencies: [], createJitFn: function get_fBi_OQaagS(utl) {
    const uErr1 = "Can not binary decode union: invalid union index";
    const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
    return function fBi_OQaagS(ret, Des) {
      ret = { "mion@isΣrrθr": true, type: "rpc-metadata-not-found", publicMessage: Des.desString() };
      const bimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(bimI0, 1) & 1 << (0 & 7)) {
        const dec1 = Des.view.getUint8(Des.index++);
        if (dec1 === 0) {
          ret.id = Des.view.getFloat64(Des.index, 1, Des.index += 8);
        } else if (dec1 === 1) {
          ret.id = Des.desString();
        } else {
          throw new Error(uErr1);
        }
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (1 & 7)) {
        ret.errorData = fBi_WEWIGI.fn(void 0, Des);
      }
      if (Des.view.getUint8(bimI0, 1) & 1 << (2 & 7)) {
        ret.statusCode = Des.view.getFloat64(Des.index, 1, Des.index += 8);
      }
      let desFn0 = utl.getDeserializeFn("RpcError");
      if (desFn0) {
        ret = desFn0(ret);
      } else if (desFn0 = utl.getSerializeClass("RpcError")) {
        ret = new desFn0(ret);
      }
      return ret;
    };
  }, fn: void 0 }, "is_hZzD9z": { isNoop: false, typeName: "params", fnID: "is", jitFnHash: "is_hZzD9z", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_hZzD9z(v){return (v.length <= 2 && typeof v[0] === 'string' && (v[1] === undefined || (typeof v[1] === 'boolean')))}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_hZzD9z(utl) {
    return function is_hZzD9z(v) {
      return v.length <= 2 && typeof v[0] === "string" && (v[1] === void 0 || typeof v[1] === "boolean");
    };
  }, fn: void 0 }, "te_hZzD9z": { isNoop: false, typeName: "params", fnID: "te", jitFnHash: "te_hZzD9z", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_hZzD9z(v,pth=[],er=[]){if (v.length > 2) Iqa2M8Ms(pth,er,"params"); else {if (typeof v[0] !== 'string') Iqa2M8Ms(pth,er,"string",[0]);if (v[1] !== undefined) {if (typeof v[1] !== 'boolean') Iqa2M8Ms(pth,er,"boolean",[1]);}} return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_hZzD9z(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_hZzD9z(v, pth = [], er = []) {
      if (v.length > 2) Iqa2M8Ms(pth, er, "params");
      else {
        if (typeof v[0] !== "string") Iqa2M8Ms(pth, er, "string", [0]);
        if (v[1] !== void 0) {
          if (typeof v[1] !== "boolean") Iqa2M8Ms(pth, er, "boolean", [1]);
        }
      }
      return er;
    };
  }, fn: void 0 }, "tj_hZzD9z": { isNoop: false, typeName: "params", fnID: "tj", jitFnHash: "tj_hZzD9z", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_hZzD9z(v){if (v[1] === undefined ) {if (v.length > 1) v[1] = null} return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_hZzD9z(utl) {
    return function tj_hZzD9z(v) {
      if (v[1] === void 0) {
        if (v.length > 1) v[1] = null;
      }
      return v;
    };
  }, fn: void 0 }, "fj_hZzD9z": { isNoop: false, typeName: "params", fnID: "fj", jitFnHash: "fj_hZzD9z", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_hZzD9z(v){if (v[1] === null ) {v[1] = undefined} return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_hZzD9z(utl) {
    return function fj_hZzD9z(v) {
      if (v[1] === null) {
        v[1] = void 0;
      }
      return v;
    };
  }, fn: void 0 }, "sj_hZzD9z": { isNoop: false, typeName: "params", fnID: "sj", jitFnHash: "sj_hZzD9z", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function sj_hZzD9z(v){return '['+JSON.stringify(v[0])+(v[1] === undefined ? ','+'null' : ','+(v[1] ? 'true' : 'false'))+']'}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_hZzD9z(utl) {
    return function sj_hZzD9z(v) {
      return "[" + JSON.stringify(v[0]) + (v[1] === void 0 ? ",null" : "," + (v[1] ? "true" : "false")) + "]";
    };
  }, fn: void 0 }, "tBi_hZzD9z": { isNoop: false, typeName: "params", fnID: "tBi", jitFnHash: "tBi_hZzD9z", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_hZzD9z(v,Ser){const tbmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v[0] !== undefined) {Ser.serString(v[0]);Ser.setBitMask(tbmI0, 0)} if (v[1] !== undefined) {Ser.view.setUint8(Ser.index++, !!v[1]);Ser.setBitMask(tbmI0, 1)} ; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_hZzD9z(utl) {
    return function tBi_hZzD9z(v, Ser) {
      const tbmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v[0] !== void 0) {
        Ser.serString(v[0]);
        Ser.setBitMask(tbmI0, 0);
      }
      if (v[1] !== void 0) {
        Ser.view.setUint8(Ser.index++, !!v[1]);
        Ser.setBitMask(tbmI0, 1);
      }
      return Ser;
    };
  }, fn: void 0 }, "fBi_hZzD9z": { isNoop: false, typeName: "params", fnID: "fBi", jitFnHash: "fBi_hZzD9z", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_hZzD9z(ret,Des){ret = [];const tbimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(tbimI0, 1) & (1 << (0))) {ret[0] = Des.desString()} if (Des.view.getUint8(tbimI0, 1) & (1 << (1))) {ret[1] = Des.view.getUint8(Des.index++) === 1} ; return ret}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_hZzD9z(utl) {
    return function fBi_hZzD9z(ret, Des) {
      ret = [];
      const tbimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(tbimI0, 1) & 1 << 0) {
        ret[0] = Des.desString();
      }
      if (Des.view.getUint8(tbimI0, 1) & 1 << 1) {
        ret[1] = Des.view.getUint8(Des.index++) === 1;
      }
      return ret;
    };
  }, fn: void 0 }, "is_rjFxDZ": { isNoop: false, typeName: "params", fnID: "is", jitFnHash: "is_rjFxDZ", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_aQ6a8G = utl.getJIT("is_aQ6a8G"); return function is_rjFxDZ(v){return (v.length <= 1 && is_aQ6a8G.fn(v[0]))}`, jitDependencies: ["is_aQ6a8G"], pureFnDependencies: [], createJitFn: function get_is_rjFxDZ(utl) {
    const is_aQ6a8G = utl.getJIT("is_aQ6a8G");
    return function is_rjFxDZ(v) {
      return v.length <= 1 && is_aQ6a8G.fn(v[0]);
    };
  }, fn: void 0 }, "is_aQ6a8G": { isNoop: false, typeName: "SimpleUser", fnID: "is", jitFnHash: "is_aQ6a8G", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_aQ6a8G(v){return (typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.surname === 'string')}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_aQ6a8G(utl) {
    return function is_aQ6a8G(v) {
      return typeof v === "object" && v !== null && typeof v.name === "string" && typeof v.surname === "string";
    };
  }, fn: void 0 }, "te_rjFxDZ": { isNoop: false, typeName: "params", fnID: "te", jitFnHash: "te_rjFxDZ", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const te_aQ6a8G = utl.getJIT("te_aQ6a8G");
const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_rjFxDZ(v,pth=[],er=[]){if (v.length > 1) Iqa2M8Ms(pth,er,"params"); else {pth.push(0); te_aQ6a8G.fn(v[0],pth,er); pth.splice(-1);} return er}`, jitDependencies: ["te_aQ6a8G"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_rjFxDZ(utl) {
    const te_aQ6a8G = utl.getJIT("te_aQ6a8G");
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_rjFxDZ(v, pth = [], er = []) {
      if (v.length > 1) Iqa2M8Ms(pth, er, "params");
      else {
        pth.push(0);
        te_aQ6a8G.fn(v[0], pth, er);
        pth.splice(-1);
      }
      return er;
    };
  }, fn: void 0 }, "te_aQ6a8G": { isNoop: false, typeName: "SimpleUser", fnID: "te", jitFnHash: "te_aQ6a8G", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_aQ6a8G(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null)) {
 Iqa2M8Ms(pth,er,"object");
 } else {
 if (typeof v.name !== 'string') Iqa2M8Ms(pth,er,"string",["name"]);if (typeof v.surname !== 'string') Iqa2M8Ms(pth,er,"string",["surname"]);
 }
 ; return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_aQ6a8G(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_aQ6a8G(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null)) {
        Iqa2M8Ms(pth, er, "object");
      } else {
        if (typeof v.name !== "string") Iqa2M8Ms(pth, er, "string", ["name"]);
        if (typeof v.surname !== "string") Iqa2M8Ms(pth, er, "string", ["surname"]);
      }
      return er;
    };
  }, fn: void 0 }, "tj_rjFxDZ": { isNoop: true, typeName: "params", fnID: "tj", jitFnHash: "tj_rjFxDZ", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_rjFxDZ(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_rjFxDZ(utl) {
    return function tj_rjFxDZ(v) {
      return v;
    };
  }, fn: void 0 }, "tj_aQ6a8G": { isNoop: true, typeName: "SimpleUser", fnID: "tj", jitFnHash: "tj_aQ6a8G", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_aQ6a8G(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_aQ6a8G(utl) {
    return function tj_aQ6a8G(v) {
      return v;
    };
  }, fn: void 0 }, "fj_rjFxDZ": { isNoop: true, typeName: "params", fnID: "fj", jitFnHash: "fj_rjFxDZ", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_rjFxDZ(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_rjFxDZ(utl) {
    return function fj_rjFxDZ(v) {
      return v;
    };
  }, fn: void 0 }, "fj_aQ6a8G": { isNoop: true, typeName: "SimpleUser", fnID: "fj", jitFnHash: "fj_aQ6a8G", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_aQ6a8G(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_aQ6a8G(utl) {
    return function fj_aQ6a8G(v) {
      return v;
    };
  }, fn: void 0 }, "sj_rjFxDZ": { isNoop: false, typeName: "params", fnID: "sj", jitFnHash: "sj_rjFxDZ", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_aQ6a8G = utl.getJIT("sj_aQ6a8G"); return function sj_rjFxDZ(v){return '['+sj_aQ6a8G.fn(v[0])+']'}`, jitDependencies: ["sj_aQ6a8G"], pureFnDependencies: [], createJitFn: function get_sj_rjFxDZ(utl) {
    const sj_aQ6a8G = utl.getJIT("sj_aQ6a8G");
    return function sj_rjFxDZ(v) {
      return "[" + sj_aQ6a8G.fn(v[0]) + "]";
    };
  }, fn: void 0 }, "sj_aQ6a8G": { isNoop: false, typeName: "SimpleUser", fnID: "sj", jitFnHash: "sj_aQ6a8G", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict';  return function sj_aQ6a8G(v){return '{'+'"name":'+JSON.stringify(v.name)+","+'"surname":'+JSON.stringify(v.surname)+'}'}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_aQ6a8G(utl) {
    return function sj_aQ6a8G(v) {
      return '{"name":' + JSON.stringify(v.name) + ',"surname":' + JSON.stringify(v.surname) + "}";
    };
  }, fn: void 0 }, "tBi_rjFxDZ": { isNoop: false, typeName: "params", fnID: "tBi", jitFnHash: "tBi_rjFxDZ", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_aQ6a8G = utl.getJIT("tBi_aQ6a8G"); return function tBi_rjFxDZ(v,Ser){const tbmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v[0] !== undefined) {tBi_aQ6a8G.fn(v[0],Ser);Ser.setBitMask(tbmI0, 0)} ; return Ser}`, jitDependencies: ["tBi_aQ6a8G"], pureFnDependencies: [], createJitFn: function get_tBi_rjFxDZ(utl) {
    const tBi_aQ6a8G = utl.getJIT("tBi_aQ6a8G");
    return function tBi_rjFxDZ(v, Ser) {
      const tbmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v[0] !== void 0) {
        tBi_aQ6a8G.fn(v[0], Ser);
        Ser.setBitMask(tbmI0, 0);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_aQ6a8G": { isNoop: false, typeName: "SimpleUser", fnID: "tBi", jitFnHash: "tBi_aQ6a8G", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_aQ6a8G(v,Ser){Ser.serString(v.name);Ser.serString(v.surname);\n; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_aQ6a8G(utl) {
    return function tBi_aQ6a8G(v, Ser) {
      Ser.serString(v.name);
      Ser.serString(v.surname);
      return Ser;
    };
  }, fn: void 0 }, "fBi_rjFxDZ": { isNoop: false, typeName: "params", fnID: "fBi", jitFnHash: "fBi_rjFxDZ", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_aQ6a8G = utl.getJIT("fBi_aQ6a8G"); return function fBi_rjFxDZ(ret,Des){ret = [];const tbimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(tbimI0, 1) & (1 << (0))) {ret[0] = fBi_aQ6a8G.fn(undefined,Des)} ; return ret}`, jitDependencies: ["fBi_aQ6a8G"], pureFnDependencies: [], createJitFn: function get_fBi_rjFxDZ(utl) {
    const fBi_aQ6a8G = utl.getJIT("fBi_aQ6a8G");
    return function fBi_rjFxDZ(ret, Des) {
      ret = [];
      const tbimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(tbimI0, 1) & 1 << 0) {
        ret[0] = fBi_aQ6a8G.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_aQ6a8G": { isNoop: false, typeName: "SimpleUser", fnID: "fBi", jitFnHash: "fBi_aQ6a8G", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_aQ6a8G(ret,Des){return {name:Des.desString(),surname:Des.desString()}}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_aQ6a8G(utl) {
    return function fBi_aQ6a8G(ret, Des) {
      return { name: Des.desString(), surname: Des.desString() };
    };
  }, fn: void 0 }, "is_jRXlR9": { isNoop: false, typeName: "SimpleUser", fnID: "is", jitFnHash: "is_jRXlR9", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_jRXlR9(v){return (typeof v === 'object' && v !== null && typeof v.name === 'string' && typeof v.surname === 'string')}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_jRXlR9(utl) {
    return function is_jRXlR9(v) {
      return typeof v === "object" && v !== null && typeof v.name === "string" && typeof v.surname === "string";
    };
  }, fn: void 0 }, "te_jRXlR9": { isNoop: false, typeName: "SimpleUser", fnID: "te", jitFnHash: "te_jRXlR9", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_jRXlR9(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null)) {
 Iqa2M8Ms(pth,er,"object");
 } else {
 if (typeof v.name !== 'string') Iqa2M8Ms(pth,er,"string",["name"]);if (typeof v.surname !== 'string') Iqa2M8Ms(pth,er,"string",["surname"]);
 }
 ; return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_jRXlR9(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_jRXlR9(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null)) {
        Iqa2M8Ms(pth, er, "object");
      } else {
        if (typeof v.name !== "string") Iqa2M8Ms(pth, er, "string", ["name"]);
        if (typeof v.surname !== "string") Iqa2M8Ms(pth, er, "string", ["surname"]);
      }
      return er;
    };
  }, fn: void 0 }, "tj_jRXlR9": { isNoop: true, typeName: "SimpleUser", fnID: "tj", jitFnHash: "tj_jRXlR9", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_jRXlR9(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_jRXlR9(utl) {
    return function tj_jRXlR9(v) {
      return v;
    };
  }, fn: void 0 }, "fj_jRXlR9": { isNoop: true, typeName: "SimpleUser", fnID: "fj", jitFnHash: "fj_jRXlR9", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_jRXlR9(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_jRXlR9(utl) {
    return function fj_jRXlR9(v) {
      return v;
    };
  }, fn: void 0 }, "sj_jRXlR9": { isNoop: false, typeName: "SimpleUser", fnID: "sj", jitFnHash: "sj_jRXlR9", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict';  return function sj_jRXlR9(v){return '{'+'"name":'+JSON.stringify(v.name)+","+'"surname":'+JSON.stringify(v.surname)+'}'}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_jRXlR9(utl) {
    return function sj_jRXlR9(v) {
      return '{"name":' + JSON.stringify(v.name) + ',"surname":' + JSON.stringify(v.surname) + "}";
    };
  }, fn: void 0 }, "tBi_jRXlR9": { isNoop: false, typeName: "SimpleUser", fnID: "tBi", jitFnHash: "tBi_jRXlR9", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_jRXlR9(v,Ser){Ser.serString(v.name);Ser.serString(v.surname);\n; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_jRXlR9(utl) {
    return function tBi_jRXlR9(v, Ser) {
      Ser.serString(v.name);
      Ser.serString(v.surname);
      return Ser;
    };
  }, fn: void 0 }, "fBi_jRXlR9": { isNoop: false, typeName: "SimpleUser", fnID: "fBi", jitFnHash: "fBi_jRXlR9", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_jRXlR9(ret,Des){return {name:Des.desString(),surname:Des.desString()}}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_jRXlR9(utl) {
    return function fBi_jRXlR9(ret, Des) {
      return { name: Des.desString(), surname: Des.desString() };
    };
  }, fn: void 0 }, "is_gqqoWu": { isNoop: false, typeName: "params", fnID: "is", jitFnHash: "is_gqqoWu", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const is_btp3Jb = utl.getJIT("is_btp3Jb"); return function is_gqqoWu(v){return (v.length <= 1 && (v[0] === undefined || (is_btp3Jb.fn(v[0]))))}`, jitDependencies: ["is_btp3Jb"], pureFnDependencies: [], createJitFn: function get_is_gqqoWu(utl) {
    const is_btp3Jb = utl.getJIT("is_btp3Jb");
    return function is_gqqoWu(v) {
      return v.length <= 1 && (v[0] === void 0 || is_btp3Jb.fn(v[0]));
    };
  }, fn: void 0 }, "is_btp3Jb": { isNoop: false, typeName: "DataPoint", fnID: "is", jitFnHash: "is_btp3Jb", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_btp3Jb(v){return (typeof v === 'object' && v !== null && (v.date instanceof Date && !isNaN(v.date.getTime())))}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_btp3Jb(utl) {
    return function is_btp3Jb(v) {
      return typeof v === "object" && v !== null && (v.date instanceof Date && !isNaN(v.date.getTime()));
    };
  }, fn: void 0 }, "te_gqqoWu": { isNoop: false, typeName: "params", fnID: "te", jitFnHash: "te_gqqoWu", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const te_btp3Jb = utl.getJIT("te_btp3Jb");
const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_gqqoWu(v,pth=[],er=[]){if (v.length > 1) Iqa2M8Ms(pth,er,"params"); else {if (v[0] !== undefined) {pth.push(0); te_btp3Jb.fn(v[0],pth,er); pth.splice(-1);}} return er}`, jitDependencies: ["te_btp3Jb"], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_gqqoWu(utl) {
    const te_btp3Jb = utl.getJIT("te_btp3Jb");
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_gqqoWu(v, pth = [], er = []) {
      if (v.length > 1) Iqa2M8Ms(pth, er, "params");
      else {
        if (v[0] !== void 0) {
          pth.push(0);
          te_btp3Jb.fn(v[0], pth, er);
          pth.splice(-1);
        }
      }
      return er;
    };
  }, fn: void 0 }, "te_btp3Jb": { isNoop: false, typeName: "DataPoint", fnID: "te", jitFnHash: "te_btp3Jb", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_btp3Jb(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null)) {
 Iqa2M8Ms(pth,er,"object");
 } else {
 if (!(v.date instanceof Date && !isNaN(v.date.getTime()))) Iqa2M8Ms(pth,er,"date",["date"]);
 }
 ; return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_btp3Jb(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_btp3Jb(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null)) {
        Iqa2M8Ms(pth, er, "object");
      } else {
        if (!(v.date instanceof Date && !isNaN(v.date.getTime()))) Iqa2M8Ms(pth, er, "date", ["date"]);
      }
      return er;
    };
  }, fn: void 0 }, "tj_gqqoWu": { isNoop: false, typeName: "params", fnID: "tj", jitFnHash: "tj_gqqoWu", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_gqqoWu(v){if (v[0] === undefined ) {if (v.length > 0) v[0] = null} return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_gqqoWu(utl) {
    return function tj_gqqoWu(v) {
      if (v[0] === void 0) {
        if (v.length > 0) v[0] = null;
      }
      return v;
    };
  }, fn: void 0 }, "tj_btp3Jb": { isNoop: true, typeName: "DataPoint", fnID: "tj", jitFnHash: "tj_btp3Jb", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_btp3Jb(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_btp3Jb(utl) {
    return function tj_btp3Jb(v) {
      return v;
    };
  }, fn: void 0 }, "fj_gqqoWu": { isNoop: false, typeName: "params", fnID: "fj", jitFnHash: "fj_gqqoWu", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const fj_btp3Jb = utl.getJIT("fj_btp3Jb"); return function fj_gqqoWu(v){if (v[0] === null ) {v[0] = undefined} else if (v[0] !== undefined) {v[0] = fj_btp3Jb.fn(v[0]);} return v}`, jitDependencies: ["fj_btp3Jb"], pureFnDependencies: [], createJitFn: function get_fj_gqqoWu(utl) {
    const fj_btp3Jb = utl.getJIT("fj_btp3Jb");
    return function fj_gqqoWu(v) {
      if (v[0] === null) {
        v[0] = void 0;
      } else if (v[0] !== void 0) {
        v[0] = fj_btp3Jb.fn(v[0]);
      }
      return v;
    };
  }, fn: void 0 }, "fj_btp3Jb": { isNoop: false, typeName: "DataPoint", fnID: "fj", jitFnHash: "fj_btp3Jb", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_btp3Jb(v){v.date = new Date(v.date); return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_btp3Jb(utl) {
    return function fj_btp3Jb(v) {
      v.date = new Date(v.date);
      return v;
    };
  }, fn: void 0 }, "sj_gqqoWu": { isNoop: false, typeName: "params", fnID: "sj", jitFnHash: "sj_gqqoWu", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict'; const sj_btp3Jb = utl.getJIT("sj_btp3Jb"); return function sj_gqqoWu(v){return '['+(v[0] === undefined ? 'null' : sj_btp3Jb.fn(v[0]))+']'}`, jitDependencies: ["sj_btp3Jb"], pureFnDependencies: [], createJitFn: function get_sj_gqqoWu(utl) {
    const sj_btp3Jb = utl.getJIT("sj_btp3Jb");
    return function sj_gqqoWu(v) {
      return "[" + (v[0] === void 0 ? "null" : sj_btp3Jb.fn(v[0])) + "]";
    };
  }, fn: void 0 }, "sj_btp3Jb": { isNoop: false, typeName: "DataPoint", fnID: "sj", jitFnHash: "sj_btp3Jb", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict';  return function sj_btp3Jb(v){return '{'+'"date":'+'"'+v.date.toJSON()+'"'+'}'}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_btp3Jb(utl) {
    return function sj_btp3Jb(v) {
      return '{"date":"' + v.date.toJSON() + '"}';
    };
  }, fn: void 0 }, "tBi_gqqoWu": { isNoop: false, typeName: "params", fnID: "tBi", jitFnHash: "tBi_gqqoWu", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: `'use strict'; const tBi_btp3Jb = utl.getJIT("tBi_btp3Jb"); return function tBi_gqqoWu(v,Ser){const tbmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)
if (v[0] !== undefined) {tBi_btp3Jb.fn(v[0],Ser);Ser.setBitMask(tbmI0, 0)} ; return Ser}`, jitDependencies: ["tBi_btp3Jb"], pureFnDependencies: [], createJitFn: function get_tBi_gqqoWu(utl) {
    const tBi_btp3Jb = utl.getJIT("tBi_btp3Jb");
    return function tBi_gqqoWu(v, Ser) {
      const tbmI0 = Ser.index;
      Ser.view.setUint8(Ser.index++, 0);
      if (v[0] !== void 0) {
        tBi_btp3Jb.fn(v[0], Ser);
        Ser.setBitMask(tbmI0, 0);
      }
      return Ser;
    };
  }, fn: void 0 }, "tBi_btp3Jb": { isNoop: false, typeName: "DataPoint", fnID: "tBi", jitFnHash: "tBi_btp3Jb", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_btp3Jb(v,Ser){Ser.view.setFloat64(Ser.index, v.date.getTime(), 1, (Ser.index += 8));\n; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_btp3Jb(utl) {
    return function tBi_btp3Jb(v, Ser) {
      Ser.view.setFloat64(Ser.index, v.date.getTime(), 1, Ser.index += 8);
      return Ser;
    };
  }, fn: void 0 }, "fBi_gqqoWu": { isNoop: false, typeName: "params", fnID: "fBi", jitFnHash: "fBi_gqqoWu", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: `'use strict'; const fBi_btp3Jb = utl.getJIT("fBi_btp3Jb"); return function fBi_gqqoWu(ret,Des){ret = [];const tbimI0 = Des.index; Des.index += 1;
if (Des.view.getUint8(tbimI0, 1) & (1 << (0))) {ret[0] = fBi_btp3Jb.fn(undefined,Des)} ; return ret}`, jitDependencies: ["fBi_btp3Jb"], pureFnDependencies: [], createJitFn: function get_fBi_gqqoWu(utl) {
    const fBi_btp3Jb = utl.getJIT("fBi_btp3Jb");
    return function fBi_gqqoWu(ret, Des) {
      ret = [];
      const tbimI0 = Des.index;
      Des.index += 1;
      if (Des.view.getUint8(tbimI0, 1) & 1 << 0) {
        ret[0] = fBi_btp3Jb.fn(void 0, Des);
      }
      return ret;
    };
  }, fn: void 0 }, "fBi_btp3Jb": { isNoop: false, typeName: "DataPoint", fnID: "fBi", jitFnHash: "fBi_btp3Jb", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_btp3Jb(ret,Des){return {date:new Date(Des.view.getFloat64(Des.index, 1, (Des.index += 8)))}}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_btp3Jb(utl) {
    return function fBi_btp3Jb(ret, Des) {
      return { date: new Date(Des.view.getFloat64(Des.index, 1, Des.index += 8)) };
    };
  }, fn: void 0 }, "is_MKk6Uk": { isNoop: false, typeName: "DataPoint", fnID: "is", jitFnHash: "is_MKk6Uk", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function is_MKk6Uk(v){return (typeof v === 'object' && v !== null && (v.date instanceof Date && !isNaN(v.date.getTime())))}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_is_MKk6Uk(utl) {
    return function is_MKk6Uk(v) {
      return typeof v === "object" && v !== null && (v.date instanceof Date && !isNaN(v.date.getTime()));
    };
  }, fn: void 0 }, "te_MKk6Uk": { isNoop: false, typeName: "DataPoint", fnID: "te", jitFnHash: "te_MKk6Uk", args: { "pλth": "pth", "εrr": "er", "vλl": "v" }, defaultParamValues: { "pλth": "[]", "εrr": "[]", "vλl": "" }, code: `'use strict'; const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr"); return function te_MKk6Uk(v,pth=[],er=[]){
 if (!(typeof v === 'object' && v !== null)) {
 Iqa2M8Ms(pth,er,"object");
 } else {
 if (!(v.date instanceof Date && !isNaN(v.date.getTime()))) Iqa2M8Ms(pth,er,"date",["date"]);
 }
 ; return er}`, jitDependencies: [], pureFnDependencies: ["mion::newRunTypeErr"], createJitFn: function get_te_MKk6Uk(utl) {
    const Iqa2M8Ms = utl.getPureFn("mion", "newRunTypeErr");
    return function te_MKk6Uk(v, pth = [], er = []) {
      if (!(typeof v === "object" && v !== null)) {
        Iqa2M8Ms(pth, er, "object");
      } else {
        if (!(v.date instanceof Date && !isNaN(v.date.getTime()))) Iqa2M8Ms(pth, er, "date", ["date"]);
      }
      return er;
    };
  }, fn: void 0 }, "tj_MKk6Uk": { isNoop: true, typeName: "DataPoint", fnID: "tj", jitFnHash: "tj_MKk6Uk", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function tj_MKk6Uk(v){return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tj_MKk6Uk(utl) {
    return function tj_MKk6Uk(v) {
      return v;
    };
  }, fn: void 0 }, "fj_MKk6Uk": { isNoop: false, typeName: "DataPoint", fnID: "fj", jitFnHash: "fj_MKk6Uk", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: "'use strict';  return function fj_MKk6Uk(v){v.date = new Date(v.date); return v}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fj_MKk6Uk(utl) {
    return function fj_MKk6Uk(v) {
      v.date = new Date(v.date);
      return v;
    };
  }, fn: void 0 }, "sj_MKk6Uk": { isNoop: false, typeName: "DataPoint", fnID: "sj", jitFnHash: "sj_MKk6Uk", args: { "vλl": "v" }, defaultParamValues: { "vλl": "" }, code: `'use strict';  return function sj_MKk6Uk(v){return '{'+'"date":'+'"'+v.date.toJSON()+'"'+'}'}`, jitDependencies: [], pureFnDependencies: [], createJitFn: function get_sj_MKk6Uk(utl) {
    return function sj_MKk6Uk(v) {
      return '{"date":"' + v.date.toJSON() + '"}';
    };
  }, fn: void 0 }, "tBi_MKk6Uk": { isNoop: false, typeName: "DataPoint", fnID: "tBi", jitFnHash: "tBi_MKk6Uk", args: { "sεr": "Ser", "vλl": "v" }, defaultParamValues: { "sεr": "", "vλl": "" }, code: "'use strict';  return function tBi_MKk6Uk(v,Ser){Ser.view.setFloat64(Ser.index, v.date.getTime(), 1, (Ser.index += 8));\n; return Ser}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_tBi_MKk6Uk(utl) {
    return function tBi_MKk6Uk(v, Ser) {
      Ser.view.setFloat64(Ser.index, v.date.getTime(), 1, Ser.index += 8);
      return Ser;
    };
  }, fn: void 0 }, "fBi_MKk6Uk": { isNoop: false, typeName: "DataPoint", fnID: "fBi", jitFnHash: "fBi_MKk6Uk", args: { "dεs": "Des", "vλl": "ret" }, defaultParamValues: { "dεs": "", "vλl": "" }, code: "'use strict';  return function fBi_MKk6Uk(ret,Des){return {date:new Date(Des.view.getFloat64(Des.index, 1, (Des.index += 8)))}}", jitDependencies: [], pureFnDependencies: [], createJitFn: function get_fBi_MKk6Uk(utl) {
    return function fBi_MKk6Uk(ret, Des) {
      return { date: new Date(Des.view.getFloat64(Des.index, 1, Des.index += 8)) };
    };
  }, fn: void 0 } };
  const routerCache = { "@thrownErrors": { paramNames: [], type: 1, id: "@thrownErrors", isAsync: false, hasReturnData: true, paramsJitHash: "", returnJitHash: "cm6MsK", pointer: ["@thrownErrors"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "json" } }, "mion@notFound": { paramNames: [], type: 1, id: "mion@notFound", isAsync: false, hasReturnData: true, paramsJitHash: "", returnJitHash: "a8UQwC", pointer: ["mion@notFound"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "json" } }, "mion@platformError": { paramNames: [], type: 1, id: "mion@platformError", isAsync: false, hasReturnData: true, paramsJitHash: "", returnJitHash: "zxRrbt", pointer: ["mion@platformError"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "json" } }, "mion@methodsMetadataById": { paramNames: ["methodsIds", "getAllRemoteMethods"], type: 1, id: "mion@methodsMetadataById", isAsync: false, hasReturnData: true, paramsJitHash: "JtnVhp", returnJitHash: "rFrbJx", pointer: ["mion@methodsMetadataById"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "stringifyJson" } }, "mion@methodsMetadataByPath": { paramNames: ["path", "getAllRemoteMethods"], type: 1, id: "mion@methodsMetadataByPath", isAsync: false, hasReturnData: true, paramsJitHash: "hZzD9z", returnJitHash: "rFrbJx", pointer: ["mion@methodsMetadataByPath"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "stringifyJson" } }, "changeUserName": { paramNames: ["user"], type: 1, id: "changeUserName", isAsync: false, hasReturnData: true, paramsJitHash: "rjFxDZ", returnJitHash: "jRXlR9", pointer: ["changeUserName"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "json" } }, "getDate": { paramNames: ["dataPoint"], type: 1, id: "getDate", isAsync: false, hasReturnData: true, paramsJitHash: "gqqoWu", returnJitHash: "MKk6Uk", pointer: ["getDate"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "json" } }, "updateHeaders": { paramNames: [], type: 1, id: "updateHeaders", isAsync: false, hasReturnData: false, paramsJitHash: "", returnJitHash: "", pointer: ["updateHeaders"], nestLevel: 0, options: { runOnError: false, validateParams: true, validateReturn: false, serializer: "json" } } };
  function loadAOTCaches() {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
  }
  loadAOTCaches.__type = ["loadAOTCaches", "P$/!"];
  function getRawAOTCaches() {
    return {
      jitFnsCache,
      pureFnsCache,
      routerCache
    };
  }
  getRawAOTCaches.__type = ["getRawAOTCaches", 'P"/!'];
  function loadRouterAOTCaches() {
    loadAOTCaches();
    loadCompiledMethods(getRawAOTCaches().routerCache);
  }
  loadRouterAOTCaches.__type = ["loadRouterAOTCaches", "P$/!"];
  const aotCacheLoader = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    loadRouterAOTCaches
  }, Symbol.toStringTag, { value: "Module" }));
  function __assignType(fn, args) {
    fn.__type = args;
    return fn;
  }
  const __ΩAOTCacheMessage = ["mion-aot-caches", "type", "jitFnsCode", "pureFnsCode", "routerCacheCode", "AOTCacheMessage", 'P.!4"&4#&4$&4%Mw&y'];
  const __ΩSerializedCaches = ["jitFnsCode", "pureFnsCode", "routerCacheCode", "SerializedCaches", 'P&4!&4"&4#Mw$y'];
  const EXCLUDED_JIT_FN_IDS = [JIT_FUNCTION_IDS.toJSCode];
  const EXCLUDED_PURE_FN_NAMES = ["sanitizeCompiledFn"];
  async function getSerializedCaches() {
    const { jitFnsCache: jitFnsCache2, pureFnsCache: pureFnsCache2 } = getJitFnCaches();
    const routerCache2 = getPersistedMethods();
    return serializeCachesToCode(jitFnsCache2, pureFnsCache2, routerCache2);
  }
  getSerializedCaches.__type = [() => __ΩSerializedCaches, "getSerializedCaches", 'Pn!`/"'];
  async function emitAOTCaches() {
    if (!isMionAOTEmitMode())
      return;
    if (getENV("MION_COMPILE") === "viteSSR")
      return;
    if (typeof process.send !== "function")
      return;
    const { jitFnsCache: jitFnsCache2, pureFnsCache: pureFnsCache2 } = getJitFnCaches();
    const routerCache2 = getPersistedMethods();
    const serialized = await serializeCachesToCode(jitFnsCache2, pureFnsCache2, routerCache2);
    const message = {
      type: "mion-aot-caches",
      ...serialized
    };
    process.send(message);
  }
  emitAOTCaches.__type = ["emitAOTCaches", "P$`/!"];
  async function serializeCachesToCode(jitFnsCache2, pureFnsCache2, routerCache2) {
    const jitToJSCode = (runTypes.createToJavascriptFn.Ω = [[() => __ΩSrcCodeJITCompiledFnsCache, "n!"]], runTypes.createToJavascriptFn());
    const pureToJSCode = (runTypes.createToJavascriptFn.Ω = [[() => __ΩSrcCodePureFunctionsCache, "n!"]], runTypes.createToJavascriptFn());
    const routerToJSCode = (runTypes.createToJavascriptFn.Ω = [[() => __ΩMethodsCache, "n!"]], runTypes.createToJavascriptFn());
    const finalJitFns = filterExcludedJitFns(jitFnsCache2, EXCLUDED_JIT_FN_IDS);
    const finalPureFns = filterExcludedPureFns(pureFnsCache2, EXCLUDED_PURE_FN_NAMES);
    return {
      jitFnsCode: jitToJSCode(finalJitFns),
      pureFnsCode: pureToJSCode(finalPureFns),
      routerCacheCode: routerToJSCode(routerCache2)
    };
  }
  serializeCachesToCode.__type = [() => __ΩJitFunctionsCache, "jitFnsCache", () => __ΩPureFunctionsCache, "pureFnsCache", () => __ΩMethodsCache, "routerCache", () => __ΩSerializedCaches, "serializeCachesToCode", "Pn!2\"n#2$n%2&n'`/("];
  function filterExcludedJitFns(jitFnsCache2, excludedFnIds) {
    if (!excludedFnIds.length)
      return jitFnsCache2;
    return Object.fromEntries(Object.entries(jitFnsCache2).filter(__assignType(([, value]) => !excludedFnIds.includes(value.fnID), ["param0", "", 'P"2!"/"'])));
  }
  filterExcludedJitFns.__type = [() => __ΩJitFunctionsCache, "jitFnsCache", "excludedFnIds", () => __ΩJitFunctionsCache, "filterExcludedJitFns", 'Pn!2"&F2#n$/%'];
  function filterExcludedPureFns(pureFnsCache2, excludedFnNames) {
    if (!excludedFnNames.length)
      return pureFnsCache2;
    return Object.fromEntries(Object.entries(pureFnsCache2).map(__assignType(([namespace, nsCache]) => [
      namespace,
      Object.fromEntries(Object.entries(nsCache).filter(__assignType(([, value]) => !excludedFnNames.includes(value.fnName), ["param0", "", 'P"2!"/"'])))
    ], ["param0", "", 'P"2!"/"'])));
  }
  filterExcludedPureFns.__type = [() => __ΩPureFunctionsCache, "pureFnsCache", "excludedFnNames", () => __ΩPureFunctionsCache, "filterExcludedPureFns", 'Pn!2"&F2#n$/%'];
  const aotEmitter = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    __ΩAOTCacheMessage,
    __ΩSerializedCaches,
    emitAOTCaches,
    getSerializedCaches,
    serializeCachesToCode
  }, Symbol.toStringTag, { value: "Module" }));
  exports.__ΩEdgeSetupOptions = __ΩEdgeSetupOptions;
  exports.resetServer = resetServer;
  exports.setup = setup;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
})(this.EdgeTestServer = this.EdgeTestServer || {});
//# sourceMappingURL=test-server-edge.js.map

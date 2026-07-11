"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const src_vitePlugin_mionVitePlugin = require("./src/vite-plugin/mionVitePlugin.cjs");
const src_vitePlugin_cjsPackageJsonPlugin = require("./src/vite-plugin/cjsPackageJsonPlugin.cjs");
const src_vitePlugin_constants = require("./src/vite-plugin/constants.cjs");
exports.mionVitePlugin = src_vitePlugin_mionVitePlugin.mionVitePlugin;
exports.serverReady = src_vitePlugin_mionVitePlugin.serverReady;
exports.cjsPackageJsonPlugin = src_vitePlugin_cjsPackageJsonPlugin.cjsPackageJsonPlugin;
exports.VIRTUAL_AOT_JIT_FNS = src_vitePlugin_constants.VIRTUAL_AOT_JIT_FNS;
exports.VIRTUAL_AOT_PURE_FNS = src_vitePlugin_constants.VIRTUAL_AOT_PURE_FNS;
exports.VIRTUAL_AOT_ROUTER_CACHE = src_vitePlugin_constants.VIRTUAL_AOT_ROUTER_CACHE;
exports.VIRTUAL_PURE_FUNCTIONS = src_vitePlugin_constants.VIRTUAL_SERVER_PURE_FNS;
//# sourceMappingURL=index.cjs.map

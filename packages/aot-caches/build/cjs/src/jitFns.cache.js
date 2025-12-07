"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const jitFnsCache = {
	is_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "is",
		jitFnHash: "is_JtnVhp",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_b1N57x = utl.getJIT(\"is_b1N57x\"); return function is_JtnVhp(v){return (v.length <= 2 && is_b1N57x.fn(v[0]) && (v[1] === undefined || (typeof v[1] === 'boolean')))}",
		dependenciesSet: new Set(["is_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_b1N57x = utl.getJIT("is_b1N57x");
			return function is_JtnVhp(v) {
				return (
					v.length <= 2 &&
					is_b1N57x.fn(v[0]) &&
					(v[1] === undefined || typeof v[1] === "boolean")
				);
			};
		},
		fn: undefined,
	},
	is_b1N57x: {
		isNoop: false,
		typeName: "array",
		fnID: "is",
		jitFnHash: "is_b1N57x",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_b1N57x(v){\n if (!Array.isArray(v)) return false;\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = typeof v[i0] === 'string';\n if (!(res0)) return false;\n }\n return true;\n }",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_b1N57x(v) {
				if (!Array.isArray(v)) return false;
				for (let i0 = 0; i0 < v.length; i0++) {
					const res0 = typeof v[i0] === "string";
					if (!res0) return false;
				}
				return true;
			};
		},
		fn: undefined,
	},
	te_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "te",
		jitFnHash: "te_JtnVhp",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const te_b1N57x = utl.getJIT("te_b1N57x"); return function te_JtnVhp(v,pth=[],er=[]){if (v.length > 2) utl.err(pth,er,"params"); else {pth.push(0); te_b1N57x.fn(v[0],pth,er); pth.splice(-1);if (v[1] !== undefined) {if (typeof v[1] !== \'boolean\') utl.err(pth,er,"boolean",[1]);}} return er}',
		dependenciesSet: new Set(["te_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const te_b1N57x = utl.getJIT("te_b1N57x");
			return function te_JtnVhp(v, pth = [], er = []) {
				if (v.length > 2) utl.err(pth, er, "params");
				else {
					pth.push(0);
					te_b1N57x.fn(v[0], pth, er);
					pth.splice(-1);
					if (v[1] !== undefined) {
						if (typeof v[1] !== "boolean") utl.err(pth, er, "boolean", [1]);
					}
				}
				return er;
			};
		},
		fn: undefined,
	},
	te_b1N57x: {
		isNoop: false,
		typeName: "array",
		fnID: "te",
		jitFnHash: "te_b1N57x",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: ' return function te_b1N57x(v,pth=[],er=[]){if (!Array.isArray(v)) {utl.err(pth,er,"array")} else {for (let i0 = 0; i0 < v.length; i0++) {if (typeof v[i0] !== \'string\') utl.err(pth,er,"string",[i0]);}} return er}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function te_b1N57x(v, pth = [], er = []) {
				if (!Array.isArray(v)) {
					utl.err(pth, er, "array");
				} else {
					for (let i0 = 0; i0 < v.length; i0++) {
						if (typeof v[i0] !== "string") utl.err(pth, er, "string", [i0]);
					}
				}
				return er;
			};
		},
		fn: undefined,
	},
	tj_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "tj",
		jitFnHash: "tj_JtnVhp",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_JtnVhp(v){if (v[1] === undefined ) {if (v.length > 1) v[1] = null} return v}",
		dependenciesSet: new Set(["tj_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_JtnVhp(v) {
				if (v[1] === undefined) {
					if (v.length > 1) v[1] = null;
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_b1N57x: {
		isNoop: true,
		typeName: "array",
		fnID: "tj",
		jitFnHash: "tj_b1N57x",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_b1N57x(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_b1N57x(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "fj",
		jitFnHash: "fj_JtnVhp",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_JtnVhp(v){if (v[1] === null ) {v[1] = undefined} return v}",
		dependenciesSet: new Set(["fj_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_JtnVhp(v) {
				if (v[1] === null) {
					v[1] = undefined;
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_b1N57x: {
		isNoop: true,
		typeName: "array",
		fnID: "fj",
		jitFnHash: "fj_b1N57x",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_b1N57x(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_b1N57x(v) {
				return v;
			};
		},
		fn: undefined,
	},
	js_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "js",
		jitFnHash: "js_JtnVhp",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_b1N57x = utl.getJIT(\"js_b1N57x\"); return function js_JtnVhp(v){return '['+js_b1N57x.fn(v[0])+(v[1] === undefined ? ','+'null' : ','+(v[1] ? 'true' : 'false'))+']'}",
		dependenciesSet: new Set(["js_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_b1N57x = utl.getJIT("js_b1N57x");
			return function js_JtnVhp(v) {
				return (
					"[" +
					js_b1N57x.fn(v[0]) +
					(v[1] === undefined
						? "," + "null"
						: "," + (v[1] ? "true" : "false")) +
					"]"
				);
			};
		},
		fn: undefined,
	},
	js_b1N57x: {
		isNoop: false,
		typeName: "array",
		fnID: "js",
		jitFnHash: "js_b1N57x",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_b1N57x(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = utl.asJSONString(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_b1N57x(v) {
				const ls0 = [];
				for (let i0 = 0; i0 < v.length; i0++) {
					const res0 = utl.asJSONString(v[i0]);
					ls0.push(res0);
				}
				return "[" + ls0.join(",") + "]";
			};
		},
		fn: undefined,
	},
	tBi_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "tBi",
		jitFnHash: "tBi_JtnVhp",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_b1N57x = utl.getJIT("tBi_b1N57x"); return function tBi_JtnVhp(v,Ser){tBi_b1N57x.fn(v[0],Ser);if (v[1] !== undefined){Ser.view.setUint8(Ser.index++, 1);Ser.view.setUint8(Ser.index++, !!v[1]);} else {Ser.view.setUint8(Ser.index++, 0)} return Ser}',
		dependenciesSet: new Set(["tBi_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_b1N57x = utl.getJIT("tBi_b1N57x");
			return function tBi_JtnVhp(v, Ser) {
				tBi_b1N57x.fn(v[0], Ser);
				if (v[1] !== undefined) {
					Ser.view.setUint8(Ser.index++, 1);
					Ser.view.setUint8(Ser.index++, !!v[1]);
				} else {
					Ser.view.setUint8(Ser.index++, 0);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_b1N57x: {
		isNoop: false,
		typeName: "array",
		fnID: "tBi",
		jitFnHash: "tBi_b1N57x",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_b1N57x(v,Ser){\n Ser.view.setUint32(Ser.index, v.length, 1); Ser.index += 4;\n for (let i0 = 0; i0 < v.length; i0++) {Ser.serString(v[i0]);}\n ; return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_b1N57x(v, Ser) {
				Ser.view.setUint32(Ser.index, v.length, 1);
				Ser.index += 4;
				for (let i0 = 0; i0 < v.length; i0++) {
					Ser.serString(v[i0]);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	fBi_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "fBi",
		jitFnHash: "fBi_JtnVhp",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_b1N57x = utl.getJIT("fBi_b1N57x"); return function fBi_JtnVhp(ret,Des){ret = [];ret[0] = fBi_b1N57x.fn(undefined,Des);if (Des.view.getUint8(Des.index++) === 1){ret[1] = Des.view.getUint8(Des.index++) === 1} return ret}',
		dependenciesSet: new Set(["fBi_b1N57x"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_b1N57x = utl.getJIT("fBi_b1N57x");
			return function fBi_JtnVhp(ret, Des) {
				ret = [];
				ret[0] = fBi_b1N57x.fn(undefined, Des);
				if (Des.view.getUint8(Des.index++) === 1) {
					ret[1] = Des.view.getUint8(Des.index++) === 1;
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_b1N57x: {
		isNoop: false,
		typeName: "array",
		fnID: "fBi",
		jitFnHash: "fBi_b1N57x",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_b1N57x(ret,Des){\n const arrL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = new Array(arrL0);\n for (let i0 = 0; i0 < arrL0; i0++) {ret[i0] = Des.desString();}\n ; return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_b1N57x(ret, Des) {
				const arrL0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = new Array(arrL0);
				for (let i0 = 0; i0 < arrL0; i0++) {
					ret[i0] = Des.desString();
				}
				return ret;
			};
		},
		fn: undefined,
	},
	is_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "is",
		jitFnHash: "is_EUIgsu",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_Ik8k60 = utl.getJIT("is_Ik8k60");\nconst uKOpts0 = {checkNonJitProps: true};\nconst hk_Ik8k60 = utl.getJIT("hk_Ik8k60");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T");\nconst hk_R7hJ5T = utl.getJIT("hk_R7hJ5T"); return function is_EUIgsu(v){return ((typeof v === \'object\' && v !== null && ((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v,uKOpts0)) || (is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v,uKOpts0)))))}',
		dependenciesSet: new Set([
			"is_Ik8k60",
			"is_tP7Vvb",
			"is_cE6uKo",
			"is_Ei8qua",
			"is_GAquSa",
			"is_hzbJrn",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
			"is_tf5dpV",
			"is_EmCqyw",
			"is_gCQYSg",
			"hk_Ik8k60",
			"hk_tP7Vvb",
			"hk_cE6uKo",
			"hk_Ei8qua",
			"hk_GAquSa",
			"hk_hzbJrn",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
			"hk_tf5dpV",
			"hk_EmCqyw",
			"hk_gCQYSg",
			"is_R7hJ5T",
			"is_WEWIGI",
			"hk_R7hJ5T",
			"hk_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_Ik8k60 = utl.getJIT("is_Ik8k60");
			const uKOpts0 = { checkNonJitProps: true };
			const hk_Ik8k60 = utl.getJIT("hk_Ik8k60");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			const hk_R7hJ5T = utl.getJIT("hk_R7hJ5T");
			return function is_EUIgsu(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v, uKOpts0)) ||
						(is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v, uKOpts0)))
				);
			};
		},
		fn: undefined,
	},
	is_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "is",
		jitFnHash: "is_Ik8k60",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_tP7Vvb = utl.getJIT("is_tP7Vvb");\nconst is_GAquSa = utl.getJIT("is_GAquSa");\nconst is_tf5dpV = utl.getJIT("is_tf5dpV"); return function is_Ik8k60(v){return (is_tP7Vvb.fn(v.purFnDeps) && is_GAquSa.fn(v.methods) && is_tf5dpV.fn(v.deps))}',
		dependenciesSet: new Set([
			"is_tP7Vvb",
			"is_cE6uKo",
			"is_Ei8qua",
			"is_GAquSa",
			"is_hzbJrn",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
			"is_tf5dpV",
			"is_EmCqyw",
			"is_gCQYSg",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_tP7Vvb = utl.getJIT("is_tP7Vvb");
			const is_GAquSa = utl.getJIT("is_GAquSa");
			const is_tf5dpV = utl.getJIT("is_tf5dpV");
			return function is_Ik8k60(v) {
				return (
					is_tP7Vvb.fn(v.purFnDeps) &&
					is_GAquSa.fn(v.methods) &&
					is_tf5dpV.fn(v.deps)
				);
			};
		},
		fn: undefined,
	},
	is_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "is",
		jitFnHash: "is_tP7Vvb",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_cE6uKo = utl.getJIT(\"is_cE6uKo\"); return function is_tP7Vvb(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_cE6uKo.fn(v[p0]))) return false;} return true;})())}",
		dependenciesSet: new Set(["is_cE6uKo", "is_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_cE6uKo = utl.getJIT("is_cE6uKo");
			return function is_tP7Vvb(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(function () {
						for (const p0 in v) {
							if (!is_cE6uKo.fn(v[p0])) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "is",
		jitFnHash: "is_cE6uKo",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_Ei8qua = utl.getJIT(\"is_Ei8qua\"); return function is_cE6uKo(v){return (typeof v === 'object' && v !== null && is_Ei8qua.fn(v.paramNames) && typeof v.code === 'string' && typeof v.pureFnHash === 'string' && (function(){\n if (!(v.dependencies instanceof Set)) return false;\n for (const it0 of v.dependencies) {if (!(typeof it0 === 'string')) return false} return true;\n })())}",
		dependenciesSet: new Set(["is_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			return function is_cE6uKo(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					is_Ei8qua.fn(v.paramNames) &&
					typeof v.code === "string" &&
					typeof v.pureFnHash === "string" &&
					(function () {
						if (!(v.dependencies instanceof Set)) return false;
						for (const it0 of v.dependencies) {
							if (!(typeof it0 === "string")) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_Ei8qua: {
		isNoop: false,
		typeName: "array",
		fnID: "is",
		jitFnHash: "is_Ei8qua",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_Ei8qua(v){\n if (!Array.isArray(v)) return false;\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = typeof v[i0] === 'string';\n if (!(res0)) return false;\n }\n return true;\n }",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_Ei8qua(v) {
				if (!Array.isArray(v)) return false;
				for (let i0 = 0; i0 < v.length; i0++) {
					const res0 = typeof v[i0] === "string";
					if (!res0) return false;
				}
				return true;
			};
		},
		fn: undefined,
	},
	is_GAquSa: {
		isNoop: false,
		typeName: "SerializablePublicMethods",
		fnID: "is",
		jitFnHash: "is_GAquSa",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_hzbJrn = utl.getJIT(\"is_hzbJrn\"); return function is_GAquSa(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_hzbJrn.fn(v[p0]))) return false;} return true;})())}",
		dependenciesSet: new Set([
			"is_hzbJrn",
			"is_Ei8qua",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_hzbJrn = utl.getJIT("is_hzbJrn");
			return function is_GAquSa(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(function () {
						for (const p0 in v) {
							if (!is_hzbJrn.fn(v[p0])) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_hzbJrn: {
		isNoop: false,
		typeName: "SerializablePublicMethod",
		fnID: "is",
		jitFnHash: "is_hzbJrn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_Ei8qua = utl.getJIT("is_Ei8qua");\nconst is_bzlNFR = utl.getJIT("is_bzlNFR");\nconst is_JNJ3FN = utl.getJIT("is_JNJ3FN");\nconst is_Bt1x9j = utl.getJIT("is_Bt1x9j"); return function is_hzbJrn(v){return (typeof v === \'object\' && v !== null && Number.isFinite(v.type) && typeof v.id === \'string\' && (v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)) && is_bzlNFR.fn(v.paramsJitHashes) && is_bzlNFR.fn(v.returnJitHashes) && (v.headersParam === undefined || is_JNJ3FN.fn(v.headersParam)) && (v.headersReturn === undefined || is_JNJ3FN.fn(v.headersReturn)) && (v.hookIds === undefined || is_Ei8qua.fn(v.hookIds)) && (v.pathPointers === undefined || is_Bt1x9j.fn(v.pathPointers)))}',
		dependenciesSet: new Set([
			"is_Ei8qua",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			const is_bzlNFR = utl.getJIT("is_bzlNFR");
			const is_JNJ3FN = utl.getJIT("is_JNJ3FN");
			const is_Bt1x9j = utl.getJIT("is_Bt1x9j");
			return function is_hzbJrn(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					Number.isFinite(v.type) &&
					typeof v.id === "string" &&
					(v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)) &&
					is_bzlNFR.fn(v.paramsJitHashes) &&
					is_bzlNFR.fn(v.returnJitHashes) &&
					(v.headersParam === undefined || is_JNJ3FN.fn(v.headersParam)) &&
					(v.headersReturn === undefined || is_JNJ3FN.fn(v.headersReturn)) &&
					(v.hookIds === undefined || is_Ei8qua.fn(v.hookIds)) &&
					(v.pathPointers === undefined || is_Bt1x9j.fn(v.pathPointers))
				);
			};
		},
		fn: undefined,
	},
	is_bzlNFR: {
		isNoop: false,
		typeName: "JitFunctionsHashes",
		fnID: "is",
		jitFnHash: "is_bzlNFR",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_bzlNFR(v){return (typeof v === 'object' && v !== null && typeof v.isType === 'string' && typeof v.typeErrors === 'string' && typeof v.prepareForJson === 'string' && typeof v.restoreFromJson === 'string' && typeof v.jsonStringify === 'string' && typeof v.toBinary === 'string' && typeof v.fromBinary === 'string')}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_bzlNFR(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					typeof v.isType === "string" &&
					typeof v.typeErrors === "string" &&
					typeof v.prepareForJson === "string" &&
					typeof v.restoreFromJson === "string" &&
					typeof v.jsonStringify === "string" &&
					typeof v.toBinary === "string" &&
					typeof v.fromBinary === "string"
				);
			};
		},
		fn: undefined,
	},
	is_JNJ3FN: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "is",
		jitFnHash: "is_JNJ3FN",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_Ei8qua = utl.getJIT("is_Ei8qua");\nconst is_okWaie = utl.getJIT("is_okWaie"); return function is_JNJ3FN(v){return (typeof v === \'object\' && v !== null && is_Ei8qua.fn(v.headerNames) && is_okWaie.fn(v.jitHashes))}',
		dependenciesSet: new Set(["is_Ei8qua", "is_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			const is_okWaie = utl.getJIT("is_okWaie");
			return function is_JNJ3FN(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					is_Ei8qua.fn(v.headerNames) &&
					is_okWaie.fn(v.jitHashes)
				);
			};
		},
		fn: undefined,
	},
	is_okWaie: {
		isNoop: false,
		typeName: "Pick",
		fnID: "is",
		jitFnHash: "is_okWaie",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_okWaie(v){return (typeof v === 'object' && v !== null && typeof v.isType === 'string' && typeof v.typeErrors === 'string')}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_okWaie(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					typeof v.isType === "string" &&
					typeof v.typeErrors === "string"
				);
			};
		},
		fn: undefined,
	},
	is_Bt1x9j: {
		isNoop: false,
		typeName: "array",
		fnID: "is",
		jitFnHash: "is_Bt1x9j",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_Ei8qua = utl.getJIT("is_Ei8qua"); return function is_Bt1x9j(v){\n if (!Array.isArray(v)) return false;\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = is_Ei8qua.fn(v[i0]);\n if (!(res0)) return false;\n }\n return true;\n }',
		dependenciesSet: new Set(["is_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			return function is_Bt1x9j(v) {
				if (!Array.isArray(v)) return false;
				for (let i0 = 0; i0 < v.length; i0++) {
					const res0 = is_Ei8qua.fn(v[i0]);
					if (!res0) return false;
				}
				return true;
			};
		},
		fn: undefined,
	},
	is_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "is",
		jitFnHash: "is_tf5dpV",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_EmCqyw = utl.getJIT(\"is_EmCqyw\"); return function is_tf5dpV(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_EmCqyw.fn(v[p0]))) return false;} return true;})())}",
		dependenciesSet: new Set(["is_EmCqyw", "is_gCQYSg", "is_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_EmCqyw = utl.getJIT("is_EmCqyw");
			return function is_tf5dpV(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(function () {
						for (const p0 in v) {
							if (!is_EmCqyw.fn(v[p0])) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "is",
		jitFnHash: "is_EmCqyw",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_gCQYSg = utl.getJIT(\"is_gCQYSg\");\nconst is_Ei8qua = utl.getJIT(\"is_Ei8qua\"); return function is_EmCqyw(v){return (typeof v === 'object' && v !== null && typeof v.typeName === 'string' && typeof v.fnID === 'string' && typeof v.jitFnHash === 'string' && is_gCQYSg.fn(v.args) && is_gCQYSg.fn(v.defaultParamValues) && (v.isNoop === undefined || typeof v.isNoop === 'boolean') && typeof v.code === 'string' && (function(){\n if (!(v.dependenciesSet instanceof Set)) return false;\n for (const it0 of v.dependenciesSet) {if (!(typeof it0 === 'string')) return false} return true;\n })() && (function(){\n if (!(v.pureFnDependencies instanceof Set)) return false;\n for (const it1 of v.pureFnDependencies) {if (!(typeof it1 === 'string')) return false} return true;\n })() && (v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)))}",
		dependenciesSet: new Set(["is_gCQYSg", "is_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_gCQYSg = utl.getJIT("is_gCQYSg");
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			return function is_EmCqyw(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					typeof v.typeName === "string" &&
					typeof v.fnID === "string" &&
					typeof v.jitFnHash === "string" &&
					is_gCQYSg.fn(v.args) &&
					is_gCQYSg.fn(v.defaultParamValues) &&
					(v.isNoop === undefined || typeof v.isNoop === "boolean") &&
					typeof v.code === "string" &&
					(function () {
						if (!(v.dependenciesSet instanceof Set)) return false;
						for (const it0 of v.dependenciesSet) {
							if (!(typeof it0 === "string")) return false;
						}
						return true;
					})() &&
					(function () {
						if (!(v.pureFnDependencies instanceof Set)) return false;
						for (const it1 of v.pureFnDependencies) {
							if (!(typeof it1 === "string")) return false;
						}
						return true;
					})() &&
					(v.paramNames === undefined || is_Ei8qua.fn(v.paramNames))
				);
			};
		},
		fn: undefined,
	},
	is_gCQYSg: {
		isNoop: false,
		typeName: "JitFnArgs",
		fnID: "is",
		jitFnHash: "is_gCQYSg",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_gCQYSg(v){return (typeof v === 'object' && v !== null && typeof v[\"vλl\"] === 'string' && (function(){for (const p0 in v){if (!(typeof v[p0] === 'string')) return false;} return true;})())}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_gCQYSg(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					typeof v["vλl"] === "string" &&
					(function () {
						for (const p0 in v) {
							if (!(typeof v[p0] === "string")) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	hk_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "hk",
		jitFnHash: "hk_Ik8k60",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_Ik8k60 = ["purFnDeps", "methods", "deps"];\nconst hk_tP7Vvb = utl.getJIT("hk_tP7Vvb");\nconst hk_GAquSa = utl.getJIT("hk_GAquSa");\nconst hk_tf5dpV = utl.getJIT("hk_tf5dpV"); return function hk_Ik8k60(v,opts={}){return utl.hasUnknownKeysFromArray(v, k_Ik8k60) || hk_tP7Vvb.fn(v.purFnDeps,opts) || hk_GAquSa.fn(v.methods,opts) || hk_tf5dpV.fn(v.deps,opts)}',
		dependenciesSet: new Set([
			"hk_tP7Vvb",
			"hk_cE6uKo",
			"hk_Ei8qua",
			"hk_GAquSa",
			"hk_hzbJrn",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
			"hk_tf5dpV",
			"hk_EmCqyw",
			"hk_gCQYSg",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_Ik8k60 = ["purFnDeps", "methods", "deps"];
			const hk_tP7Vvb = utl.getJIT("hk_tP7Vvb");
			const hk_GAquSa = utl.getJIT("hk_GAquSa");
			const hk_tf5dpV = utl.getJIT("hk_tf5dpV");
			return function hk_Ik8k60(v, opts = {}) {
				return (
					utl.hasUnknownKeysFromArray(v, k_Ik8k60) ||
					hk_tP7Vvb.fn(v.purFnDeps, opts) ||
					hk_GAquSa.fn(v.methods, opts) ||
					hk_tf5dpV.fn(v.deps, opts)
				);
			};
		},
		fn: undefined,
	},
	hk_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "hk",
		jitFnHash: "hk_tP7Vvb",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const hk_cE6uKo = utl.getJIT("hk_cE6uKo"); return function hk_tP7Vvb(v,opts={}){return (function(){for (const p0 in v) {const res0 = hk_cE6uKo.fn(v[p0],opts);if (res0) return true;}return false;})()}',
		dependenciesSet: new Set(["hk_cE6uKo", "hk_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const hk_cE6uKo = utl.getJIT("hk_cE6uKo");
			return function hk_tP7Vvb(v, opts = {}) {
				return (function () {
					for (const p0 in v) {
						const res0 = hk_cE6uKo.fn(v[p0], opts);
						if (res0) return true;
					}
					return false;
				})();
			};
		},
		fn: undefined,
	},
	hk_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "hk",
		jitFnHash: "hk_cE6uKo",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_cE6uKo = ["paramNames", "code", "pureFnHash", "dependencies"]; return function hk_cE6uKo(v,opts={}){return (typeof v === \'object\' && v !== null && utl.hasUnknownKeysFromArray(v, k_cE6uKo)) || (function(){return false})()}',
		dependenciesSet: new Set(["hk_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_cE6uKo = ["paramNames", "code", "pureFnHash", "dependencies"];
			return function hk_cE6uKo(v, opts = {}) {
				return (
					(typeof v === "object" &&
						v !== null &&
						utl.hasUnknownKeysFromArray(v, k_cE6uKo)) ||
					(function () {
						return false;
					})()
				);
			};
		},
		fn: undefined,
	},
	hk_Ei8qua: {
		isNoop: true,
		typeName: "array",
		fnID: "hk",
		jitFnHash: "hk_Ei8qua",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: " return function hk_Ei8qua(v,opts={}){return false}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function hk_Ei8qua(v, opts = {}) {
				return false;
			};
		},
		fn: undefined,
	},
	hk_GAquSa: {
		isNoop: false,
		typeName: "SerializablePublicMethods",
		fnID: "hk",
		jitFnHash: "hk_GAquSa",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const hk_hzbJrn = utl.getJIT("hk_hzbJrn"); return function hk_GAquSa(v,opts={}){return (function(){for (const p0 in v) {const res0 = hk_hzbJrn.fn(v[p0],opts);if (res0) return true;}return false;})()}',
		dependenciesSet: new Set([
			"hk_hzbJrn",
			"hk_Ei8qua",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const hk_hzbJrn = utl.getJIT("hk_hzbJrn");
			return function hk_GAquSa(v, opts = {}) {
				return (function () {
					for (const p0 in v) {
						const res0 = hk_hzbJrn.fn(v[p0], opts);
						if (res0) return true;
					}
					return false;
				})();
			};
		},
		fn: undefined,
	},
	hk_hzbJrn: {
		isNoop: false,
		typeName: "SerializablePublicMethod",
		fnID: "hk",
		jitFnHash: "hk_hzbJrn",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_hzbJrn = ["type", "id", "paramNames", "paramsJitHashes", "returnJitHashes", "headersParam", "headersReturn", "hookIds", "pathPointers"];\nconst hk_bzlNFR = utl.getJIT("hk_bzlNFR");\nconst hk_JNJ3FN = utl.getJIT("hk_JNJ3FN"); return function hk_hzbJrn(v,opts={}){return (typeof v === \'object\' && v !== null && utl.hasUnknownKeysFromArray(v, k_hzbJrn)) || hk_bzlNFR.fn(v.paramsJitHashes,opts) || hk_bzlNFR.fn(v.returnJitHashes,opts) || (v.headersParam !== undefined && hk_JNJ3FN.fn(v.headersParam,opts)) || (v.headersReturn !== undefined && hk_JNJ3FN.fn(v.headersReturn,opts))}',
		dependenciesSet: new Set([
			"hk_Ei8qua",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_hzbJrn = [
				"type",
				"id",
				"paramNames",
				"paramsJitHashes",
				"returnJitHashes",
				"headersParam",
				"headersReturn",
				"hookIds",
				"pathPointers",
			];
			const hk_bzlNFR = utl.getJIT("hk_bzlNFR");
			const hk_JNJ3FN = utl.getJIT("hk_JNJ3FN");
			return function hk_hzbJrn(v, opts = {}) {
				return (
					(typeof v === "object" &&
						v !== null &&
						utl.hasUnknownKeysFromArray(v, k_hzbJrn)) ||
					hk_bzlNFR.fn(v.paramsJitHashes, opts) ||
					hk_bzlNFR.fn(v.returnJitHashes, opts) ||
					(v.headersParam !== undefined &&
						hk_JNJ3FN.fn(v.headersParam, opts)) ||
					(v.headersReturn !== undefined && hk_JNJ3FN.fn(v.headersReturn, opts))
				);
			};
		},
		fn: undefined,
	},
	hk_bzlNFR: {
		isNoop: false,
		typeName: "JitFunctionsHashes",
		fnID: "hk",
		jitFnHash: "hk_bzlNFR",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_bzlNFR = ["isType", "typeErrors", "prepareForJson", "restoreFromJson", "jsonStringify", "toBinary", "fromBinary"]; return function hk_bzlNFR(v,opts={}){return (typeof v === \'object\' && v !== null && utl.hasUnknownKeysFromArray(v, k_bzlNFR))}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_bzlNFR = [
				"isType",
				"typeErrors",
				"prepareForJson",
				"restoreFromJson",
				"jsonStringify",
				"toBinary",
				"fromBinary",
			];
			return function hk_bzlNFR(v, opts = {}) {
				return (
					typeof v === "object" &&
					v !== null &&
					utl.hasUnknownKeysFromArray(v, k_bzlNFR)
				);
			};
		},
		fn: undefined,
	},
	hk_JNJ3FN: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "hk",
		jitFnHash: "hk_JNJ3FN",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_JNJ3FN = ["headerNames", "jitHashes"];\nconst hk_okWaie = utl.getJIT("hk_okWaie"); return function hk_JNJ3FN(v,opts={}){return (typeof v === \'object\' && v !== null && utl.hasUnknownKeysFromArray(v, k_JNJ3FN)) || hk_okWaie.fn(v.jitHashes,opts)}',
		dependenciesSet: new Set(["hk_Ei8qua", "hk_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_JNJ3FN = ["headerNames", "jitHashes"];
			const hk_okWaie = utl.getJIT("hk_okWaie");
			return function hk_JNJ3FN(v, opts = {}) {
				return (
					(typeof v === "object" &&
						v !== null &&
						utl.hasUnknownKeysFromArray(v, k_JNJ3FN)) ||
					hk_okWaie.fn(v.jitHashes, opts)
				);
			};
		},
		fn: undefined,
	},
	hk_okWaie: {
		isNoop: false,
		typeName: "Pick",
		fnID: "hk",
		jitFnHash: "hk_okWaie",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_okWaie = ["isType", "typeErrors"]; return function hk_okWaie(v,opts={}){return (typeof v === \'object\' && v !== null && utl.hasUnknownKeysFromArray(v, k_okWaie))}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_okWaie = ["isType", "typeErrors"];
			return function hk_okWaie(v, opts = {}) {
				return (
					typeof v === "object" &&
					v !== null &&
					utl.hasUnknownKeysFromArray(v, k_okWaie)
				);
			};
		},
		fn: undefined,
	},
	hk_Bt1x9j: {
		isNoop: true,
		typeName: "array",
		fnID: "hk",
		jitFnHash: "hk_Bt1x9j",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: " return function hk_Bt1x9j(v,opts={}){return false}",
		dependenciesSet: new Set(["hk_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function hk_Bt1x9j(v, opts = {}) {
				return false;
			};
		},
		fn: undefined,
	},
	hk_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "hk",
		jitFnHash: "hk_tf5dpV",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const hk_EmCqyw = utl.getJIT("hk_EmCqyw"); return function hk_tf5dpV(v,opts={}){return (function(){for (const p0 in v) {const res0 = hk_EmCqyw.fn(v[p0],opts);if (res0) return true;}return false;})()}',
		dependenciesSet: new Set(["hk_EmCqyw", "hk_gCQYSg", "hk_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const hk_EmCqyw = utl.getJIT("hk_EmCqyw");
			return function hk_tf5dpV(v, opts = {}) {
				return (function () {
					for (const p0 in v) {
						const res0 = hk_EmCqyw.fn(v[p0], opts);
						if (res0) return true;
					}
					return false;
				})();
			};
		},
		fn: undefined,
	},
	hk_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "hk",
		jitFnHash: "hk_EmCqyw",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_EmCqyw = ["typeName", "fnID", "jitFnHash", "args", "defaultParamValues", "isNoop", "code", "dependenciesSet", "pureFnDependencies", "paramNames"]; return function hk_EmCqyw(v,opts={}){return (typeof v === \'object\' && v !== null && utl.hasUnknownKeysFromArray(v, k_EmCqyw)) || (function(){return false})() || (function(){return false})()}',
		dependenciesSet: new Set(["hk_gCQYSg", "hk_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_EmCqyw = [
				"typeName",
				"fnID",
				"jitFnHash",
				"args",
				"defaultParamValues",
				"isNoop",
				"code",
				"dependenciesSet",
				"pureFnDependencies",
				"paramNames",
			];
			return function hk_EmCqyw(v, opts = {}) {
				return (
					(typeof v === "object" &&
						v !== null &&
						utl.hasUnknownKeysFromArray(v, k_EmCqyw)) ||
					(function () {
						return false;
					})() ||
					(function () {
						return false;
					})()
				);
			};
		},
		fn: undefined,
	},
	hk_gCQYSg: {
		isNoop: true,
		typeName: "JitFnArgs",
		fnID: "hk",
		jitFnHash: "hk_gCQYSg",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: " return function hk_gCQYSg(v,opts={}){return false}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function hk_gCQYSg(v, opts = {}) {
				return false;
			};
		},
		fn: undefined,
	},
	is_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "is",
		jitFnHash: "is_R7hJ5T",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_WEWIGI = utl.getJIT(\"is_WEWIGI\"); return function is_R7hJ5T(v){return (typeof v.publicMessage === 'string' && v[\"mion:isΣrrθr\"] === true && v.type === \"rpc-metadata-not-found\" && typeof v.message === 'string' && typeof v.name === 'string' && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && Number.isFinite(v.statusCode) && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)))}",
		dependenciesSet: new Set(["is_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_WEWIGI = utl.getJIT("is_WEWIGI");
			return function is_R7hJ5T(v) {
				return (
					typeof v.publicMessage === "string" &&
					v["mion:isΣrrθr"] === true &&
					v.type === "rpc-metadata-not-found" &&
					typeof v.message === "string" &&
					typeof v.name === "string" &&
					(v.id === undefined ||
						Number.isFinite(v.id) ||
						typeof v.id === "string") &&
					Number.isFinite(v.statusCode) &&
					(v.errorData === undefined || is_WEWIGI.fn(v.errorData))
				);
			};
		},
		fn: undefined,
	},
	is_WEWIGI: {
		isNoop: false,
		typeName: "Readonly",
		fnID: "is",
		jitFnHash: "is_WEWIGI",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_WEWIGI(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'))}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_WEWIGI(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]"
				);
			};
		},
		fn: undefined,
	},
	hk_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "hk",
		jitFnHash: "hk_R7hJ5T",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: 'const k_R7hJ5T = ["publicMessage", "mion:isΣrrθr", "type", "message", "name", "id", "statusCode", "errorData"];\nconst kA_R7hJ5T = ["mion:isΣrrθr", "type", "message", "name", "id", "statusCode", "publicMessage", "errorData", "constructor", "toPublicError"]; return function hk_R7hJ5T(v,opts={}){return utl.hasUnknownKeysFromArray(v, opts.checkNonJitProps ? kA_R7hJ5T : k_R7hJ5T)}',
		dependenciesSet: new Set(["hk_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const k_R7hJ5T = [
				"publicMessage",
				"mion:isΣrrθr",
				"type",
				"message",
				"name",
				"id",
				"statusCode",
				"errorData",
			];
			const kA_R7hJ5T = [
				"mion:isΣrrθr",
				"type",
				"message",
				"name",
				"id",
				"statusCode",
				"publicMessage",
				"errorData",
				"constructor",
				"toPublicError",
			];
			return function hk_R7hJ5T(v, opts = {}) {
				return utl.hasUnknownKeysFromArray(
					v,
					opts.checkNonJitProps ? kA_R7hJ5T : k_R7hJ5T,
				);
			};
		},
		fn: undefined,
	},
	hk_WEWIGI: {
		isNoop: true,
		typeName: "Readonly",
		fnID: "hk",
		jitFnHash: "hk_WEWIGI",
		args: { θpts: "opts", vλl: "v" },
		defaultParamValues: { θpts: "{}", vλl: "" },
		code: " return function hk_WEWIGI(v,opts={}){return false}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function hk_WEWIGI(v, opts = {}) {
				return false;
			};
		},
		fn: undefined,
	},
	te_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "te",
		jitFnHash: "te_EUIgsu",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const is_Ik8k60 = utl.getJIT("is_Ik8k60");\nconst uKOpts0 = {checkNonJitProps: true};\nconst hk_Ik8k60 = utl.getJIT("hk_Ik8k60");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T");\nconst hk_R7hJ5T = utl.getJIT("hk_R7hJ5T"); return function te_EUIgsu(v,pth=[],er=[]){if (!((typeof v === \'object\' && v !== null && ((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v,uKOpts0)) || (is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v,uKOpts0)))))) utl.err(pth,er,"union"); return er}',
		dependenciesSet: new Set([
			"is_Ik8k60",
			"is_tP7Vvb",
			"is_cE6uKo",
			"is_Ei8qua",
			"is_GAquSa",
			"is_hzbJrn",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
			"is_tf5dpV",
			"is_EmCqyw",
			"is_gCQYSg",
			"hk_Ik8k60",
			"hk_tP7Vvb",
			"hk_cE6uKo",
			"hk_Ei8qua",
			"hk_GAquSa",
			"hk_hzbJrn",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
			"hk_tf5dpV",
			"hk_EmCqyw",
			"hk_gCQYSg",
			"is_R7hJ5T",
			"is_WEWIGI",
			"hk_R7hJ5T",
			"hk_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_Ik8k60 = utl.getJIT("is_Ik8k60");
			const uKOpts0 = { checkNonJitProps: true };
			const hk_Ik8k60 = utl.getJIT("hk_Ik8k60");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			const hk_R7hJ5T = utl.getJIT("hk_R7hJ5T");
			return function te_EUIgsu(v, pth = [], er = []) {
				if (
					!(
						typeof v === "object" &&
						v !== null &&
						((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v, uKOpts0)) ||
							(is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v, uKOpts0)))
					)
				)
					utl.err(pth, er, "union");
				return er;
			};
		},
		fn: undefined,
	},
	tj_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "tj",
		jitFnHash: "tj_EUIgsu",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json encode union: item does not belong to the union";\nconst tj_Ik8k60 = utl.getJIT("tj_Ik8k60");\nconst fj_Ik8k60 = utl.getJIT("fj_Ik8k60");\nconst is_Ik8k60 = utl.getJIT("is_Ik8k60");\nconst uKOpts0 = {checkNonJitProps: true};\nconst hk_Ik8k60 = utl.getJIT("hk_Ik8k60");\nconst tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");\nconst fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T");\nconst hk_R7hJ5T = utl.getJIT("hk_R7hJ5T"); return function tj_EUIgsu(v){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if ((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v,uKOpts0))) {v = tj_Ik8k60.fn(v); v = [0, v]}else if ((is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v,uKOpts0))) {v = tj_R7hJ5T.fn(v); v = [1, v]}else {throw new Error(uErr0);} return v}',
		dependenciesSet: new Set([
			"tj_Ik8k60",
			"tj_tP7Vvb",
			"tj_cE6uKo",
			"tj_Ei8qua",
			"tj_GAquSa",
			"tj_hzbJrn",
			"tj_bzlNFR",
			"tj_JNJ3FN",
			"tj_okWaie",
			"tj_Bt1x9j",
			"tj_tf5dpV",
			"tj_EmCqyw",
			"tj_gCQYSg",
			"fj_Ik8k60",
			"fj_tP7Vvb",
			"fj_cE6uKo",
			"fj_Ei8qua",
			"fj_GAquSa",
			"fj_hzbJrn",
			"fj_bzlNFR",
			"fj_JNJ3FN",
			"fj_okWaie",
			"fj_Bt1x9j",
			"fj_tf5dpV",
			"fj_EmCqyw",
			"fj_gCQYSg",
			"is_Ik8k60",
			"is_tP7Vvb",
			"is_cE6uKo",
			"is_Ei8qua",
			"is_GAquSa",
			"is_hzbJrn",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
			"is_tf5dpV",
			"is_EmCqyw",
			"is_gCQYSg",
			"hk_Ik8k60",
			"hk_tP7Vvb",
			"hk_cE6uKo",
			"hk_Ei8qua",
			"hk_GAquSa",
			"hk_hzbJrn",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
			"hk_tf5dpV",
			"hk_EmCqyw",
			"hk_gCQYSg",
			"tj_R7hJ5T",
			"tj_WEWIGI",
			"fj_R7hJ5T",
			"fj_WEWIGI",
			"is_R7hJ5T",
			"is_WEWIGI",
			"hk_R7hJ5T",
			"hk_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			const tj_Ik8k60 = utl.getJIT("tj_Ik8k60");
			const fj_Ik8k60 = utl.getJIT("fj_Ik8k60");
			const is_Ik8k60 = utl.getJIT("is_Ik8k60");
			const uKOpts0 = { checkNonJitProps: true };
			const hk_Ik8k60 = utl.getJIT("hk_Ik8k60");
			const tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");
			const fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			const hk_R7hJ5T = utl.getJIT("hk_R7hJ5T");
			return function tj_EUIgsu(v) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v, uKOpts0)) {
					v = tj_Ik8k60.fn(v);
					v = [0, v];
				} else if (is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v, uKOpts0)) {
					v = tj_R7hJ5T.fn(v);
					v = [1, v];
				} else {
					throw new Error(uErr0);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "tj",
		jitFnHash: "tj_Ik8k60",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_tP7Vvb = utl.getJIT("tj_tP7Vvb");\nconst tj_tf5dpV = utl.getJIT("tj_tf5dpV"); return function tj_Ik8k60(v){v.purFnDeps = tj_tP7Vvb.fn(v.purFnDeps);v.deps = tj_tf5dpV.fn(v.deps); return v}',
		dependenciesSet: new Set([
			"tj_tP7Vvb",
			"tj_cE6uKo",
			"tj_Ei8qua",
			"tj_GAquSa",
			"tj_hzbJrn",
			"tj_bzlNFR",
			"tj_JNJ3FN",
			"tj_okWaie",
			"tj_Bt1x9j",
			"tj_tf5dpV",
			"tj_EmCqyw",
			"tj_gCQYSg",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tj_tP7Vvb = utl.getJIT("tj_tP7Vvb");
			const tj_tf5dpV = utl.getJIT("tj_tf5dpV");
			return function tj_Ik8k60(v) {
				v.purFnDeps = tj_tP7Vvb.fn(v.purFnDeps);
				v.deps = tj_tf5dpV.fn(v.deps);
				return v;
			};
		},
		fn: undefined,
	},
	tj_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "tj",
		jitFnHash: "tj_tP7Vvb",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_cE6uKo = utl.getJIT("tj_cE6uKo"); return function tj_tP7Vvb(v){for (const p0 in v){ v[p0] = tj_cE6uKo.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["tj_cE6uKo", "tj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tj_cE6uKo = utl.getJIT("tj_cE6uKo");
			return function tj_tP7Vvb(v) {
				for (const p0 in v) {
					v[p0] = tj_cE6uKo.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "tj",
		jitFnHash: "tj_cE6uKo",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_cE6uKo(v){v.dependencies = Array.from(v.dependencies); return v}",
		dependenciesSet: new Set(["tj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_cE6uKo(v) {
				v.dependencies = Array.from(v.dependencies);
				return v;
			};
		},
		fn: undefined,
	},
	tj_Ei8qua: {
		isNoop: true,
		typeName: "array",
		fnID: "tj",
		jitFnHash: "tj_Ei8qua",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_Ei8qua(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_Ei8qua(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_GAquSa: {
		isNoop: true,
		typeName: "SerializablePublicMethods",
		fnID: "tj",
		jitFnHash: "tj_GAquSa",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_GAquSa(v){return v}",
		dependenciesSet: new Set([
			"tj_hzbJrn",
			"tj_Ei8qua",
			"tj_bzlNFR",
			"tj_JNJ3FN",
			"tj_okWaie",
			"tj_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_GAquSa(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_hzbJrn: {
		isNoop: true,
		typeName: "SerializablePublicMethod",
		fnID: "tj",
		jitFnHash: "tj_hzbJrn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_hzbJrn(v){return v}",
		dependenciesSet: new Set([
			"tj_Ei8qua",
			"tj_bzlNFR",
			"tj_JNJ3FN",
			"tj_okWaie",
			"tj_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_hzbJrn(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_bzlNFR: {
		isNoop: true,
		typeName: "JitFunctionsHashes",
		fnID: "tj",
		jitFnHash: "tj_bzlNFR",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_bzlNFR(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_bzlNFR(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_JNJ3FN: {
		isNoop: true,
		typeName: "HeadersMetaData",
		fnID: "tj",
		jitFnHash: "tj_JNJ3FN",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_JNJ3FN(v){return v}",
		dependenciesSet: new Set(["tj_Ei8qua", "tj_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_JNJ3FN(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_okWaie: {
		isNoop: true,
		typeName: "Pick",
		fnID: "tj",
		jitFnHash: "tj_okWaie",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_okWaie(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_okWaie(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_Bt1x9j: {
		isNoop: true,
		typeName: "array",
		fnID: "tj",
		jitFnHash: "tj_Bt1x9j",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_Bt1x9j(v){return v}",
		dependenciesSet: new Set(["tj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_Bt1x9j(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "tj",
		jitFnHash: "tj_tf5dpV",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_EmCqyw = utl.getJIT("tj_EmCqyw"); return function tj_tf5dpV(v){for (const p0 in v){ v[p0] = tj_EmCqyw.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["tj_EmCqyw", "tj_gCQYSg", "tj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tj_EmCqyw = utl.getJIT("tj_EmCqyw");
			return function tj_tf5dpV(v) {
				for (const p0 in v) {
					v[p0] = tj_EmCqyw.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "tj",
		jitFnHash: "tj_EmCqyw",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_EmCqyw(v){v.dependenciesSet = Array.from(v.dependenciesSet);v.pureFnDependencies = Array.from(v.pureFnDependencies); return v}",
		dependenciesSet: new Set(["tj_gCQYSg", "tj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_EmCqyw(v) {
				v.dependenciesSet = Array.from(v.dependenciesSet);
				v.pureFnDependencies = Array.from(v.pureFnDependencies);
				return v;
			};
		},
		fn: undefined,
	},
	tj_gCQYSg: {
		isNoop: true,
		typeName: "JitFnArgs",
		fnID: "tj",
		jitFnHash: "tj_gCQYSg",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_gCQYSg(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_gCQYSg(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "fj",
		jitFnHash: "fj_Ik8k60",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_tP7Vvb = utl.getJIT("fj_tP7Vvb");\nconst fj_tf5dpV = utl.getJIT("fj_tf5dpV"); return function fj_Ik8k60(v){v.purFnDeps = fj_tP7Vvb.fn(v.purFnDeps);v.deps = fj_tf5dpV.fn(v.deps); return v}',
		dependenciesSet: new Set([
			"fj_tP7Vvb",
			"fj_cE6uKo",
			"fj_Ei8qua",
			"fj_GAquSa",
			"fj_hzbJrn",
			"fj_bzlNFR",
			"fj_JNJ3FN",
			"fj_okWaie",
			"fj_Bt1x9j",
			"fj_tf5dpV",
			"fj_EmCqyw",
			"fj_gCQYSg",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fj_tP7Vvb = utl.getJIT("fj_tP7Vvb");
			const fj_tf5dpV = utl.getJIT("fj_tf5dpV");
			return function fj_Ik8k60(v) {
				v.purFnDeps = fj_tP7Vvb.fn(v.purFnDeps);
				v.deps = fj_tf5dpV.fn(v.deps);
				return v;
			};
		},
		fn: undefined,
	},
	fj_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "fj",
		jitFnHash: "fj_tP7Vvb",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_cE6uKo = utl.getJIT("fj_cE6uKo"); return function fj_tP7Vvb(v){for (const p0 in v){ v[p0] = fj_cE6uKo.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["fj_cE6uKo", "fj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fj_cE6uKo = utl.getJIT("fj_cE6uKo");
			return function fj_tP7Vvb(v) {
				for (const p0 in v) {
					v[p0] = fj_cE6uKo.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "fj",
		jitFnHash: "fj_cE6uKo",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_cE6uKo(v){v.dependencies = new Set(v.dependencies); return v}",
		dependenciesSet: new Set(["fj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_cE6uKo(v) {
				v.dependencies = new Set(v.dependencies);
				return v;
			};
		},
		fn: undefined,
	},
	fj_Ei8qua: {
		isNoop: true,
		typeName: "array",
		fnID: "fj",
		jitFnHash: "fj_Ei8qua",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_Ei8qua(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_Ei8qua(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_GAquSa: {
		isNoop: true,
		typeName: "SerializablePublicMethods",
		fnID: "fj",
		jitFnHash: "fj_GAquSa",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_GAquSa(v){return v}",
		dependenciesSet: new Set([
			"fj_hzbJrn",
			"fj_Ei8qua",
			"fj_bzlNFR",
			"fj_JNJ3FN",
			"fj_okWaie",
			"fj_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_GAquSa(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_hzbJrn: {
		isNoop: true,
		typeName: "SerializablePublicMethod",
		fnID: "fj",
		jitFnHash: "fj_hzbJrn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_hzbJrn(v){return v}",
		dependenciesSet: new Set([
			"fj_Ei8qua",
			"fj_bzlNFR",
			"fj_JNJ3FN",
			"fj_okWaie",
			"fj_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_hzbJrn(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_bzlNFR: {
		isNoop: true,
		typeName: "JitFunctionsHashes",
		fnID: "fj",
		jitFnHash: "fj_bzlNFR",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_bzlNFR(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_bzlNFR(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_JNJ3FN: {
		isNoop: true,
		typeName: "HeadersMetaData",
		fnID: "fj",
		jitFnHash: "fj_JNJ3FN",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_JNJ3FN(v){return v}",
		dependenciesSet: new Set(["fj_Ei8qua", "fj_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_JNJ3FN(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_okWaie: {
		isNoop: true,
		typeName: "Pick",
		fnID: "fj",
		jitFnHash: "fj_okWaie",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_okWaie(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_okWaie(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_Bt1x9j: {
		isNoop: true,
		typeName: "array",
		fnID: "fj",
		jitFnHash: "fj_Bt1x9j",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_Bt1x9j(v){return v}",
		dependenciesSet: new Set(["fj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_Bt1x9j(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "fj",
		jitFnHash: "fj_tf5dpV",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_EmCqyw = utl.getJIT("fj_EmCqyw"); return function fj_tf5dpV(v){for (const p0 in v){ v[p0] = fj_EmCqyw.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["fj_EmCqyw", "fj_gCQYSg", "fj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fj_EmCqyw = utl.getJIT("fj_EmCqyw");
			return function fj_tf5dpV(v) {
				for (const p0 in v) {
					v[p0] = fj_EmCqyw.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "fj",
		jitFnHash: "fj_EmCqyw",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_EmCqyw(v){v.dependenciesSet = new Set(v.dependenciesSet);v.pureFnDependencies = new Set(v.pureFnDependencies); return v}",
		dependenciesSet: new Set(["fj_gCQYSg", "fj_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_EmCqyw(v) {
				v.dependenciesSet = new Set(v.dependenciesSet);
				v.pureFnDependencies = new Set(v.pureFnDependencies);
				return v;
			};
		},
		fn: undefined,
	},
	fj_gCQYSg: {
		isNoop: true,
		typeName: "JitFnArgs",
		fnID: "fj",
		jitFnHash: "fj_gCQYSg",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_gCQYSg(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_gCQYSg(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tj",
		jitFnHash: "tj_R7hJ5T",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const uErr0 = \"Can not json encode union: item does not belong to the union\"; return function tj_R7hJ5T(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/} else {throw new Error(uErr0);}} return v}",
		dependenciesSet: new Set(["tj_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			return function tj_R7hJ5T(v) {
				if (v.id !== undefined) {
					if (Number.isFinite(v.id)) {
						/*noop*/
					} else if (typeof v.id === "string") {
						/*noop*/
					} else {
						throw new Error(uErr0);
					}
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_WEWIGI: {
		isNoop: true,
		typeName: "Readonly",
		fnID: "tj",
		jitFnHash: "tj_WEWIGI",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_WEWIGI(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_WEWIGI(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fj",
		jitFnHash: "fj_R7hJ5T",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index"; return function fj_R7hJ5T(v){\n if (v.id !== undefined) {\n if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === \'number\') {\n const dec0 = v.id[0]; v.id = v.id[1];\n if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}\n else {throw new Error(uErr0)}\n }\n ;};\n let desFn1 = utl.getDeserializeFn("RpcError");\n if (desFn1) {v = desFn1(v)}\n else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}\n ; return v}',
		dependenciesSet: new Set(["fj_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			return function fj_R7hJ5T(v) {
				if (v.id !== undefined) {
					if (
						v.id?.length === 2 &&
						Array.isArray(v.id) &&
						typeof v.id[0] === "number"
					) {
						const dec0 = v.id[0];
						v.id = v.id[1];
						if (dec0 === 0) {
							/*noop*/
						} else if (dec0 === 1) {
							/*noop*/
						} else {
							throw new Error(uErr0);
						}
					}
				}
				let desFn1 = utl.getDeserializeFn("RpcError");
				if (desFn1) {
					v = desFn1(v);
				} else if ((desFn1 = utl.getSerializeClass("RpcError"))) {
					v = new desFn1(v);
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_WEWIGI: {
		isNoop: true,
		typeName: "Readonly",
		fnID: "fj",
		jitFnHash: "fj_WEWIGI",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_WEWIGI(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_WEWIGI(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "fj",
		jitFnHash: "fj_EUIgsu",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index";\nconst fj_Ik8k60 = utl.getJIT("fj_Ik8k60");\nconst fj_R7hJ5T = utl.getJIT("fj_R7hJ5T"); return function fj_EUIgsu(v){\n if (v?.length === 2 && Array.isArray(v) && typeof v[0] === \'number\') {\n const dec0 = v[0]; v = v[1];\n if (dec0 === 0) {v = fj_Ik8k60.fn(v)}else if (dec0 === 1) {v = fj_R7hJ5T.fn(v)}\n else {throw new Error(uErr0)}\n }\n ; return v}',
		dependenciesSet: new Set([
			"fj_Ik8k60",
			"fj_tP7Vvb",
			"fj_cE6uKo",
			"fj_Ei8qua",
			"fj_GAquSa",
			"fj_hzbJrn",
			"fj_bzlNFR",
			"fj_JNJ3FN",
			"fj_okWaie",
			"fj_Bt1x9j",
			"fj_tf5dpV",
			"fj_EmCqyw",
			"fj_gCQYSg",
			"fj_R7hJ5T",
			"fj_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			const fj_Ik8k60 = utl.getJIT("fj_Ik8k60");
			const fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");
			return function fj_EUIgsu(v) {
				if (v?.length === 2 && Array.isArray(v) && typeof v[0] === "number") {
					const dec0 = v[0];
					v = v[1];
					if (dec0 === 0) {
						v = fj_Ik8k60.fn(v);
					} else if (dec0 === 1) {
						v = fj_R7hJ5T.fn(v);
					} else {
						throw new Error(uErr0);
					}
				}
				return v;
			};
		},
		fn: undefined,
	},
	js_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "js",
		jitFnHash: "js_EUIgsu",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not JsonStringify union: item does not belong to the union";\nconst js_Ik8k60 = utl.getJIT("js_Ik8k60");\nconst tj_Ik8k60 = utl.getJIT("tj_Ik8k60");\nconst fj_Ik8k60 = utl.getJIT("fj_Ik8k60");\nconst is_Ik8k60 = utl.getJIT("is_Ik8k60");\nconst uKOpts0 = {checkNonJitProps: true};\nconst hk_Ik8k60 = utl.getJIT("hk_Ik8k60");\nconst js_R7hJ5T = utl.getJIT("js_R7hJ5T");\nconst tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");\nconst fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T");\nconst hk_R7hJ5T = utl.getJIT("hk_R7hJ5T"); return function js_EUIgsu(v){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if ((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v,uKOpts0))) {return \'[0,\' + js_Ik8k60.fn(v) + \']\'}else if ((is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v,uKOpts0))) {return \'[1,\' + js_R7hJ5T.fn(v) + \']\'}else {throw new Error(uErr0);}}',
		dependenciesSet: new Set([
			"js_Ik8k60",
			"js_tP7Vvb",
			"js_cE6uKo",
			"js_Ei8qua",
			"js_GAquSa",
			"js_hzbJrn",
			"js_JNJ3FN",
			"js_okWaie",
			"js_Bt1x9j",
			"js_bzlNFR",
			"js_tf5dpV",
			"js_EmCqyw",
			"js_gCQYSg",
			"tj_Ik8k60",
			"tj_tP7Vvb",
			"tj_cE6uKo",
			"tj_Ei8qua",
			"tj_GAquSa",
			"tj_hzbJrn",
			"tj_bzlNFR",
			"tj_JNJ3FN",
			"tj_okWaie",
			"tj_Bt1x9j",
			"tj_tf5dpV",
			"tj_EmCqyw",
			"tj_gCQYSg",
			"fj_Ik8k60",
			"fj_tP7Vvb",
			"fj_cE6uKo",
			"fj_Ei8qua",
			"fj_GAquSa",
			"fj_hzbJrn",
			"fj_bzlNFR",
			"fj_JNJ3FN",
			"fj_okWaie",
			"fj_Bt1x9j",
			"fj_tf5dpV",
			"fj_EmCqyw",
			"fj_gCQYSg",
			"is_Ik8k60",
			"is_tP7Vvb",
			"is_cE6uKo",
			"is_Ei8qua",
			"is_GAquSa",
			"is_hzbJrn",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
			"is_tf5dpV",
			"is_EmCqyw",
			"is_gCQYSg",
			"hk_Ik8k60",
			"hk_tP7Vvb",
			"hk_cE6uKo",
			"hk_Ei8qua",
			"hk_GAquSa",
			"hk_hzbJrn",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
			"hk_tf5dpV",
			"hk_EmCqyw",
			"hk_gCQYSg",
			"js_R7hJ5T",
			"js_WEWIGI",
			"tj_R7hJ5T",
			"tj_WEWIGI",
			"fj_R7hJ5T",
			"fj_WEWIGI",
			"is_R7hJ5T",
			"is_WEWIGI",
			"hk_R7hJ5T",
			"hk_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not JsonStringify union: item does not belong to the union";
			const js_Ik8k60 = utl.getJIT("js_Ik8k60");
			const tj_Ik8k60 = utl.getJIT("tj_Ik8k60");
			const fj_Ik8k60 = utl.getJIT("fj_Ik8k60");
			const is_Ik8k60 = utl.getJIT("is_Ik8k60");
			const uKOpts0 = { checkNonJitProps: true };
			const hk_Ik8k60 = utl.getJIT("hk_Ik8k60");
			const js_R7hJ5T = utl.getJIT("js_R7hJ5T");
			const tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");
			const fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			const hk_R7hJ5T = utl.getJIT("hk_R7hJ5T");
			return function js_EUIgsu(v) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v, uKOpts0)) {
					return "[0," + js_Ik8k60.fn(v) + "]";
				} else if (is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v, uKOpts0)) {
					return "[1," + js_R7hJ5T.fn(v) + "]";
				} else {
					throw new Error(uErr0);
				}
			};
		},
		fn: undefined,
	},
	js_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "js",
		jitFnHash: "js_Ik8k60",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const js_tP7Vvb = utl.getJIT("js_tP7Vvb");\nconst js_GAquSa = utl.getJIT("js_GAquSa");\nconst js_tf5dpV = utl.getJIT("js_tf5dpV"); return function js_Ik8k60(v){return \'{\'+\'"purFnDeps":\'+js_tP7Vvb.fn(v.purFnDeps)+","+\'"methods":\'+js_GAquSa.fn(v.methods)+","+\'"deps":\'+js_tf5dpV.fn(v.deps)+\'}\'}',
		dependenciesSet: new Set([
			"js_tP7Vvb",
			"js_cE6uKo",
			"js_Ei8qua",
			"js_GAquSa",
			"js_hzbJrn",
			"js_JNJ3FN",
			"js_okWaie",
			"js_Bt1x9j",
			"js_bzlNFR",
			"js_tf5dpV",
			"js_EmCqyw",
			"js_gCQYSg",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_tP7Vvb = utl.getJIT("js_tP7Vvb");
			const js_GAquSa = utl.getJIT("js_GAquSa");
			const js_tf5dpV = utl.getJIT("js_tf5dpV");
			return function js_Ik8k60(v) {
				return (
					"{" +
					'"purFnDeps":' +
					js_tP7Vvb.fn(v.purFnDeps) +
					"," +
					'"methods":' +
					js_GAquSa.fn(v.methods) +
					"," +
					'"deps":' +
					js_tf5dpV.fn(v.deps) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "js",
		jitFnHash: "js_tP7Vvb",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_cE6uKo = utl.getJIT(\"js_cE6uKo\"); return function js_tP7Vvb(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + js_cE6uKo.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["js_cE6uKo", "js_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_cE6uKo = utl.getJIT("js_cE6uKo");
			return function js_tP7Vvb(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + js_cE6uKo.fn(v[p1]));
							}
							if (!ls1.length) return "";
							return ls1.join(",");
						})(),
					);
					return "{" + ns0.join(",") + "}";
				})();
			};
		},
		fn: undefined,
	},
	js_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "js",
		jitFnHash: "js_cE6uKo",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_Ei8qua = utl.getJIT(\"js_Ei8qua\"); return function js_cE6uKo(v){return '{'+'\"paramNames\":'+js_Ei8qua.fn(v.paramNames)+\",\"+'\"code\":'+utl.asJSONString(v.code)+\",\"+'\"pureFnHash\":'+utl.asJSONString(v.pureFnHash)+\",\"+'\"dependencies\":'+(function(){\n const ls0 = [];\n for (const it0 of v.dependencies) {\n const res0 = utl.asJSONString(it0);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']'\n })()+'}'}",
		dependenciesSet: new Set(["js_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			return function js_cE6uKo(v) {
				return (
					"{" +
					'"paramNames":' +
					js_Ei8qua.fn(v.paramNames) +
					"," +
					'"code":' +
					utl.asJSONString(v.code) +
					"," +
					'"pureFnHash":' +
					utl.asJSONString(v.pureFnHash) +
					"," +
					'"dependencies":' +
					(function () {
						const ls0 = [];
						for (const it0 of v.dependencies) {
							const res0 = utl.asJSONString(it0);
							ls0.push(res0);
						}
						return "[" + ls0.join(",") + "]";
					})() +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_Ei8qua: {
		isNoop: false,
		typeName: "array",
		fnID: "js",
		jitFnHash: "js_Ei8qua",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_Ei8qua(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = utl.asJSONString(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_Ei8qua(v) {
				const ls0 = [];
				for (let i0 = 0; i0 < v.length; i0++) {
					const res0 = utl.asJSONString(v[i0]);
					ls0.push(res0);
				}
				return "[" + ls0.join(",") + "]";
			};
		},
		fn: undefined,
	},
	js_GAquSa: {
		isNoop: false,
		typeName: "SerializablePublicMethods",
		fnID: "js",
		jitFnHash: "js_GAquSa",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_hzbJrn = utl.getJIT(\"js_hzbJrn\"); return function js_GAquSa(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + js_hzbJrn.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set([
			"js_hzbJrn",
			"js_Ei8qua",
			"js_JNJ3FN",
			"js_okWaie",
			"js_Bt1x9j",
			"js_bzlNFR",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_hzbJrn = utl.getJIT("js_hzbJrn");
			return function js_GAquSa(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + js_hzbJrn.fn(v[p1]));
							}
							if (!ls1.length) return "";
							return ls1.join(",");
						})(),
					);
					return "{" + ns0.join(",") + "}";
				})();
			};
		},
		fn: undefined,
	},
	js_hzbJrn: {
		isNoop: false,
		typeName: "SerializablePublicMethod",
		fnID: "js",
		jitFnHash: "js_hzbJrn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const js_Ei8qua = utl.getJIT("js_Ei8qua");\nconst js_JNJ3FN = utl.getJIT("js_JNJ3FN");\nconst js_Bt1x9j = utl.getJIT("js_Bt1x9j");\nconst js_bzlNFR = utl.getJIT("js_bzlNFR"); return function js_hzbJrn(v){return \'{\'+(v.paramNames === undefined ? \'\' : \'"paramNames":\'+js_Ei8qua.fn(v.paramNames)+",")+(v.headersParam === undefined ? \'\' : \'"headersParam":\'+js_JNJ3FN.fn(v.headersParam)+",")+(v.headersReturn === undefined ? \'\' : \'"headersReturn":\'+js_JNJ3FN.fn(v.headersReturn)+",")+(v.hookIds === undefined ? \'\' : \'"hookIds":\'+js_Ei8qua.fn(v.hookIds)+",")+(v.pathPointers === undefined ? \'\' : \'"pathPointers":\'+js_Bt1x9j.fn(v.pathPointers)+",")+\'"type":\'+v.type+","+\'"id":\'+utl.asJSONString(v.id)+","+\'"paramsJitHashes":\'+js_bzlNFR.fn(v.paramsJitHashes)+","+\'"returnJitHashes":\'+js_bzlNFR.fn(v.returnJitHashes)+\'}\'}',
		dependenciesSet: new Set([
			"js_Ei8qua",
			"js_JNJ3FN",
			"js_okWaie",
			"js_Bt1x9j",
			"js_bzlNFR",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			const js_JNJ3FN = utl.getJIT("js_JNJ3FN");
			const js_Bt1x9j = utl.getJIT("js_Bt1x9j");
			const js_bzlNFR = utl.getJIT("js_bzlNFR");
			return function js_hzbJrn(v) {
				return (
					"{" +
					(v.paramNames === undefined
						? ""
						: '"paramNames":' + js_Ei8qua.fn(v.paramNames) + ",") +
					(v.headersParam === undefined
						? ""
						: '"headersParam":' + js_JNJ3FN.fn(v.headersParam) + ",") +
					(v.headersReturn === undefined
						? ""
						: '"headersReturn":' + js_JNJ3FN.fn(v.headersReturn) + ",") +
					(v.hookIds === undefined
						? ""
						: '"hookIds":' + js_Ei8qua.fn(v.hookIds) + ",") +
					(v.pathPointers === undefined
						? ""
						: '"pathPointers":' + js_Bt1x9j.fn(v.pathPointers) + ",") +
					'"type":' +
					v.type +
					"," +
					'"id":' +
					utl.asJSONString(v.id) +
					"," +
					'"paramsJitHashes":' +
					js_bzlNFR.fn(v.paramsJitHashes) +
					"," +
					'"returnJitHashes":' +
					js_bzlNFR.fn(v.returnJitHashes) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_JNJ3FN: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "js",
		jitFnHash: "js_JNJ3FN",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const js_Ei8qua = utl.getJIT("js_Ei8qua");\nconst js_okWaie = utl.getJIT("js_okWaie"); return function js_JNJ3FN(v){return \'{\'+\'"headerNames":\'+js_Ei8qua.fn(v.headerNames)+","+\'"jitHashes":\'+js_okWaie.fn(v.jitHashes)+\'}\'}',
		dependenciesSet: new Set(["js_Ei8qua", "js_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			const js_okWaie = utl.getJIT("js_okWaie");
			return function js_JNJ3FN(v) {
				return (
					"{" +
					'"headerNames":' +
					js_Ei8qua.fn(v.headerNames) +
					"," +
					'"jitHashes":' +
					js_okWaie.fn(v.jitHashes) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_okWaie: {
		isNoop: false,
		typeName: "Pick",
		fnID: "js",
		jitFnHash: "js_okWaie",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_okWaie(v){return '{'+'\"isType\":'+utl.asJSONString(v.isType)+\",\"+'\"typeErrors\":'+utl.asJSONString(v.typeErrors)+'}'}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_okWaie(v) {
				return (
					"{" +
					'"isType":' +
					utl.asJSONString(v.isType) +
					"," +
					'"typeErrors":' +
					utl.asJSONString(v.typeErrors) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_Bt1x9j: {
		isNoop: false,
		typeName: "array",
		fnID: "js",
		jitFnHash: "js_Bt1x9j",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_Ei8qua = utl.getJIT(\"js_Ei8qua\"); return function js_Bt1x9j(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = js_Ei8qua.fn(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }",
		dependenciesSet: new Set(["js_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			return function js_Bt1x9j(v) {
				const ls0 = [];
				for (let i0 = 0; i0 < v.length; i0++) {
					const res0 = js_Ei8qua.fn(v[i0]);
					ls0.push(res0);
				}
				return "[" + ls0.join(",") + "]";
			};
		},
		fn: undefined,
	},
	js_bzlNFR: {
		isNoop: false,
		typeName: "JitFunctionsHashes",
		fnID: "js",
		jitFnHash: "js_bzlNFR",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: ' return function js_bzlNFR(v){return \'{\'+\'"isType":\'+utl.asJSONString(v.isType)+","+\'"typeErrors":\'+utl.asJSONString(v.typeErrors)+","+\'"prepareForJson":\'+utl.asJSONString(v.prepareForJson)+","+\'"restoreFromJson":\'+utl.asJSONString(v.restoreFromJson)+","+\'"jsonStringify":\'+utl.asJSONString(v.jsonStringify)+","+\'"toBinary":\'+utl.asJSONString(v.toBinary)+","+\'"fromBinary":\'+utl.asJSONString(v.fromBinary)+\'}\'}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_bzlNFR(v) {
				return (
					"{" +
					'"isType":' +
					utl.asJSONString(v.isType) +
					"," +
					'"typeErrors":' +
					utl.asJSONString(v.typeErrors) +
					"," +
					'"prepareForJson":' +
					utl.asJSONString(v.prepareForJson) +
					"," +
					'"restoreFromJson":' +
					utl.asJSONString(v.restoreFromJson) +
					"," +
					'"jsonStringify":' +
					utl.asJSONString(v.jsonStringify) +
					"," +
					'"toBinary":' +
					utl.asJSONString(v.toBinary) +
					"," +
					'"fromBinary":' +
					utl.asJSONString(v.fromBinary) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "js",
		jitFnHash: "js_tf5dpV",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_EmCqyw = utl.getJIT(\"js_EmCqyw\"); return function js_tf5dpV(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + js_EmCqyw.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["js_EmCqyw", "js_Ei8qua", "js_gCQYSg"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_EmCqyw = utl.getJIT("js_EmCqyw");
			return function js_tf5dpV(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + js_EmCqyw.fn(v[p1]));
							}
							if (!ls1.length) return "";
							return ls1.join(",");
						})(),
					);
					return "{" + ns0.join(",") + "}";
				})();
			};
		},
		fn: undefined,
	},
	js_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "js",
		jitFnHash: "js_EmCqyw",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_Ei8qua = utl.getJIT(\"js_Ei8qua\");\nconst js_gCQYSg = utl.getJIT(\"js_gCQYSg\"); return function js_EmCqyw(v){return '{'+(v.isNoop === undefined ? '' : '\"isNoop\":'+(v.isNoop ? 'true' : 'false')+\",\")+(v.paramNames === undefined ? '' : '\"paramNames\":'+js_Ei8qua.fn(v.paramNames)+\",\")+'\"typeName\":'+utl.asJSONString(v.typeName)+\",\"+'\"fnID\":'+utl.asJSONString(v.fnID)+\",\"+'\"jitFnHash\":'+utl.asJSONString(v.jitFnHash)+\",\"+'\"args\":'+js_gCQYSg.fn(v.args)+\",\"+'\"defaultParamValues\":'+js_gCQYSg.fn(v.defaultParamValues)+\",\"+'\"code\":'+utl.asJSONString(v.code)+\",\"+'\"dependenciesSet\":'+(function(){\n const ls0 = [];\n for (const it0 of v.dependenciesSet) {\n const res0 = utl.asJSONString(it0);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']'\n })()+\",\"+'\"pureFnDependencies\":'+(function(){\n const ls1 = [];\n for (const it1 of v.pureFnDependencies) {\n const res1 = utl.asJSONString(it1);\n ls1.push(res1);\n }\n return '[' + ls1.join(',') + ']'\n })()+'}'}",
		dependenciesSet: new Set(["js_Ei8qua", "js_gCQYSg"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			const js_gCQYSg = utl.getJIT("js_gCQYSg");
			return function js_EmCqyw(v) {
				return (
					"{" +
					(v.isNoop === undefined
						? ""
						: '"isNoop":' + (v.isNoop ? "true" : "false") + ",") +
					(v.paramNames === undefined
						? ""
						: '"paramNames":' + js_Ei8qua.fn(v.paramNames) + ",") +
					'"typeName":' +
					utl.asJSONString(v.typeName) +
					"," +
					'"fnID":' +
					utl.asJSONString(v.fnID) +
					"," +
					'"jitFnHash":' +
					utl.asJSONString(v.jitFnHash) +
					"," +
					'"args":' +
					js_gCQYSg.fn(v.args) +
					"," +
					'"defaultParamValues":' +
					js_gCQYSg.fn(v.defaultParamValues) +
					"," +
					'"code":' +
					utl.asJSONString(v.code) +
					"," +
					'"dependenciesSet":' +
					(function () {
						const ls0 = [];
						for (const it0 of v.dependenciesSet) {
							const res0 = utl.asJSONString(it0);
							ls0.push(res0);
						}
						return "[" + ls0.join(",") + "]";
					})() +
					"," +
					'"pureFnDependencies":' +
					(function () {
						const ls1 = [];
						for (const it1 of v.pureFnDependencies) {
							const res1 = utl.asJSONString(it1);
							ls1.push(res1);
						}
						return "[" + ls1.join(",") + "]";
					})() +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_gCQYSg: {
		isNoop: false,
		typeName: "JitFnArgs",
		fnID: "js",
		jitFnHash: "js_gCQYSg",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_gCQYSg(v){return '{'+(function(){\n const ls0 = [];\n for (const p0 in v) {\n if (\"vλl\" === p0) continue;\n if (p0 !== undefined) ls0.push(utl.asJSONString(p0) + ':' + utl.asJSONString(v[p0]));\n }\n if (!ls0.length) return '';\n return ls0.join(',')+\",\";\n })()+\"\\\"vλl\\\"\"+':'+utl.asJSONString(v[\"vλl\"])+'}'}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_gCQYSg(v) {
				return (
					"{" +
					(function () {
						const ls0 = [];
						for (const p0 in v) {
							if ("vλl" === p0) continue;
							if (p0 !== undefined)
								ls0.push(utl.asJSONString(p0) + ":" + utl.asJSONString(v[p0]));
						}
						if (!ls0.length) return "";
						return ls0.join(",") + ",";
					})() +
					'"vλl"' +
					":" +
					utl.asJSONString(v["vλl"]) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "js",
		jitFnHash: "js_R7hJ5T",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not JsonStringify union: item does not belong to the union";\nconst js_WEWIGI = utl.getJIT("js_WEWIGI"); return function js_R7hJ5T(v){return \'{\'+(v.id === undefined ? \'\' : \'"id":\'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === \'string\') {return utl.asJSONString(v.id)} else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? \'\' : \'"errorData":\'+js_WEWIGI.fn(v.errorData)+",")+\'"publicMessage":\'+utl.asJSONString(v.publicMessage)+","+"\\"mion:isΣrrθr\\""+\':\'+(v["mion:isΣrrθr"] ? \'true\' : \'false\')+","+\'"type":\'+utl.asJSONString(v.type)+","+\'"message":\'+utl.asJSONString(v.message)+","+\'"name":\'+utl.asJSONString(v.name)+","+\'"statusCode":\'+v.statusCode+\'}\'}',
		dependenciesSet: new Set(["js_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not JsonStringify union: item does not belong to the union";
			const js_WEWIGI = utl.getJIT("js_WEWIGI");
			return function js_R7hJ5T(v) {
				return (
					"{" +
					(v.id === undefined
						? ""
						: '"id":' +
							(function () {
								if (Number.isFinite(v.id)) {
									return v.id;
								} else if (typeof v.id === "string") {
									return utl.asJSONString(v.id);
								} else {
									throw new Error(uErr0);
								}
							})() +
							",") +
					(v.errorData === undefined
						? ""
						: '"errorData":' + js_WEWIGI.fn(v.errorData) + ",") +
					'"publicMessage":' +
					utl.asJSONString(v.publicMessage) +
					"," +
					'"mion:isΣrrθr"' +
					":" +
					(v["mion:isΣrrθr"] ? "true" : "false") +
					"," +
					'"type":' +
					utl.asJSONString(v.type) +
					"," +
					'"message":' +
					utl.asJSONString(v.message) +
					"," +
					'"name":' +
					utl.asJSONString(v.name) +
					"," +
					'"statusCode":' +
					v.statusCode +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_WEWIGI: {
		isNoop: false,
		typeName: "Readonly",
		fnID: "js",
		jitFnHash: "js_WEWIGI",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_WEWIGI(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + JSON.stringify(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_WEWIGI(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + JSON.stringify(v[p1]));
							}
							if (!ls1.length) return "";
							return ls1.join(",");
						})(),
					);
					return "{" + ns0.join(",") + "}";
				})();
			};
		},
		fn: undefined,
	},
	tBi_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "tBi",
		jitFnHash: "tBi_EUIgsu",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr0 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_Ik8k60 = utl.getJIT("tBi_Ik8k60");\nconst is_Ik8k60 = utl.getJIT("is_Ik8k60");\nconst uKOpts0 = {checkNonJitProps: true};\nconst hk_Ik8k60 = utl.getJIT("hk_Ik8k60");\nconst tBi_R7hJ5T = utl.getJIT("tBi_R7hJ5T");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T");\nconst hk_R7hJ5T = utl.getJIT("hk_R7hJ5T"); return function tBi_EUIgsu(v,Ser){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if ((is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v,uKOpts0))) {Ser.view.setUint8(Ser.index++, 0);tBi_Ik8k60.fn(v,Ser)}else if ((is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v,uKOpts0))) {Ser.view.setUint8(Ser.index++, 1);tBi_R7hJ5T.fn(v,Ser)}else {throw new Error(uErr0);} return Ser}',
		dependenciesSet: new Set([
			"tBi_Ik8k60",
			"tBi_GAquSa",
			"tBi_hzbJrn",
			"tBi_bzlNFR",
			"tBi_Ei8qua",
			"tBi_JNJ3FN",
			"tBi_okWaie",
			"tBi_Bt1x9j",
			"tBi_tf5dpV",
			"tBi_EmCqyw",
			"tBi_gCQYSg",
			"tBi_tP7Vvb",
			"tBi_cE6uKo",
			"is_Ik8k60",
			"is_tP7Vvb",
			"is_cE6uKo",
			"is_Ei8qua",
			"is_GAquSa",
			"is_hzbJrn",
			"is_bzlNFR",
			"is_JNJ3FN",
			"is_okWaie",
			"is_Bt1x9j",
			"is_tf5dpV",
			"is_EmCqyw",
			"is_gCQYSg",
			"hk_Ik8k60",
			"hk_tP7Vvb",
			"hk_cE6uKo",
			"hk_Ei8qua",
			"hk_GAquSa",
			"hk_hzbJrn",
			"hk_bzlNFR",
			"hk_JNJ3FN",
			"hk_okWaie",
			"hk_Bt1x9j",
			"hk_tf5dpV",
			"hk_EmCqyw",
			"hk_gCQYSg",
			"tBi_R7hJ5T",
			"tBi_WEWIGI",
			"is_R7hJ5T",
			"is_WEWIGI",
			"hk_R7hJ5T",
			"hk_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_Ik8k60 = utl.getJIT("tBi_Ik8k60");
			const is_Ik8k60 = utl.getJIT("is_Ik8k60");
			const uKOpts0 = { checkNonJitProps: true };
			const hk_Ik8k60 = utl.getJIT("hk_Ik8k60");
			const tBi_R7hJ5T = utl.getJIT("tBi_R7hJ5T");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			const hk_R7hJ5T = utl.getJIT("hk_R7hJ5T");
			return function tBi_EUIgsu(v, Ser) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_Ik8k60.fn(v) && !hk_Ik8k60.fn(v, uKOpts0)) {
					Ser.view.setUint8(Ser.index++, 0);
					tBi_Ik8k60.fn(v, Ser);
				} else if (is_R7hJ5T.fn(v) && !hk_R7hJ5T.fn(v, uKOpts0)) {
					Ser.view.setUint8(Ser.index++, 1);
					tBi_R7hJ5T.fn(v, Ser);
				} else {
					throw new Error(uErr0);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "tBi",
		jitFnHash: "tBi_Ik8k60",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_GAquSa = utl.getJIT("tBi_GAquSa");\nconst tBi_tf5dpV = utl.getJIT("tBi_tf5dpV");\nconst tBi_tP7Vvb = utl.getJIT("tBi_tP7Vvb"); return function tBi_Ik8k60(v,Ser){tBi_GAquSa.fn(v.methods,Ser);tBi_tf5dpV.fn(v.deps,Ser);tBi_tP7Vvb.fn(v.purFnDeps,Ser);\n; return Ser}',
		dependenciesSet: new Set([
			"tBi_GAquSa",
			"tBi_hzbJrn",
			"tBi_bzlNFR",
			"tBi_Ei8qua",
			"tBi_JNJ3FN",
			"tBi_okWaie",
			"tBi_Bt1x9j",
			"tBi_tf5dpV",
			"tBi_EmCqyw",
			"tBi_gCQYSg",
			"tBi_tP7Vvb",
			"tBi_cE6uKo",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_GAquSa = utl.getJIT("tBi_GAquSa");
			const tBi_tf5dpV = utl.getJIT("tBi_tf5dpV");
			const tBi_tP7Vvb = utl.getJIT("tBi_tP7Vvb");
			return function tBi_Ik8k60(v, Ser) {
				tBi_GAquSa.fn(v.methods, Ser);
				tBi_tf5dpV.fn(v.deps, Ser);
				tBi_tP7Vvb.fn(v.purFnDeps, Ser);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_GAquSa: {
		isNoop: false,
		typeName: "SerializablePublicMethods",
		fnID: "tBi",
		jitFnHash: "tBi_GAquSa",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_hzbJrn = utl.getJIT("tBi_hzbJrn"); return function tBi_GAquSa(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); tBi_hzbJrn.fn(v[p0],Ser); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}',
		dependenciesSet: new Set([
			"tBi_hzbJrn",
			"tBi_bzlNFR",
			"tBi_Ei8qua",
			"tBi_JNJ3FN",
			"tBi_okWaie",
			"tBi_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_hzbJrn = utl.getJIT("tBi_hzbJrn");
			return function tBi_GAquSa(v, Ser) {
				let cnt0 = 0;
				const piI0 = Ser.index;
				Ser.index += 4;
				for (const p0 in v) {
					Ser.serString(p0);
					tBi_hzbJrn.fn(v[p0], Ser);
					cnt0++;
				}
				Ser.view.setUint32(piI0, cnt0, 1);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_hzbJrn: {
		isNoop: false,
		typeName: "SerializablePublicMethod",
		fnID: "tBi",
		jitFnHash: "tBi_hzbJrn",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_bzlNFR = utl.getJIT("tBi_bzlNFR");\nconst tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");\nconst tBi_JNJ3FN = utl.getJIT("tBi_JNJ3FN");\nconst tBi_Bt1x9j = utl.getJIT("tBi_Bt1x9j"); return function tBi_hzbJrn(v,Ser){Ser.view.setFloat64(Ser.index,v.type, 1, (Ser.index += 8));Ser.serString(v.id);tBi_bzlNFR.fn(v.paramsJitHashes,Ser);tBi_bzlNFR.fn(v.returnJitHashes,Ser);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.paramNames !== undefined) {tBi_Ei8qua.fn(v.paramNames,Ser);Ser.setBitMask(bmI0, 0 & 7)}if (v.headersParam !== undefined) {tBi_JNJ3FN.fn(v.headersParam,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.headersReturn !== undefined) {tBi_JNJ3FN.fn(v.headersReturn,Ser);Ser.setBitMask(bmI0, 2 & 7)}if (v.hookIds !== undefined) {tBi_Ei8qua.fn(v.hookIds,Ser);Ser.setBitMask(bmI0, 3 & 7)}if (v.pathPointers !== undefined) {tBi_Bt1x9j.fn(v.pathPointers,Ser);Ser.setBitMask(bmI0, 4 & 7)} return Ser}',
		dependenciesSet: new Set([
			"tBi_bzlNFR",
			"tBi_Ei8qua",
			"tBi_JNJ3FN",
			"tBi_okWaie",
			"tBi_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_bzlNFR = utl.getJIT("tBi_bzlNFR");
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			const tBi_JNJ3FN = utl.getJIT("tBi_JNJ3FN");
			const tBi_Bt1x9j = utl.getJIT("tBi_Bt1x9j");
			return function tBi_hzbJrn(v, Ser) {
				Ser.view.setFloat64(Ser.index, v.type, 1, (Ser.index += 8));
				Ser.serString(v.id);
				tBi_bzlNFR.fn(v.paramsJitHashes, Ser);
				tBi_bzlNFR.fn(v.returnJitHashes, Ser);
				const bmI0 = Ser.index;
				Ser.view.setUint8(Ser.index++, 0);
				if (v.paramNames !== undefined) {
					tBi_Ei8qua.fn(v.paramNames, Ser);
					Ser.setBitMask(bmI0, 0 & 7);
				}
				if (v.headersParam !== undefined) {
					tBi_JNJ3FN.fn(v.headersParam, Ser);
					Ser.setBitMask(bmI0, 1 & 7);
				}
				if (v.headersReturn !== undefined) {
					tBi_JNJ3FN.fn(v.headersReturn, Ser);
					Ser.setBitMask(bmI0, 2 & 7);
				}
				if (v.hookIds !== undefined) {
					tBi_Ei8qua.fn(v.hookIds, Ser);
					Ser.setBitMask(bmI0, 3 & 7);
				}
				if (v.pathPointers !== undefined) {
					tBi_Bt1x9j.fn(v.pathPointers, Ser);
					Ser.setBitMask(bmI0, 4 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_bzlNFR: {
		isNoop: false,
		typeName: "JitFunctionsHashes",
		fnID: "tBi",
		jitFnHash: "tBi_bzlNFR",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_bzlNFR(v,Ser){Ser.serString(v.isType);Ser.serString(v.typeErrors);Ser.serString(v.prepareForJson);Ser.serString(v.restoreFromJson);Ser.serString(v.jsonStringify);Ser.serString(v.toBinary);Ser.serString(v.fromBinary);\n; return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_bzlNFR(v, Ser) {
				Ser.serString(v.isType);
				Ser.serString(v.typeErrors);
				Ser.serString(v.prepareForJson);
				Ser.serString(v.restoreFromJson);
				Ser.serString(v.jsonStringify);
				Ser.serString(v.toBinary);
				Ser.serString(v.fromBinary);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_Ei8qua: {
		isNoop: false,
		typeName: "array",
		fnID: "tBi",
		jitFnHash: "tBi_Ei8qua",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_Ei8qua(v,Ser){\n Ser.view.setUint32(Ser.index, v.length, 1); Ser.index += 4;\n for (let i0 = 0; i0 < v.length; i0++) {Ser.serString(v[i0]);}\n ; return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_Ei8qua(v, Ser) {
				Ser.view.setUint32(Ser.index, v.length, 1);
				Ser.index += 4;
				for (let i0 = 0; i0 < v.length; i0++) {
					Ser.serString(v[i0]);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_JNJ3FN: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "tBi",
		jitFnHash: "tBi_JNJ3FN",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");\nconst tBi_okWaie = utl.getJIT("tBi_okWaie"); return function tBi_JNJ3FN(v,Ser){tBi_Ei8qua.fn(v.headerNames,Ser);tBi_okWaie.fn(v.jitHashes,Ser);\n; return Ser}',
		dependenciesSet: new Set(["tBi_Ei8qua", "tBi_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			const tBi_okWaie = utl.getJIT("tBi_okWaie");
			return function tBi_JNJ3FN(v, Ser) {
				tBi_Ei8qua.fn(v.headerNames, Ser);
				tBi_okWaie.fn(v.jitHashes, Ser);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_okWaie: {
		isNoop: false,
		typeName: "Pick",
		fnID: "tBi",
		jitFnHash: "tBi_okWaie",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_okWaie(v,Ser){Ser.serString(v.isType);Ser.serString(v.typeErrors);\n; return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_okWaie(v, Ser) {
				Ser.serString(v.isType);
				Ser.serString(v.typeErrors);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_Bt1x9j: {
		isNoop: false,
		typeName: "array",
		fnID: "tBi",
		jitFnHash: "tBi_Bt1x9j",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_Bt1x9j(v,Ser){\n Ser.view.setUint32(Ser.index, v.length, 1); Ser.index += 4;\n for (let i0 = 0; i0 < v.length; i0++) {tBi_Ei8qua.fn(v[i0],Ser)}\n ; return Ser}',
		dependenciesSet: new Set(["tBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			return function tBi_Bt1x9j(v, Ser) {
				Ser.view.setUint32(Ser.index, v.length, 1);
				Ser.index += 4;
				for (let i0 = 0; i0 < v.length; i0++) {
					tBi_Ei8qua.fn(v[i0], Ser);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "tBi",
		jitFnHash: "tBi_tf5dpV",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_EmCqyw = utl.getJIT("tBi_EmCqyw"); return function tBi_tf5dpV(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); tBi_EmCqyw.fn(v[p0],Ser); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}',
		dependenciesSet: new Set(["tBi_EmCqyw", "tBi_gCQYSg", "tBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_EmCqyw = utl.getJIT("tBi_EmCqyw");
			return function tBi_tf5dpV(v, Ser) {
				let cnt0 = 0;
				const piI0 = Ser.index;
				Ser.index += 4;
				for (const p0 in v) {
					Ser.serString(p0);
					tBi_EmCqyw.fn(v[p0], Ser);
					cnt0++;
				}
				Ser.view.setUint32(piI0, cnt0, 1);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "tBi",
		jitFnHash: "tBi_EmCqyw",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_gCQYSg = utl.getJIT("tBi_gCQYSg");\nconst tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_EmCqyw(v,Ser){Ser.serString(v.typeName);Ser.serString(v.fnID);Ser.serString(v.jitFnHash);tBi_gCQYSg.fn(v.args,Ser);tBi_gCQYSg.fn(v.defaultParamValues,Ser);Ser.serString(v.code);Ser.view.setUint32(Ser.index, v.dependenciesSet.size, 1); Ser.index += 4; for (const it0 of v.dependenciesSet) {Ser.serString(it0);};Ser.view.setUint32(Ser.index, v.pureFnDependencies.size, 1); Ser.index += 4; for (const it1 of v.pureFnDependencies) {Ser.serString(it1);}\nconst bmI2 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.isNoop !== undefined) {Ser.view.setUint8(Ser.index++, !!v.isNoop);Ser.setBitMask(bmI2, 0 & 7)}if (v.paramNames !== undefined) {tBi_Ei8qua.fn(v.paramNames,Ser);Ser.setBitMask(bmI2, 1 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_gCQYSg", "tBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_gCQYSg = utl.getJIT("tBi_gCQYSg");
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			return function tBi_EmCqyw(v, Ser) {
				Ser.serString(v.typeName);
				Ser.serString(v.fnID);
				Ser.serString(v.jitFnHash);
				tBi_gCQYSg.fn(v.args, Ser);
				tBi_gCQYSg.fn(v.defaultParamValues, Ser);
				Ser.serString(v.code);
				Ser.view.setUint32(Ser.index, v.dependenciesSet.size, 1);
				Ser.index += 4;
				for (const it0 of v.dependenciesSet) {
					Ser.serString(it0);
				}
				Ser.view.setUint32(Ser.index, v.pureFnDependencies.size, 1);
				Ser.index += 4;
				for (const it1 of v.pureFnDependencies) {
					Ser.serString(it1);
				}
				const bmI2 = Ser.index;
				Ser.view.setUint8(Ser.index++, 0);
				if (v.isNoop !== undefined) {
					Ser.view.setUint8(Ser.index++, !!v.isNoop);
					Ser.setBitMask(bmI2, 0 & 7);
				}
				if (v.paramNames !== undefined) {
					tBi_Ei8qua.fn(v.paramNames, Ser);
					Ser.setBitMask(bmI2, 1 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_gCQYSg: {
		isNoop: false,
		typeName: "JitFnArgs",
		fnID: "tBi",
		jitFnHash: "tBi_gCQYSg",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_gCQYSg(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); Ser.serString(v[p0]); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
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
		},
		fn: undefined,
	},
	tBi_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "tBi",
		jitFnHash: "tBi_tP7Vvb",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_cE6uKo = utl.getJIT("tBi_cE6uKo"); return function tBi_tP7Vvb(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); tBi_cE6uKo.fn(v[p0],Ser); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}',
		dependenciesSet: new Set(["tBi_cE6uKo", "tBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_cE6uKo = utl.getJIT("tBi_cE6uKo");
			return function tBi_tP7Vvb(v, Ser) {
				let cnt0 = 0;
				const piI0 = Ser.index;
				Ser.index += 4;
				for (const p0 in v) {
					Ser.serString(p0);
					tBi_cE6uKo.fn(v[p0], Ser);
					cnt0++;
				}
				Ser.view.setUint32(piI0, cnt0, 1);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "tBi",
		jitFnHash: "tBi_cE6uKo",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_cE6uKo(v,Ser){tBi_Ei8qua.fn(v.paramNames,Ser);Ser.serString(v.code);Ser.serString(v.pureFnHash);Ser.view.setUint32(Ser.index, v.dependencies.size, 1); Ser.index += 4; for (const it0 of v.dependencies) {Ser.serString(it0);}\n; return Ser}',
		dependenciesSet: new Set(["tBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			return function tBi_cE6uKo(v, Ser) {
				tBi_Ei8qua.fn(v.paramNames, Ser);
				Ser.serString(v.code);
				Ser.serString(v.pureFnHash);
				Ser.view.setUint32(Ser.index, v.dependencies.size, 1);
				Ser.index += 4;
				for (const it0 of v.dependencies) {
					Ser.serString(it0);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tBi",
		jitFnHash: "tBi_R7hJ5T",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr1 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_R7hJ5T(v,Ser){;Ser.serString(v.message);Ser.serString(v.name);Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.serString(v.publicMessage);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === \'string\') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);} else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr1 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
			return function tBi_R7hJ5T(v, Ser) {
				Ser.serString(v.message);
				Ser.serString(v.name);
				Ser.view.setFloat64(Ser.index, v.statusCode, 1, (Ser.index += 8));
				Ser.serString(v.publicMessage);
				const bmI0 = Ser.index;
				Ser.view.setUint8(Ser.index++, 0);
				if (v.id !== undefined) {
					if (Number.isFinite(v.id)) {
						Ser.view.setUint8(Ser.index++, 0);
						Ser.view.setFloat64(Ser.index, v.id, 1, (Ser.index += 8));
					} else if (typeof v.id === "string") {
						Ser.view.setUint8(Ser.index++, 1);
						Ser.serString(v.id);
					} else {
						throw new Error(uErr1);
					}
					Ser.setBitMask(bmI0, 0 & 7);
				}
				if (v.errorData !== undefined) {
					tBi_WEWIGI.fn(v.errorData, Ser);
					Ser.setBitMask(bmI0, 1 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_WEWIGI: {
		isNoop: false,
		typeName: "Readonly",
		fnID: "tBi",
		jitFnHash: "tBi_WEWIGI",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_WEWIGI(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); Ser.serString(JSON.stringify(v[p0])); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
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
		},
		fn: undefined,
	},
	fBi_EUIgsu: {
		isNoop: false,
		typeName: "union",
		fnID: "fBi",
		jitFnHash: "fBi_EUIgsu",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr0 = "Can not binary decode union: invalid union index";\nconst fBi_Ik8k60 = utl.getJIT("fBi_Ik8k60");\nconst fBi_R7hJ5T = utl.getJIT("fBi_R7hJ5T"); return function fBi_EUIgsu(ret,Des){\n const dec0 = Des.view.getUint8(Des.index++);\n if (dec0 === 0) {ret = fBi_Ik8k60.fn(undefined,Des)}else if (dec0 === 1) {ret = fBi_R7hJ5T.fn(undefined,Des)}\n else {throw new Error(uErr0)}\n ; return ret}',
		dependenciesSet: new Set([
			"fBi_Ik8k60",
			"fBi_GAquSa",
			"fBi_hzbJrn",
			"fBi_bzlNFR",
			"fBi_Ei8qua",
			"fBi_JNJ3FN",
			"fBi_okWaie",
			"fBi_Bt1x9j",
			"fBi_tf5dpV",
			"fBi_EmCqyw",
			"fBi_gCQYSg",
			"fBi_tP7Vvb",
			"fBi_cE6uKo",
			"fBi_R7hJ5T",
			"fBi_WEWIGI",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 = "Can not binary decode union: invalid union index";
			const fBi_Ik8k60 = utl.getJIT("fBi_Ik8k60");
			const fBi_R7hJ5T = utl.getJIT("fBi_R7hJ5T");
			return function fBi_EUIgsu(ret, Des) {
				const dec0 = Des.view.getUint8(Des.index++);
				if (dec0 === 0) {
					ret = fBi_Ik8k60.fn(undefined, Des);
				} else if (dec0 === 1) {
					ret = fBi_R7hJ5T.fn(undefined, Des);
				} else {
					throw new Error(uErr0);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_Ik8k60: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "fBi",
		jitFnHash: "fBi_Ik8k60",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_GAquSa = utl.getJIT("fBi_GAquSa");\nconst fBi_tf5dpV = utl.getJIT("fBi_tf5dpV");\nconst fBi_tP7Vvb = utl.getJIT("fBi_tP7Vvb"); return function fBi_Ik8k60(ret,Des){return {methods:fBi_GAquSa.fn(undefined,Des),deps:fBi_tf5dpV.fn(undefined,Des),purFnDeps:fBi_tP7Vvb.fn(undefined,Des)}}',
		dependenciesSet: new Set([
			"fBi_GAquSa",
			"fBi_hzbJrn",
			"fBi_bzlNFR",
			"fBi_Ei8qua",
			"fBi_JNJ3FN",
			"fBi_okWaie",
			"fBi_Bt1x9j",
			"fBi_tf5dpV",
			"fBi_EmCqyw",
			"fBi_gCQYSg",
			"fBi_tP7Vvb",
			"fBi_cE6uKo",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_GAquSa = utl.getJIT("fBi_GAquSa");
			const fBi_tf5dpV = utl.getJIT("fBi_tf5dpV");
			const fBi_tP7Vvb = utl.getJIT("fBi_tP7Vvb");
			return function fBi_Ik8k60(ret, Des) {
				return {
					methods: fBi_GAquSa.fn(undefined, Des),
					deps: fBi_tf5dpV.fn(undefined, Des),
					purFnDeps: fBi_tP7Vvb.fn(undefined, Des),
				};
			};
		},
		fn: undefined,
	},
	fBi_GAquSa: {
		isNoop: false,
		typeName: "SerializablePublicMethods",
		fnID: "fBi",
		jitFnHash: "fBi_GAquSa",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_hzbJrn = utl.getJIT("fBi_hzbJrn"); return function fBi_GAquSa(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desString();ret[p0] = fBi_hzbJrn.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set([
			"fBi_hzbJrn",
			"fBi_bzlNFR",
			"fBi_Ei8qua",
			"fBi_JNJ3FN",
			"fBi_okWaie",
			"fBi_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_hzbJrn = utl.getJIT("fBi_hzbJrn");
			return function fBi_GAquSa(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desString();
					ret[p0] = fBi_hzbJrn.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_hzbJrn: {
		isNoop: false,
		typeName: "SerializablePublicMethod",
		fnID: "fBi",
		jitFnHash: "fBi_hzbJrn",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_bzlNFR = utl.getJIT("fBi_bzlNFR");\nconst fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");\nconst fBi_JNJ3FN = utl.getJIT("fBi_JNJ3FN");\nconst fBi_Bt1x9j = utl.getJIT("fBi_Bt1x9j"); return function fBi_hzbJrn(ret,Des){ret = {type:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),id:Des.desString(),paramsJitHashes:fBi_bzlNFR.fn(undefined,Des),returnJitHashes:fBi_bzlNFR.fn(undefined,Des)}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.paramNames = fBi_Ei8qua.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.headersParam = fBi_JNJ3FN.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.headersReturn = fBi_JNJ3FN.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {ret.hookIds = fBi_Ei8qua.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (4 & 7))) {ret.pathPointers = fBi_Bt1x9j.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set([
			"fBi_bzlNFR",
			"fBi_Ei8qua",
			"fBi_JNJ3FN",
			"fBi_okWaie",
			"fBi_Bt1x9j",
		]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_bzlNFR = utl.getJIT("fBi_bzlNFR");
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			const fBi_JNJ3FN = utl.getJIT("fBi_JNJ3FN");
			const fBi_Bt1x9j = utl.getJIT("fBi_Bt1x9j");
			return function fBi_hzbJrn(ret, Des) {
				ret = {
					type: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
					id: Des.desString(),
					paramsJitHashes: fBi_bzlNFR.fn(undefined, Des),
					returnJitHashes: fBi_bzlNFR.fn(undefined, Des),
				};

				const bimI0 = Des.index;
				Des.index += 1;
				if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
					ret.paramNames = fBi_Ei8qua.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {
					ret.headersParam = fBi_JNJ3FN.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {
					ret.headersReturn = fBi_JNJ3FN.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {
					ret.hookIds = fBi_Ei8qua.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (4 & 7))) {
					ret.pathPointers = fBi_Bt1x9j.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_bzlNFR: {
		isNoop: false,
		typeName: "JitFunctionsHashes",
		fnID: "fBi",
		jitFnHash: "fBi_bzlNFR",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_bzlNFR(ret,Des){return {isType:Des.desString(),typeErrors:Des.desString(),prepareForJson:Des.desString(),restoreFromJson:Des.desString(),jsonStringify:Des.desString(),toBinary:Des.desString(),fromBinary:Des.desString()}}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_bzlNFR(ret, Des) {
				return {
					isType: Des.desString(),
					typeErrors: Des.desString(),
					prepareForJson: Des.desString(),
					restoreFromJson: Des.desString(),
					jsonStringify: Des.desString(),
					toBinary: Des.desString(),
					fromBinary: Des.desString(),
				};
			};
		},
		fn: undefined,
	},
	fBi_Ei8qua: {
		isNoop: false,
		typeName: "array",
		fnID: "fBi",
		jitFnHash: "fBi_Ei8qua",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_Ei8qua(ret,Des){\n const arrL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = new Array(arrL0);\n for (let i0 = 0; i0 < arrL0; i0++) {ret[i0] = Des.desString();}\n ; return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_Ei8qua(ret, Des) {
				const arrL0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = new Array(arrL0);
				for (let i0 = 0; i0 < arrL0; i0++) {
					ret[i0] = Des.desString();
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_JNJ3FN: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "fBi",
		jitFnHash: "fBi_JNJ3FN",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");\nconst fBi_okWaie = utl.getJIT("fBi_okWaie"); return function fBi_JNJ3FN(ret,Des){return {headerNames:fBi_Ei8qua.fn(undefined,Des),jitHashes:fBi_okWaie.fn(undefined,Des)}}',
		dependenciesSet: new Set(["fBi_Ei8qua", "fBi_okWaie"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			const fBi_okWaie = utl.getJIT("fBi_okWaie");
			return function fBi_JNJ3FN(ret, Des) {
				return {
					headerNames: fBi_Ei8qua.fn(undefined, Des),
					jitHashes: fBi_okWaie.fn(undefined, Des),
				};
			};
		},
		fn: undefined,
	},
	fBi_okWaie: {
		isNoop: false,
		typeName: "Pick",
		fnID: "fBi",
		jitFnHash: "fBi_okWaie",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_okWaie(ret,Des){return {isType:Des.desString(),typeErrors:Des.desString()}}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_okWaie(ret, Des) {
				return { isType: Des.desString(), typeErrors: Des.desString() };
			};
		},
		fn: undefined,
	},
	fBi_Bt1x9j: {
		isNoop: false,
		typeName: "array",
		fnID: "fBi",
		jitFnHash: "fBi_Bt1x9j",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_Bt1x9j(ret,Des){\n const arrL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = new Array(arrL0);\n for (let i0 = 0; i0 < arrL0; i0++) {ret[i0] = fBi_Ei8qua.fn(undefined,Des);}\n ; return ret}',
		dependenciesSet: new Set(["fBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			return function fBi_Bt1x9j(ret, Des) {
				const arrL0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = new Array(arrL0);
				for (let i0 = 0; i0 < arrL0; i0++) {
					ret[i0] = fBi_Ei8qua.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_tf5dpV: {
		isNoop: false,
		typeName: "Record",
		fnID: "fBi",
		jitFnHash: "fBi_tf5dpV",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_EmCqyw = utl.getJIT("fBi_EmCqyw"); return function fBi_tf5dpV(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desString();ret[p0] = fBi_EmCqyw.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_EmCqyw", "fBi_gCQYSg", "fBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_EmCqyw = utl.getJIT("fBi_EmCqyw");
			return function fBi_tf5dpV(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desString();
					ret[p0] = fBi_EmCqyw.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "fBi",
		jitFnHash: "fBi_EmCqyw",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_gCQYSg = utl.getJIT("fBi_gCQYSg");\nconst fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_EmCqyw(ret,Des){ret = {typeName:Des.desString(),fnID:Des.desString(),jitFnHash:Des.desString(),args:fBi_gCQYSg.fn(undefined,Des),defaultParamValues:fBi_gCQYSg.fn(undefined,Des),code:Des.desString()}\nconst it0 = new Set(); const itL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; for (let itI0 = 0; itI0 < itL0; itI0++) {const sK1 = Des.desString(); it0.add(sK1);} ret.dependenciesSet = it0;const it2 = new Set(); const itL2 = Des.view.getUint32(Des.index, 1); Des.index += 4; for (let itI2 = 0; itI2 < itL2; itI2++) {const sK3 = Des.desString(); it2.add(sK3);} ret.pureFnDependencies = it2;\nconst bimI4 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI4, 1) & (1 << (0 & 7))) {ret.isNoop = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI4, 1) & (1 << (1 & 7))) {ret.paramNames = fBi_Ei8qua.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_gCQYSg", "fBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_gCQYSg = utl.getJIT("fBi_gCQYSg");
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			return function fBi_EmCqyw(ret, Des) {
				ret = {
					typeName: Des.desString(),
					fnID: Des.desString(),
					jitFnHash: Des.desString(),
					args: fBi_gCQYSg.fn(undefined, Des),
					defaultParamValues: fBi_gCQYSg.fn(undefined, Des),
					code: Des.desString(),
				};
				const it0 = new Set();
				const itL0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				for (let itI0 = 0; itI0 < itL0; itI0++) {
					const sK1 = Des.desString();
					it0.add(sK1);
				}
				ret.dependenciesSet = it0;
				const it2 = new Set();
				const itL2 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				for (let itI2 = 0; itI2 < itL2; itI2++) {
					const sK3 = Des.desString();
					it2.add(sK3);
				}
				ret.pureFnDependencies = it2;
				const bimI4 = Des.index;
				Des.index += 1;
				if (Des.view.getUint8(bimI4, 1) & (1 << (0 & 7))) {
					ret.isNoop = Des.view.getUint8(Des.index++) === 1;
				}
				if (Des.view.getUint8(bimI4, 1) & (1 << (1 & 7))) {
					ret.paramNames = fBi_Ei8qua.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_gCQYSg: {
		isNoop: false,
		typeName: "JitFnArgs",
		fnID: "fBi",
		jitFnHash: "fBi_gCQYSg",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_gCQYSg(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desString();ret[p0] = Des.desString();} return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_gCQYSg(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desString();
					ret[p0] = Des.desString();
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_tP7Vvb: {
		isNoop: false,
		typeName: "Record",
		fnID: "fBi",
		jitFnHash: "fBi_tP7Vvb",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_cE6uKo = utl.getJIT("fBi_cE6uKo"); return function fBi_tP7Vvb(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desString();ret[p0] = fBi_cE6uKo.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_cE6uKo", "fBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_cE6uKo = utl.getJIT("fBi_cE6uKo");
			return function fBi_tP7Vvb(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desString();
					ret[p0] = fBi_cE6uKo.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "fBi",
		jitFnHash: "fBi_cE6uKo",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_cE6uKo(ret,Des){ret = {paramNames:fBi_Ei8qua.fn(undefined,Des),code:Des.desString(),pureFnHash:Des.desString()}\nconst it0 = new Set(); const itL0 = Des.view.getUint32(Des.index, 1); Des.index += 4; for (let itI0 = 0; itI0 < itL0; itI0++) {const sK1 = Des.desString(); it0.add(sK1);} ret.dependencies = it0; return ret}',
		dependenciesSet: new Set(["fBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			return function fBi_cE6uKo(ret, Des) {
				ret = {
					paramNames: fBi_Ei8qua.fn(undefined, Des),
					code: Des.desString(),
					pureFnHash: Des.desString(),
				};
				const it0 = new Set();
				const itL0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				for (let itI0 = 0; itI0 < itL0; itI0++) {
					const sK1 = Des.desString();
					it0.add(sK1);
				}
				ret.dependencies = it0;
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_R7hJ5T: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fBi",
		jitFnHash: "fBi_R7hJ5T",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr1 = "Can not binary decode union: invalid union index";\nconst fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_R7hJ5T(ret,Des){ret = {"mion:isΣrrθr":true,type:"rpc-metadata-not-found",message:Des.desString(),name:Des.desString(),statusCode:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),publicMessage:Des.desString()}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {\n const dec1 = Des.view.getUint8(Des.index++);\n if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}\n else {throw new Error(uErr1)}\n ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}',
		dependenciesSet: new Set(["fBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr1 = "Can not binary decode union: invalid union index";
			const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
			return function fBi_R7hJ5T(ret, Des) {
				ret = {
					"mion:isΣrrθr": true,
					type: "rpc-metadata-not-found",
					message: Des.desString(),
					name: Des.desString(),
					statusCode: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
					publicMessage: Des.desString(),
				};

				const bimI0 = Des.index;
				Des.index += 1;
				if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
					const dec1 = Des.view.getUint8(Des.index++);
					if (dec1 === 0) {
						ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8));
					} else if (dec1 === 1) {
						ret.id = Des.desString();
					} else {
						throw new Error(uErr1);
					}
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {
					ret.errorData = fBi_WEWIGI.fn(undefined, Des);
				}
				let desFn0 = utl.getDeserializeFn("RpcError");
				if (desFn0) {
					ret = desFn0(ret);
				} else if ((desFn0 = utl.getSerializeClass("RpcError"))) {
					ret = new desFn0(ret);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_WEWIGI: {
		isNoop: false,
		typeName: "Readonly",
		fnID: "fBi",
		jitFnHash: "fBi_WEWIGI",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_WEWIGI(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desString();ret[p0] = JSON.parse(Des.desString());} return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_WEWIGI(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desString();
					ret[p0] = JSON.parse(Des.desString());
				}
				return ret;
			};
		},
		fn: undefined,
	},
	is_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "is",
		jitFnHash: "is_hZzD9z",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_hZzD9z(v){return (v.length <= 2 && typeof v[0] === 'string' && (v[1] === undefined || (typeof v[1] === 'boolean')))}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_hZzD9z(v) {
				return (
					v.length <= 2 &&
					typeof v[0] === "string" &&
					(v[1] === undefined || typeof v[1] === "boolean")
				);
			};
		},
		fn: undefined,
	},
	te_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "te",
		jitFnHash: "te_hZzD9z",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: ' return function te_hZzD9z(v,pth=[],er=[]){if (v.length > 2) utl.err(pth,er,"params"); else {if (typeof v[0] !== \'string\') utl.err(pth,er,"string",[0]);if (v[1] !== undefined) {if (typeof v[1] !== \'boolean\') utl.err(pth,er,"boolean",[1]);}} return er}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function te_hZzD9z(v, pth = [], er = []) {
				if (v.length > 2) utl.err(pth, er, "params");
				else {
					if (typeof v[0] !== "string") utl.err(pth, er, "string", [0]);
					if (v[1] !== undefined) {
						if (typeof v[1] !== "boolean") utl.err(pth, er, "boolean", [1]);
					}
				}
				return er;
			};
		},
		fn: undefined,
	},
	tj_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "tj",
		jitFnHash: "tj_hZzD9z",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_hZzD9z(v){if (v[1] === undefined ) {if (v.length > 1) v[1] = null} return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_hZzD9z(v) {
				if (v[1] === undefined) {
					if (v.length > 1) v[1] = null;
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "fj",
		jitFnHash: "fj_hZzD9z",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_hZzD9z(v){if (v[1] === null ) {v[1] = undefined} return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_hZzD9z(v) {
				if (v[1] === null) {
					v[1] = undefined;
				}
				return v;
			};
		},
		fn: undefined,
	},
	js_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "js",
		jitFnHash: "js_hZzD9z",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_hZzD9z(v){return '['+utl.asJSONString(v[0])+(v[1] === undefined ? ','+'null' : ','+(v[1] ? 'true' : 'false'))+']'}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_hZzD9z(v) {
				return (
					"[" +
					utl.asJSONString(v[0]) +
					(v[1] === undefined
						? "," + "null"
						: "," + (v[1] ? "true" : "false")) +
					"]"
				);
			};
		},
		fn: undefined,
	},
	tBi_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "tBi",
		jitFnHash: "tBi_hZzD9z",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_hZzD9z(v,Ser){Ser.serString(v[0]);if (v[1] !== undefined){Ser.view.setUint8(Ser.index++, 1);Ser.view.setUint8(Ser.index++, !!v[1]);} else {Ser.view.setUint8(Ser.index++, 0)} return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_hZzD9z(v, Ser) {
				Ser.serString(v[0]);
				if (v[1] !== undefined) {
					Ser.view.setUint8(Ser.index++, 1);
					Ser.view.setUint8(Ser.index++, !!v[1]);
				} else {
					Ser.view.setUint8(Ser.index++, 0);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	fBi_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "fBi",
		jitFnHash: "fBi_hZzD9z",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_hZzD9z(ret,Des){ret = [];ret[0] = Des.desString();if (Des.view.getUint8(Des.index++) === 1){ret[1] = Des.view.getUint8(Des.index++) === 1} return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_hZzD9z(ret, Des) {
				ret = [];
				ret[0] = Des.desString();
				if (Des.view.getUint8(Des.index++) === 1) {
					ret[1] = Des.view.getUint8(Des.index++) === 1;
				}
				return ret;
			};
		},
		fn: undefined,
	},
	is_q2ck2E: {
		isNoop: false,
		typeName: "params",
		fnID: "is",
		jitFnHash: "is_q2ck2E",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_q2ck2E(v){return v.length === 0}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_q2ck2E(v) {
				return v.length === 0;
			};
		},
		fn: undefined,
	},
	te_q2ck2E: {
		isNoop: false,
		typeName: "params",
		fnID: "te",
		jitFnHash: "te_q2ck2E",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: ' return function te_q2ck2E(v,pth=[],er=[]){if (v.length !== 0) utl.err(pth,er,"params"); return er}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function te_q2ck2E(v, pth = [], er = []) {
				if (v.length !== 0) utl.err(pth, er, "params");
				return er;
			};
		},
		fn: undefined,
	},
	tj_q2ck2E: {
		isNoop: true,
		typeName: "params",
		fnID: "tj",
		jitFnHash: "tj_q2ck2E",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_q2ck2E(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_q2ck2E(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_q2ck2E: {
		isNoop: true,
		typeName: "params",
		fnID: "fj",
		jitFnHash: "fj_q2ck2E",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_q2ck2E(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_q2ck2E(v) {
				return v;
			};
		},
		fn: undefined,
	},
	js_q2ck2E: {
		isNoop: false,
		typeName: "params",
		fnID: "js",
		jitFnHash: "js_q2ck2E",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_q2ck2E(v){return '[]'}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_q2ck2E(v) {
				return "[]";
			};
		},
		fn: undefined,
	},
	tBi_q2ck2E: {
		isNoop: false,
		typeName: "params",
		fnID: "tBi",
		jitFnHash: "tBi_q2ck2E",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_q2ck2E(v,Ser){}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_q2ck2E(v, Ser) {};
		},
		fn: undefined,
	},
	fBi_q2ck2E: {
		isNoop: false,
		typeName: "params",
		fnID: "fBi",
		jitFnHash: "fBi_q2ck2E",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_q2ck2E(ret,Des){ret = new Array(0); return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_q2ck2E(ret, Des) {
				ret = new Array(0);
				return ret;
			};
		},
		fn: undefined,
	},
	is_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "is",
		jitFnHash: "is_iGQesm",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_WEWIGI = utl.getJIT(\"is_WEWIGI\"); return function is_iGQesm(v){return (typeof v === 'object' && v !== null && v[\"mion:isΣrrθr\"] === true && typeof v.type === 'string' && typeof v.message === 'string' && typeof v.name === 'string' && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && Number.isFinite(v.statusCode) && typeof v.publicMessage === 'string' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)))}",
		dependenciesSet: new Set(["is_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const is_WEWIGI = utl.getJIT("is_WEWIGI");
			return function is_iGQesm(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					v["mion:isΣrrθr"] === true &&
					typeof v.type === "string" &&
					typeof v.message === "string" &&
					typeof v.name === "string" &&
					(v.id === undefined ||
						Number.isFinite(v.id) ||
						typeof v.id === "string") &&
					Number.isFinite(v.statusCode) &&
					typeof v.publicMessage === "string" &&
					(v.errorData === undefined || is_WEWIGI.fn(v.errorData))
				);
			};
		},
		fn: undefined,
	},
	te_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "te",
		jitFnHash: "te_iGQesm",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const te_WEWIGI = utl.getJIT("te_WEWIGI"); return function te_iGQesm(v,pth=[],er=[]){\n if (!(typeof v === \'object\' && v !== null)) {\n utl.err(pth,er,"class");\n } else {\n if (v["mion:isΣrrθr"] !== true) utl.err(pth,er,"literal",["mion:isΣrrθr"]);if (typeof v.type !== \'string\') utl.err(pth,er,"string",["type"]);if (typeof v.message !== \'string\') utl.err(pth,er,"string",["message"]);if (typeof v.name !== \'string\') utl.err(pth,er,"string",["name"]);if (v.id !== undefined) {if (!(Number.isFinite(v.id) || typeof v.id === \'string\')) utl.err(pth,er,"union",["id"]);};if(!(Number.isFinite(v.statusCode))) utl.err(pth,er,"number",["statusCode"]);if (typeof v.publicMessage !== \'string\') utl.err(pth,er,"string",["publicMessage"]);if (v.errorData !== undefined) {pth.push("errorData"); te_WEWIGI.fn(v.errorData,pth,er); pth.splice(-1);}\n }\n ; return er}',
		dependenciesSet: new Set(["te_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const te_WEWIGI = utl.getJIT("te_WEWIGI");
			return function te_iGQesm(v, pth = [], er = []) {
				if (!(typeof v === "object" && v !== null)) {
					utl.err(pth, er, "class");
				} else {
					if (v["mion:isΣrrθr"] !== true)
						utl.err(pth, er, "literal", ["mion:isΣrrθr"]);
					if (typeof v.type !== "string") utl.err(pth, er, "string", ["type"]);
					if (typeof v.message !== "string")
						utl.err(pth, er, "string", ["message"]);
					if (typeof v.name !== "string") utl.err(pth, er, "string", ["name"]);
					if (v.id !== undefined) {
						if (!(Number.isFinite(v.id) || typeof v.id === "string"))
							utl.err(pth, er, "union", ["id"]);
					}
					if (!Number.isFinite(v.statusCode))
						utl.err(pth, er, "number", ["statusCode"]);
					if (typeof v.publicMessage !== "string")
						utl.err(pth, er, "string", ["publicMessage"]);
					if (v.errorData !== undefined) {
						pth.push("errorData");
						te_WEWIGI.fn(v.errorData, pth, er);
						pth.splice(-1);
					}
				}
				return er;
			};
		},
		fn: undefined,
	},
	te_WEWIGI: {
		isNoop: false,
		typeName: "Readonly",
		fnID: "te",
		jitFnHash: "te_WEWIGI",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: " return function te_WEWIGI(v,pth=[],er=[]){\n if (!(typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'))) {\n utl.err(pth,er,\"object\");\n } else {\n \n }\n ; return er}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function te_WEWIGI(v, pth = [], er = []) {
				if (
					!(
						typeof v === "object" &&
						v !== null &&
						!Array.isArray(v) &&
						Object.prototype.toString.call(v) === "[object Object]"
					)
				) {
					utl.err(pth, er, "object");
				} else {
				}
				return er;
			};
		},
		fn: undefined,
	},
	tj_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tj",
		jitFnHash: "tj_iGQesm",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const uErr0 = \"Can not json encode union: item does not belong to the union\"; return function tj_iGQesm(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/} else {throw new Error(uErr0);}} return v}",
		dependenciesSet: new Set(["tj_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			return function tj_iGQesm(v) {
				if (v.id !== undefined) {
					if (Number.isFinite(v.id)) {
						/*noop*/
					} else if (typeof v.id === "string") {
						/*noop*/
					} else {
						throw new Error(uErr0);
					}
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fj",
		jitFnHash: "fj_iGQesm",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index"; return function fj_iGQesm(v){\n if (v.id !== undefined) {\n if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === \'number\') {\n const dec0 = v.id[0]; v.id = v.id[1];\n if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}\n else {throw new Error(uErr0)}\n }\n ;};\n let desFn1 = utl.getDeserializeFn("RpcError");\n if (desFn1) {v = desFn1(v)}\n else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}\n ; return v}',
		dependenciesSet: new Set(["fj_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			return function fj_iGQesm(v) {
				if (v.id !== undefined) {
					if (
						v.id?.length === 2 &&
						Array.isArray(v.id) &&
						typeof v.id[0] === "number"
					) {
						const dec0 = v.id[0];
						v.id = v.id[1];
						if (dec0 === 0) {
							/*noop*/
						} else if (dec0 === 1) {
							/*noop*/
						} else {
							throw new Error(uErr0);
						}
					}
				}
				let desFn1 = utl.getDeserializeFn("RpcError");
				if (desFn1) {
					v = desFn1(v);
				} else if ((desFn1 = utl.getSerializeClass("RpcError"))) {
					v = new desFn1(v);
				}
				return v;
			};
		},
		fn: undefined,
	},
	js_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "js",
		jitFnHash: "js_iGQesm",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not JsonStringify union: item does not belong to the union";\nconst js_WEWIGI = utl.getJIT("js_WEWIGI"); return function js_iGQesm(v){return \'{\'+(v.id === undefined ? \'\' : \'"id":\'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === \'string\') {return utl.asJSONString(v.id)} else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? \'\' : \'"errorData":\'+js_WEWIGI.fn(v.errorData)+",")+"\\"mion:isΣrrθr\\""+\':\'+(v["mion:isΣrrθr"] ? \'true\' : \'false\')+","+\'"type":\'+utl.asJSONString(v.type)+","+\'"message":\'+utl.asJSONString(v.message)+","+\'"name":\'+utl.asJSONString(v.name)+","+\'"statusCode":\'+v.statusCode+","+\'"publicMessage":\'+utl.asJSONString(v.publicMessage)+\'}\'}',
		dependenciesSet: new Set(["js_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr0 =
				"Can not JsonStringify union: item does not belong to the union";
			const js_WEWIGI = utl.getJIT("js_WEWIGI");
			return function js_iGQesm(v) {
				return (
					"{" +
					(v.id === undefined
						? ""
						: '"id":' +
							(function () {
								if (Number.isFinite(v.id)) {
									return v.id;
								} else if (typeof v.id === "string") {
									return utl.asJSONString(v.id);
								} else {
									throw new Error(uErr0);
								}
							})() +
							",") +
					(v.errorData === undefined
						? ""
						: '"errorData":' + js_WEWIGI.fn(v.errorData) + ",") +
					'"mion:isΣrrθr"' +
					":" +
					(v["mion:isΣrrθr"] ? "true" : "false") +
					"," +
					'"type":' +
					utl.asJSONString(v.type) +
					"," +
					'"message":' +
					utl.asJSONString(v.message) +
					"," +
					'"name":' +
					utl.asJSONString(v.name) +
					"," +
					'"statusCode":' +
					v.statusCode +
					"," +
					'"publicMessage":' +
					utl.asJSONString(v.publicMessage) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	tBi_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tBi",
		jitFnHash: "tBi_iGQesm",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr1 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_iGQesm(v,Ser){;Ser.serString(v.type);Ser.serString(v.message);Ser.serString(v.name);Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.serString(v.publicMessage);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === \'string\') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);} else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr1 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
			return function tBi_iGQesm(v, Ser) {
				Ser.serString(v.type);
				Ser.serString(v.message);
				Ser.serString(v.name);
				Ser.view.setFloat64(Ser.index, v.statusCode, 1, (Ser.index += 8));
				Ser.serString(v.publicMessage);
				const bmI0 = Ser.index;
				Ser.view.setUint8(Ser.index++, 0);
				if (v.id !== undefined) {
					if (Number.isFinite(v.id)) {
						Ser.view.setUint8(Ser.index++, 0);
						Ser.view.setFloat64(Ser.index, v.id, 1, (Ser.index += 8));
					} else if (typeof v.id === "string") {
						Ser.view.setUint8(Ser.index++, 1);
						Ser.serString(v.id);
					} else {
						throw new Error(uErr1);
					}
					Ser.setBitMask(bmI0, 0 & 7);
				}
				if (v.errorData !== undefined) {
					tBi_WEWIGI.fn(v.errorData, Ser);
					Ser.setBitMask(bmI0, 1 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	fBi_iGQesm: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fBi",
		jitFnHash: "fBi_iGQesm",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr1 = "Can not binary decode union: invalid union index";\nconst fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_iGQesm(ret,Des){ret = {"mion:isΣrrθr":true,type:Des.desString(),message:Des.desString(),name:Des.desString(),statusCode:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),publicMessage:Des.desString()}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {\n const dec1 = Des.view.getUint8(Des.index++);\n if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}\n else {throw new Error(uErr1)}\n ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}',
		dependenciesSet: new Set(["fBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			const uErr1 = "Can not binary decode union: invalid union index";
			const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
			return function fBi_iGQesm(ret, Des) {
				ret = {
					"mion:isΣrrθr": true,
					type: Des.desString(),
					message: Des.desString(),
					name: Des.desString(),
					statusCode: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
					publicMessage: Des.desString(),
				};

				const bimI0 = Des.index;
				Des.index += 1;
				if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
					const dec1 = Des.view.getUint8(Des.index++);
					if (dec1 === 0) {
						ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8));
					} else if (dec1 === 1) {
						ret.id = Des.desString();
					} else {
						throw new Error(uErr1);
					}
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {
					ret.errorData = fBi_WEWIGI.fn(undefined, Des);
				}
				let desFn0 = utl.getDeserializeFn("RpcError");
				if (desFn0) {
					ret = desFn0(ret);
				} else if ((desFn0 = utl.getSerializeClass("RpcError"))) {
					ret = new desFn0(ret);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	is_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "is",
		jitFnHash: "is_dPDpXF",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function is_dPDpXF(v){return v === undefined}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function is_dPDpXF(v) {
				return v === undefined;
			};
		},
		fn: undefined,
	},
	te_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "te",
		jitFnHash: "te_dPDpXF",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: ' return function te_dPDpXF(v,pth=[],er=[]){if (v !== undefined) utl.err(pth,er,"void"); return er}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function te_dPDpXF(v, pth = [], er = []) {
				if (v !== undefined) utl.err(pth, er, "void");
				return er;
			};
		},
		fn: undefined,
	},
	tj_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "tj",
		jitFnHash: "tj_dPDpXF",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_dPDpXF(v){return v = undefined}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tj_dPDpXF(v) {
				return (v = undefined);
			};
		},
		fn: undefined,
	},
	fj_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "fj",
		jitFnHash: "fj_dPDpXF",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_dPDpXF(v){return v = undefined}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fj_dPDpXF(v) {
				return (v = undefined);
			};
		},
		fn: undefined,
	},
	js_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "js",
		jitFnHash: "js_dPDpXF",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function js_dPDpXF(v){return undefined}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function js_dPDpXF(v) {
				return undefined;
			};
		},
		fn: undefined,
	},
	tBi_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "tBi",
		jitFnHash: "tBi_dPDpXF",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: " return function tBi_dPDpXF(v,Ser){Ser.view.setUint8(Ser.index++, 1); return Ser}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function tBi_dPDpXF(v, Ser) {
				Ser.view.setUint8(Ser.index++, 1);
				return Ser;
			};
		},
		fn: undefined,
	},
	fBi_dPDpXF: {
		isNoop: false,
		typeName: "void",
		fnID: "fBi",
		jitFnHash: "fBi_dPDpXF",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: " return function fBi_dPDpXF(ret,Des){return (Des.index++, undefined)}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		closureFn: function (utl) {
			return function fBi_dPDpXF(ret, Des) {
				return Des.index++, undefined;
			};
		},
		fn: undefined,
	},
};
exports.jitFnsCache = jitFnsCache;

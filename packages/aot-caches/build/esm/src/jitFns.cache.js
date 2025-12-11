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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
	is_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "is",
		jitFnHash: "is_e6YoYA",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_OeGakG = utl.getJIT("is_OeGakG");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T"); return function is_e6YoYA(v){return ((typeof v === \'object\' && v !== null && (is_OeGakG.fn(v) || is_R7hJ5T.fn(v))))}',
		dependenciesSet: new Set(["is_OeGakG", "is_R7hJ5T"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_OeGakG = utl.getJIT("is_OeGakG");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			return function is_e6YoYA(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					(is_OeGakG.fn(v) || is_R7hJ5T.fn(v))
				);
			};
		},
		fn: undefined,
	},
	is_OeGakG: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "is",
		jitFnHash: "is_OeGakG",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_tP7Vvb = utl.getJIT("is_tP7Vvb");\nconst is_EWye4A = utl.getJIT("is_EWye4A");\nconst is_tf5dpV = utl.getJIT("is_tf5dpV"); return function is_OeGakG(v){return (is_tP7Vvb.fn(v.purFnDeps) && is_EWye4A.fn(v.methods) && is_tf5dpV.fn(v.deps))}',
		dependenciesSet: new Set(["is_tP7Vvb", "is_EWye4A", "is_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_tP7Vvb = utl.getJIT("is_tP7Vvb");
			const is_EWye4A = utl.getJIT("is_EWye4A");
			const is_tf5dpV = utl.getJIT("is_tf5dpV");
			return function is_OeGakG(v) {
				return (
					is_tP7Vvb.fn(v.purFnDeps) &&
					is_EWye4A.fn(v.methods) &&
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
		dependenciesSet: new Set(["is_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
	is_EWye4A: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "is",
		jitFnHash: "is_EWye4A",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_H5Jbv1 = utl.getJIT(\"is_H5Jbv1\"); return function is_EWye4A(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_H5Jbv1.fn(v[p0]))) return false;} return true;})())}",
		dependenciesSet: new Set(["is_H5Jbv1"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_H5Jbv1 = utl.getJIT("is_H5Jbv1");
			return function is_EWye4A(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(function () {
						for (const p0 in v) {
							if (!is_H5Jbv1.fn(v[p0])) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_H5Jbv1: {
		isNoop: false,
		typeName: "MethodMetadata",
		fnID: "is",
		jitFnHash: "is_H5Jbv1",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_Ei8qua = utl.getJIT(\"is_Ei8qua\");\nconst is_s8eky2 = utl.getJIT(\"is_s8eky2\"); return function is_H5Jbv1(v){return (typeof v === 'object' && v !== null && Number.isFinite(v.type) && typeof v.id === 'string' && typeof v.isAsync === 'boolean' && typeof v.hasReturnData === 'boolean' && (v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)) && typeof v.paramsJitHash === 'string' && typeof v.returnJitHash === 'string' && (v.headersParam === undefined || is_s8eky2.fn(v.headersParam)) && (v.headersReturn === undefined || is_s8eky2.fn(v.headersReturn)) && (v.hookIds === undefined || is_Ei8qua.fn(v.hookIds)) && is_Ei8qua.fn(v.pointer) && Number.isFinite(v.nestLevel))}",
		dependenciesSet: new Set(["is_Ei8qua", "is_s8eky2"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			const is_s8eky2 = utl.getJIT("is_s8eky2");
			return function is_H5Jbv1(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					Number.isFinite(v.type) &&
					typeof v.id === "string" &&
					typeof v.isAsync === "boolean" &&
					typeof v.hasReturnData === "boolean" &&
					(v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)) &&
					typeof v.paramsJitHash === "string" &&
					typeof v.returnJitHash === "string" &&
					(v.headersParam === undefined || is_s8eky2.fn(v.headersParam)) &&
					(v.headersReturn === undefined || is_s8eky2.fn(v.headersReturn)) &&
					(v.hookIds === undefined || is_Ei8qua.fn(v.hookIds)) &&
					is_Ei8qua.fn(v.pointer) &&
					Number.isFinite(v.nestLevel)
				);
			};
		},
		fn: undefined,
	},
	is_s8eky2: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "is",
		jitFnHash: "is_s8eky2",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_Ei8qua = utl.getJIT(\"is_Ei8qua\"); return function is_s8eky2(v){return (typeof v === 'object' && v !== null && is_Ei8qua.fn(v.headerNames) && typeof v.jitHash === 'string')}",
		dependenciesSet: new Set(["is_Ei8qua"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			return function is_s8eky2(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					is_Ei8qua.fn(v.headerNames) &&
					typeof v.jitHash === "string"
				);
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
		dependenciesSet: new Set(["is_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
	te_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "te",
		jitFnHash: "te_e6YoYA",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const is_OeGakG = utl.getJIT("is_OeGakG");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T"); return function te_e6YoYA(v,pth=[],er=[]){if (!((typeof v === \'object\' && v !== null && (is_OeGakG.fn(v) || is_R7hJ5T.fn(v))))) utl.err(pth,er,"union"); return er}',
		dependenciesSet: new Set(["is_OeGakG", "is_R7hJ5T"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_OeGakG = utl.getJIT("is_OeGakG");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			return function te_e6YoYA(v, pth = [], er = []) {
				if (
					!(
						typeof v === "object" &&
						v !== null &&
						(is_OeGakG.fn(v) || is_R7hJ5T.fn(v))
					)
				)
					utl.err(pth, er, "union");
				return er;
			};
		},
		fn: undefined,
	},
	tj_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "tj",
		jitFnHash: "tj_e6YoYA",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json encode union: item does not belong to the union";\nconst tj_OeGakG = utl.getJIT("tj_OeGakG");\nconst fj_OeGakG = utl.getJIT("fj_OeGakG");\nconst is_OeGakG = utl.getJIT("is_OeGakG");\nconst tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");\nconst fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T"); return function tj_e6YoYA(v){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if (is_OeGakG.fn(v)) {v = tj_OeGakG.fn(v); v = [0, v]}else if (is_R7hJ5T.fn(v)) {v = tj_R7hJ5T.fn(v); v = [1, v]}else {throw new Error(uErr0);} return v}',
		dependenciesSet: new Set([
			"tj_OeGakG",
			"fj_OeGakG",
			"is_OeGakG",
			"tj_R7hJ5T",
			"fj_R7hJ5T",
			"is_R7hJ5T",
		]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			const tj_OeGakG = utl.getJIT("tj_OeGakG");
			const fj_OeGakG = utl.getJIT("fj_OeGakG");
			const is_OeGakG = utl.getJIT("is_OeGakG");
			const tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");
			const fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			return function tj_e6YoYA(v) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_OeGakG.fn(v)) {
					v = tj_OeGakG.fn(v);
					v = [0, v];
				} else if (is_R7hJ5T.fn(v)) {
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
	tj_OeGakG: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "tj",
		jitFnHash: "tj_OeGakG",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_tP7Vvb = utl.getJIT("tj_tP7Vvb");\nconst tj_tf5dpV = utl.getJIT("tj_tf5dpV"); return function tj_OeGakG(v){v.purFnDeps = tj_tP7Vvb.fn(v.purFnDeps);v.deps = tj_tf5dpV.fn(v.deps); return v}',
		dependenciesSet: new Set(["tj_tP7Vvb", "tj_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tj_tP7Vvb = utl.getJIT("tj_tP7Vvb");
			const tj_tf5dpV = utl.getJIT("tj_tf5dpV");
			return function tj_OeGakG(v) {
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
		dependenciesSet: new Set(["tj_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
			return function tj_Ei8qua(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_EWye4A: {
		isNoop: true,
		typeName: "MethodsCache",
		fnID: "tj",
		jitFnHash: "tj_EWye4A",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_EWye4A(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function tj_EWye4A(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_H5Jbv1: {
		isNoop: true,
		typeName: "MethodMetadata",
		fnID: "tj",
		jitFnHash: "tj_H5Jbv1",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_H5Jbv1(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function tj_H5Jbv1(v) {
				return v;
			};
		},
		fn: undefined,
	},
	tj_s8eky2: {
		isNoop: true,
		typeName: "HeadersMetaData",
		fnID: "tj",
		jitFnHash: "tj_s8eky2",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function tj_s8eky2(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function tj_s8eky2(v) {
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
		dependenciesSet: new Set(["tj_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
			return function tj_gCQYSg(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_OeGakG: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "fj",
		jitFnHash: "fj_OeGakG",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_tP7Vvb = utl.getJIT("fj_tP7Vvb");\nconst fj_tf5dpV = utl.getJIT("fj_tf5dpV"); return function fj_OeGakG(v){v.purFnDeps = fj_tP7Vvb.fn(v.purFnDeps);v.deps = fj_tf5dpV.fn(v.deps); return v}',
		dependenciesSet: new Set(["fj_tP7Vvb", "fj_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fj_tP7Vvb = utl.getJIT("fj_tP7Vvb");
			const fj_tf5dpV = utl.getJIT("fj_tf5dpV");
			return function fj_OeGakG(v) {
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
		dependenciesSet: new Set(["fj_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
			return function fj_Ei8qua(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_EWye4A: {
		isNoop: true,
		typeName: "MethodsCache",
		fnID: "fj",
		jitFnHash: "fj_EWye4A",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_EWye4A(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function fj_EWye4A(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_H5Jbv1: {
		isNoop: true,
		typeName: "MethodMetadata",
		fnID: "fj",
		jitFnHash: "fj_H5Jbv1",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_H5Jbv1(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function fj_H5Jbv1(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_s8eky2: {
		isNoop: true,
		typeName: "HeadersMetaData",
		fnID: "fj",
		jitFnHash: "fj_s8eky2",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function fj_s8eky2(v){return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function fj_s8eky2(v) {
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
		dependenciesSet: new Set(["fj_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
			return function fj_WEWIGI(v) {
				return v;
			};
		},
		fn: undefined,
	},
	fj_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "fj",
		jitFnHash: "fj_e6YoYA",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index";\nconst fj_OeGakG = utl.getJIT("fj_OeGakG");\nconst fj_R7hJ5T = utl.getJIT("fj_R7hJ5T"); return function fj_e6YoYA(v){\n if (v?.length === 2 && Array.isArray(v) && typeof v[0] === \'number\') {\n const dec0 = v[0]; v = v[1];\n if (dec0 === 0) {v = fj_OeGakG.fn(v)}else if (dec0 === 1) {v = fj_R7hJ5T.fn(v)}\n else {throw new Error(uErr0)}\n }\n ; return v}',
		dependenciesSet: new Set(["fj_OeGakG", "fj_R7hJ5T"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			const fj_OeGakG = utl.getJIT("fj_OeGakG");
			const fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");
			return function fj_e6YoYA(v) {
				if (v?.length === 2 && Array.isArray(v) && typeof v[0] === "number") {
					const dec0 = v[0];
					v = v[1];
					if (dec0 === 0) {
						v = fj_OeGakG.fn(v);
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
	js_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "js",
		jitFnHash: "js_e6YoYA",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not JsonStringify union: item does not belong to the union";\nconst js_OeGakG = utl.getJIT("js_OeGakG");\nconst tj_OeGakG = utl.getJIT("tj_OeGakG");\nconst fj_OeGakG = utl.getJIT("fj_OeGakG");\nconst is_OeGakG = utl.getJIT("is_OeGakG");\nconst js_R7hJ5T = utl.getJIT("js_R7hJ5T");\nconst tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");\nconst fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T"); return function js_e6YoYA(v){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if (is_OeGakG.fn(v)) {return \'[0,\' + js_OeGakG.fn(v) + \']\'}else if (is_R7hJ5T.fn(v)) {return \'[1,\' + js_R7hJ5T.fn(v) + \']\'}else {throw new Error(uErr0);}}',
		dependenciesSet: new Set([
			"js_OeGakG",
			"tj_OeGakG",
			"fj_OeGakG",
			"is_OeGakG",
			"js_R7hJ5T",
			"tj_R7hJ5T",
			"fj_R7hJ5T",
			"is_R7hJ5T",
		]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not JsonStringify union: item does not belong to the union";
			const js_OeGakG = utl.getJIT("js_OeGakG");
			const tj_OeGakG = utl.getJIT("tj_OeGakG");
			const fj_OeGakG = utl.getJIT("fj_OeGakG");
			const is_OeGakG = utl.getJIT("is_OeGakG");
			const js_R7hJ5T = utl.getJIT("js_R7hJ5T");
			const tj_R7hJ5T = utl.getJIT("tj_R7hJ5T");
			const fj_R7hJ5T = utl.getJIT("fj_R7hJ5T");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			return function js_e6YoYA(v) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_OeGakG.fn(v)) {
					return "[0," + js_OeGakG.fn(v) + "]";
				} else if (is_R7hJ5T.fn(v)) {
					return "[1," + js_R7hJ5T.fn(v) + "]";
				} else {
					throw new Error(uErr0);
				}
			};
		},
		fn: undefined,
	},
	js_OeGakG: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "js",
		jitFnHash: "js_OeGakG",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const js_tP7Vvb = utl.getJIT("js_tP7Vvb");\nconst js_EWye4A = utl.getJIT("js_EWye4A");\nconst js_tf5dpV = utl.getJIT("js_tf5dpV"); return function js_OeGakG(v){return \'{\'+\'"purFnDeps":\'+js_tP7Vvb.fn(v.purFnDeps)+","+\'"methods":\'+js_EWye4A.fn(v.methods)+","+\'"deps":\'+js_tf5dpV.fn(v.deps)+\'}\'}',
		dependenciesSet: new Set(["js_tP7Vvb", "js_EWye4A", "js_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const js_tP7Vvb = utl.getJIT("js_tP7Vvb");
			const js_EWye4A = utl.getJIT("js_EWye4A");
			const js_tf5dpV = utl.getJIT("js_tf5dpV");
			return function js_OeGakG(v) {
				return (
					"{" +
					'"purFnDeps":' +
					js_tP7Vvb.fn(v.purFnDeps) +
					"," +
					'"methods":' +
					js_EWye4A.fn(v.methods) +
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
		dependenciesSet: new Set(["js_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
	js_EWye4A: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "js",
		jitFnHash: "js_EWye4A",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_H5Jbv1 = utl.getJIT(\"js_H5Jbv1\"); return function js_EWye4A(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + js_H5Jbv1.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["js_H5Jbv1"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const js_H5Jbv1 = utl.getJIT("js_H5Jbv1");
			return function js_EWye4A(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + js_H5Jbv1.fn(v[p1]));
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
	js_H5Jbv1: {
		isNoop: false,
		typeName: "MethodMetadata",
		fnID: "js",
		jitFnHash: "js_H5Jbv1",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const js_Ei8qua = utl.getJIT("js_Ei8qua");\nconst js_s8eky2 = utl.getJIT("js_s8eky2"); return function js_H5Jbv1(v){return \'{\'+(v.paramNames === undefined ? \'\' : \'"paramNames":\'+js_Ei8qua.fn(v.paramNames)+",")+(v.headersParam === undefined ? \'\' : \'"headersParam":\'+js_s8eky2.fn(v.headersParam)+",")+(v.headersReturn === undefined ? \'\' : \'"headersReturn":\'+js_s8eky2.fn(v.headersReturn)+",")+(v.hookIds === undefined ? \'\' : \'"hookIds":\'+js_Ei8qua.fn(v.hookIds)+",")+\'"type":\'+v.type+","+\'"id":\'+utl.asJSONString(v.id)+","+\'"isAsync":\'+(v.isAsync ? \'true\' : \'false\')+","+\'"hasReturnData":\'+(v.hasReturnData ? \'true\' : \'false\')+","+\'"paramsJitHash":\'+utl.asJSONString(v.paramsJitHash)+","+\'"returnJitHash":\'+utl.asJSONString(v.returnJitHash)+","+\'"pointer":\'+js_Ei8qua.fn(v.pointer)+","+\'"nestLevel":\'+v.nestLevel+\'}\'}',
		dependenciesSet: new Set(["js_Ei8qua", "js_s8eky2"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			const js_s8eky2 = utl.getJIT("js_s8eky2");
			return function js_H5Jbv1(v) {
				return (
					"{" +
					(v.paramNames === undefined
						? ""
						: '"paramNames":' + js_Ei8qua.fn(v.paramNames) + ",") +
					(v.headersParam === undefined
						? ""
						: '"headersParam":' + js_s8eky2.fn(v.headersParam) + ",") +
					(v.headersReturn === undefined
						? ""
						: '"headersReturn":' + js_s8eky2.fn(v.headersReturn) + ",") +
					(v.hookIds === undefined
						? ""
						: '"hookIds":' + js_Ei8qua.fn(v.hookIds) + ",") +
					'"type":' +
					v.type +
					"," +
					'"id":' +
					utl.asJSONString(v.id) +
					"," +
					'"isAsync":' +
					(v.isAsync ? "true" : "false") +
					"," +
					'"hasReturnData":' +
					(v.hasReturnData ? "true" : "false") +
					"," +
					'"paramsJitHash":' +
					utl.asJSONString(v.paramsJitHash) +
					"," +
					'"returnJitHash":' +
					utl.asJSONString(v.returnJitHash) +
					"," +
					'"pointer":' +
					js_Ei8qua.fn(v.pointer) +
					"," +
					'"nestLevel":' +
					v.nestLevel +
					"}"
				);
			};
		},
		fn: undefined,
	},
	js_s8eky2: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "js",
		jitFnHash: "js_s8eky2",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const js_Ei8qua = utl.getJIT(\"js_Ei8qua\"); return function js_s8eky2(v){return '{'+'\"headerNames\":'+js_Ei8qua.fn(v.headerNames)+\",\"+'\"jitHash\":'+utl.asJSONString(v.jitHash)+'}'}",
		dependenciesSet: new Set(["js_Ei8qua"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const js_Ei8qua = utl.getJIT("js_Ei8qua");
			return function js_s8eky2(v) {
				return (
					"{" +
					'"headerNames":' +
					js_Ei8qua.fn(v.headerNames) +
					"," +
					'"jitHash":' +
					utl.asJSONString(v.jitHash) +
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
		dependenciesSet: new Set(["js_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
	tBi_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "tBi",
		jitFnHash: "tBi_e6YoYA",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr0 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_OeGakG = utl.getJIT("tBi_OeGakG");\nconst is_OeGakG = utl.getJIT("is_OeGakG");\nconst tBi_R7hJ5T = utl.getJIT("tBi_R7hJ5T");\nconst is_R7hJ5T = utl.getJIT("is_R7hJ5T"); return function tBi_e6YoYA(v,Ser){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if (is_OeGakG.fn(v)) {Ser.view.setUint8(Ser.index++, 0);tBi_OeGakG.fn(v,Ser)}else if (is_R7hJ5T.fn(v)) {Ser.view.setUint8(Ser.index++, 1);tBi_R7hJ5T.fn(v,Ser)}else {throw new Error(uErr0);} return Ser}',
		dependenciesSet: new Set([
			"tBi_OeGakG",
			"is_OeGakG",
			"tBi_R7hJ5T",
			"is_R7hJ5T",
		]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_OeGakG = utl.getJIT("tBi_OeGakG");
			const is_OeGakG = utl.getJIT("is_OeGakG");
			const tBi_R7hJ5T = utl.getJIT("tBi_R7hJ5T");
			const is_R7hJ5T = utl.getJIT("is_R7hJ5T");
			return function tBi_e6YoYA(v, Ser) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_OeGakG.fn(v)) {
					Ser.view.setUint8(Ser.index++, 0);
					tBi_OeGakG.fn(v, Ser);
				} else if (is_R7hJ5T.fn(v)) {
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
	tBi_OeGakG: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "tBi",
		jitFnHash: "tBi_OeGakG",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_EWye4A = utl.getJIT("tBi_EWye4A");\nconst tBi_tf5dpV = utl.getJIT("tBi_tf5dpV");\nconst tBi_tP7Vvb = utl.getJIT("tBi_tP7Vvb"); return function tBi_OeGakG(v,Ser){tBi_EWye4A.fn(v.methods,Ser);tBi_tf5dpV.fn(v.deps,Ser);tBi_tP7Vvb.fn(v.purFnDeps,Ser);\n; return Ser}',
		dependenciesSet: new Set(["tBi_EWye4A", "tBi_tf5dpV", "tBi_tP7Vvb"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_EWye4A = utl.getJIT("tBi_EWye4A");
			const tBi_tf5dpV = utl.getJIT("tBi_tf5dpV");
			const tBi_tP7Vvb = utl.getJIT("tBi_tP7Vvb");
			return function tBi_OeGakG(v, Ser) {
				tBi_EWye4A.fn(v.methods, Ser);
				tBi_tf5dpV.fn(v.deps, Ser);
				tBi_tP7Vvb.fn(v.purFnDeps, Ser);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_EWye4A: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "tBi",
		jitFnHash: "tBi_EWye4A",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_H5Jbv1 = utl.getJIT("tBi_H5Jbv1"); return function tBi_EWye4A(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); tBi_H5Jbv1.fn(v[p0],Ser); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}',
		dependenciesSet: new Set(["tBi_H5Jbv1"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_H5Jbv1 = utl.getJIT("tBi_H5Jbv1");
			return function tBi_EWye4A(v, Ser) {
				let cnt0 = 0;
				const piI0 = Ser.index;
				Ser.index += 4;
				for (const p0 in v) {
					Ser.serString(p0);
					tBi_H5Jbv1.fn(v[p0], Ser);
					cnt0++;
				}
				Ser.view.setUint32(piI0, cnt0, 1);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_H5Jbv1: {
		isNoop: false,
		typeName: "MethodMetadata",
		fnID: "tBi",
		jitFnHash: "tBi_H5Jbv1",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");\nconst tBi_s8eky2 = utl.getJIT("tBi_s8eky2"); return function tBi_H5Jbv1(v,Ser){Ser.view.setFloat64(Ser.index,v.type, 1, (Ser.index += 8));Ser.serString(v.id);Ser.view.setUint8(Ser.index++, !!v.isAsync);Ser.view.setUint8(Ser.index++, !!v.hasReturnData);Ser.serString(v.paramsJitHash);Ser.serString(v.returnJitHash);tBi_Ei8qua.fn(v.pointer,Ser);Ser.view.setFloat64(Ser.index,v.nestLevel, 1, (Ser.index += 8));\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.paramNames !== undefined) {tBi_Ei8qua.fn(v.paramNames,Ser);Ser.setBitMask(bmI0, 0 & 7)}if (v.headersParam !== undefined) {tBi_s8eky2.fn(v.headersParam,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.headersReturn !== undefined) {tBi_s8eky2.fn(v.headersReturn,Ser);Ser.setBitMask(bmI0, 2 & 7)}if (v.hookIds !== undefined) {tBi_Ei8qua.fn(v.hookIds,Ser);Ser.setBitMask(bmI0, 3 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_Ei8qua", "tBi_s8eky2"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			const tBi_s8eky2 = utl.getJIT("tBi_s8eky2");
			return function tBi_H5Jbv1(v, Ser) {
				Ser.view.setFloat64(Ser.index, v.type, 1, (Ser.index += 8));
				Ser.serString(v.id);
				Ser.view.setUint8(Ser.index++, !!v.isAsync);
				Ser.view.setUint8(Ser.index++, !!v.hasReturnData);
				Ser.serString(v.paramsJitHash);
				Ser.serString(v.returnJitHash);
				tBi_Ei8qua.fn(v.pointer, Ser);
				Ser.view.setFloat64(Ser.index, v.nestLevel, 1, (Ser.index += 8));
				const bmI0 = Ser.index;
				Ser.view.setUint8(Ser.index++, 0);
				if (v.paramNames !== undefined) {
					tBi_Ei8qua.fn(v.paramNames, Ser);
					Ser.setBitMask(bmI0, 0 & 7);
				}
				if (v.headersParam !== undefined) {
					tBi_s8eky2.fn(v.headersParam, Ser);
					Ser.setBitMask(bmI0, 1 & 7);
				}
				if (v.headersReturn !== undefined) {
					tBi_s8eky2.fn(v.headersReturn, Ser);
					Ser.setBitMask(bmI0, 2 & 7);
				}
				if (v.hookIds !== undefined) {
					tBi_Ei8qua.fn(v.hookIds, Ser);
					Ser.setBitMask(bmI0, 3 & 7);
				}
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
		createJitFn: function (utl) {
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
	tBi_s8eky2: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "tBi",
		jitFnHash: "tBi_s8eky2",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua"); return function tBi_s8eky2(v,Ser){tBi_Ei8qua.fn(v.headerNames,Ser);Ser.serString(v.jitHash);\n; return Ser}',
		dependenciesSet: new Set(["tBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			return function tBi_s8eky2(v, Ser) {
				tBi_Ei8qua.fn(v.headerNames, Ser);
				Ser.serString(v.jitHash);
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
		dependenciesSet: new Set(["tBi_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(["tBi_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
	fBi_e6YoYA: {
		isNoop: false,
		typeName: "union",
		fnID: "fBi",
		jitFnHash: "fBi_e6YoYA",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr0 = "Can not binary decode union: invalid union index";\nconst fBi_OeGakG = utl.getJIT("fBi_OeGakG");\nconst fBi_R7hJ5T = utl.getJIT("fBi_R7hJ5T"); return function fBi_e6YoYA(ret,Des){\n const dec0 = Des.view.getUint8(Des.index++);\n if (dec0 === 0) {ret = fBi_OeGakG.fn(undefined,Des)}else if (dec0 === 1) {ret = fBi_R7hJ5T.fn(undefined,Des)}\n else {throw new Error(uErr0)}\n ; return ret}',
		dependenciesSet: new Set(["fBi_OeGakG", "fBi_R7hJ5T"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not binary decode union: invalid union index";
			const fBi_OeGakG = utl.getJIT("fBi_OeGakG");
			const fBi_R7hJ5T = utl.getJIT("fBi_R7hJ5T");
			return function fBi_e6YoYA(ret, Des) {
				const dec0 = Des.view.getUint8(Des.index++);
				if (dec0 === 0) {
					ret = fBi_OeGakG.fn(undefined, Des);
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
	fBi_OeGakG: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "fBi",
		jitFnHash: "fBi_OeGakG",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_EWye4A = utl.getJIT("fBi_EWye4A");\nconst fBi_tf5dpV = utl.getJIT("fBi_tf5dpV");\nconst fBi_tP7Vvb = utl.getJIT("fBi_tP7Vvb"); return function fBi_OeGakG(ret,Des){return {methods:fBi_EWye4A.fn(undefined,Des),deps:fBi_tf5dpV.fn(undefined,Des),purFnDeps:fBi_tP7Vvb.fn(undefined,Des)}}',
		dependenciesSet: new Set(["fBi_EWye4A", "fBi_tf5dpV", "fBi_tP7Vvb"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_EWye4A = utl.getJIT("fBi_EWye4A");
			const fBi_tf5dpV = utl.getJIT("fBi_tf5dpV");
			const fBi_tP7Vvb = utl.getJIT("fBi_tP7Vvb");
			return function fBi_OeGakG(ret, Des) {
				return {
					methods: fBi_EWye4A.fn(undefined, Des),
					deps: fBi_tf5dpV.fn(undefined, Des),
					purFnDeps: fBi_tP7Vvb.fn(undefined, Des),
				};
			};
		},
		fn: undefined,
	},
	fBi_EWye4A: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "fBi",
		jitFnHash: "fBi_EWye4A",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_H5Jbv1 = utl.getJIT("fBi_H5Jbv1"); return function fBi_EWye4A(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_H5Jbv1.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_H5Jbv1"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_H5Jbv1 = utl.getJIT("fBi_H5Jbv1");
			return function fBi_EWye4A(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desSafePropName();
					ret[p0] = fBi_H5Jbv1.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_H5Jbv1: {
		isNoop: false,
		typeName: "MethodMetadata",
		fnID: "fBi",
		jitFnHash: "fBi_H5Jbv1",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");\nconst fBi_s8eky2 = utl.getJIT("fBi_s8eky2"); return function fBi_H5Jbv1(ret,Des){ret = {type:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),id:Des.desString(),isAsync:Des.view.getUint8(Des.index++) === 1,hasReturnData:Des.view.getUint8(Des.index++) === 1,paramsJitHash:Des.desString(),returnJitHash:Des.desString(),pointer:fBi_Ei8qua.fn(undefined,Des),nestLevel:Des.view.getFloat64(Des.index, 1, (Des.index += 8))}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.paramNames = fBi_Ei8qua.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.headersParam = fBi_s8eky2.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.headersReturn = fBi_s8eky2.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {ret.hookIds = fBi_Ei8qua.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_Ei8qua", "fBi_s8eky2"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			const fBi_s8eky2 = utl.getJIT("fBi_s8eky2");
			return function fBi_H5Jbv1(ret, Des) {
				ret = {
					type: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
					id: Des.desString(),
					isAsync: Des.view.getUint8(Des.index++) === 1,
					hasReturnData: Des.view.getUint8(Des.index++) === 1,
					paramsJitHash: Des.desString(),
					returnJitHash: Des.desString(),
					pointer: fBi_Ei8qua.fn(undefined, Des),
					nestLevel: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
				};

				const bimI0 = Des.index;
				Des.index += 1;
				if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
					ret.paramNames = fBi_Ei8qua.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {
					ret.headersParam = fBi_s8eky2.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {
					ret.headersReturn = fBi_s8eky2.fn(undefined, Des);
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {
					ret.hookIds = fBi_Ei8qua.fn(undefined, Des);
				}
				return ret;
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
		createJitFn: function (utl) {
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
	fBi_s8eky2: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "fBi",
		jitFnHash: "fBi_s8eky2",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua"); return function fBi_s8eky2(ret,Des){return {headerNames:fBi_Ei8qua.fn(undefined,Des),jitHash:Des.desString()}}',
		dependenciesSet: new Set(["fBi_Ei8qua"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			return function fBi_s8eky2(ret, Des) {
				return {
					headerNames: fBi_Ei8qua.fn(undefined, Des),
					jitHash: Des.desString(),
				};
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
		code: 'const fBi_EmCqyw = utl.getJIT("fBi_EmCqyw"); return function fBi_tf5dpV(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_EmCqyw.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_EmCqyw = utl.getJIT("fBi_EmCqyw");
			return function fBi_tf5dpV(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desSafePropName();
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
		createJitFn: function (utl) {
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
		code: " return function fBi_gCQYSg(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = Des.desString();} return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		code: 'const fBi_cE6uKo = utl.getJIT("fBi_cE6uKo"); return function fBi_tP7Vvb(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_cE6uKo.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_cE6uKo = utl.getJIT("fBi_cE6uKo");
			return function fBi_tP7Vvb(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desSafePropName();
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		code: " return function fBi_WEWIGI(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = JSON.parse(Des.desString());} return ret}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
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
		createJitFn: function (utl) {
			return function fBi_dPDpXF(ret, Des) {
				return Des.index++, undefined;
			};
		},
		fn: undefined,
	},
};
export { jitFnsCache };

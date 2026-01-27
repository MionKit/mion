const jitFnsCache = {
	is_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "is",
		jitFnHash: "is_cm6MsK",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_zxRrbt = utl.getJIT(\"is_zxRrbt\"); return function is_cm6MsK(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_zxRrbt.fn(v[p0]))) return false;} return true;})())}",
		dependenciesSet: new Set(["is_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_zxRrbt = utl.getJIT("is_zxRrbt");
			return function is_cm6MsK(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(function () {
						for (const p0 in v) {
							if (!is_zxRrbt.fn(v[p0])) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "is",
		jitFnHash: "is_zxRrbt",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_WEWIGI = utl.getJIT(\"is_WEWIGI\"); return function is_zxRrbt(v){return (typeof v === 'object' && v !== null && v[\"mion@isΣrrθr\"] === true && typeof v.type === 'string' && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && typeof v.publicMessage === 'string' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)) && (v.statusCode === undefined || Number.isFinite(v.statusCode)))}",
		dependenciesSet: new Set(["is_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_WEWIGI = utl.getJIT("is_WEWIGI");
			return function is_zxRrbt(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					v["mion@isΣrrθr"] === true &&
					typeof v.type === "string" &&
					(v.id === undefined ||
						Number.isFinite(v.id) ||
						typeof v.id === "string") &&
					typeof v.publicMessage === "string" &&
					(v.errorData === undefined || is_WEWIGI.fn(v.errorData)) &&
					(v.statusCode === undefined || Number.isFinite(v.statusCode))
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
	te_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "te",
		jitFnHash: "te_cm6MsK",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: "const te_zxRrbt = utl.getJIT(\"te_zxRrbt\"); return function te_cm6MsK(v,pth=[],er=[]){\n if (!(typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'))) {\n utl.err(pth,er,\"object\");\n } else {\n for (const p0 in v) {pth.push(p0); te_zxRrbt.fn(v[p0],pth,er); pth.splice(-1);}\n }\n ; return er}",
		dependenciesSet: new Set(["te_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const te_zxRrbt = utl.getJIT("te_zxRrbt");
			return function te_cm6MsK(v, pth = [], er = []) {
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
					for (const p0 in v) {
						pth.push(p0);
						te_zxRrbt.fn(v[p0], pth, er);
						pth.splice(-1);
					}
				}
				return er;
			};
		},
		fn: undefined,
	},
	te_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "te",
		jitFnHash: "te_zxRrbt",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const te_WEWIGI = utl.getJIT("te_WEWIGI"); return function te_zxRrbt(v,pth=[],er=[]){\n if (!(typeof v === \'object\' && v !== null)) {\n utl.err(pth,er,"class");\n } else {\n if (v["mion@isΣrrθr"] !== true) utl.err(pth,er,"literal",["mion@isΣrrθr"]);if (typeof v.type !== \'string\') utl.err(pth,er,"string",["type"]);if (v.id !== undefined) {if (!(Number.isFinite(v.id) || typeof v.id === \'string\')) utl.err(pth,er,"union",["id"]);};if (typeof v.publicMessage !== \'string\') utl.err(pth,er,"string",["publicMessage"]);if (v.errorData !== undefined) {pth.push("errorData"); te_WEWIGI.fn(v.errorData,pth,er); pth.splice(-1);};if (v.statusCode !== undefined) {if(!(Number.isFinite(v.statusCode))) utl.err(pth,er,"number",["statusCode"]);}\n }\n ; return er}',
		dependenciesSet: new Set(["te_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const te_WEWIGI = utl.getJIT("te_WEWIGI");
			return function te_zxRrbt(v, pth = [], er = []) {
				if (!(typeof v === "object" && v !== null)) {
					utl.err(pth, er, "class");
				} else {
					if (v["mion@isΣrrθr"] !== true)
						utl.err(pth, er, "literal", ["mion@isΣrrθr"]);
					if (typeof v.type !== "string") utl.err(pth, er, "string", ["type"]);
					if (v.id !== undefined) {
						if (!(Number.isFinite(v.id) || typeof v.id === "string"))
							utl.err(pth, er, "union", ["id"]);
					}
					if (typeof v.publicMessage !== "string")
						utl.err(pth, er, "string", ["publicMessage"]);
					if (v.errorData !== undefined) {
						pth.push("errorData");
						te_WEWIGI.fn(v.errorData, pth, er);
						pth.splice(-1);
					}
					if (v.statusCode !== undefined) {
						if (!Number.isFinite(v.statusCode))
							utl.err(pth, er, "number", ["statusCode"]);
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
	tj_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "tj",
		jitFnHash: "tj_cm6MsK",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_zxRrbt = utl.getJIT("tj_zxRrbt"); return function tj_cm6MsK(v){for (const p0 in v){ v[p0] = tj_zxRrbt.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["tj_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tj_zxRrbt = utl.getJIT("tj_zxRrbt");
			return function tj_cm6MsK(v) {
				for (const p0 in v) {
					v[p0] = tj_zxRrbt.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tj",
		jitFnHash: "tj_zxRrbt",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const uErr0 = \"Can not json encode union: item does not belong to the union\"; return function tj_zxRrbt(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/} else {throw new Error(uErr0);}} return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			return function tj_zxRrbt(v) {
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
	fj_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "fj",
		jitFnHash: "fj_cm6MsK",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_zxRrbt = utl.getJIT("fj_zxRrbt"); return function fj_cm6MsK(v){for (const p0 in v){ v[p0] = fj_zxRrbt.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["fj_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fj_zxRrbt = utl.getJIT("fj_zxRrbt");
			return function fj_cm6MsK(v) {
				for (const p0 in v) {
					v[p0] = fj_zxRrbt.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fj",
		jitFnHash: "fj_zxRrbt",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index"; return function fj_zxRrbt(v){\n if (v.id !== undefined) {\n if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === \'number\') {\n const dec0 = v.id[0]; v.id = v.id[1];\n if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}\n else {throw new Error(uErr0)}\n }\n ;};\n let desFn1 = utl.getDeserializeFn("RpcError");\n if (desFn1) {v = desFn1(v)}\n else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}\n ; return v}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			return function fj_zxRrbt(v) {
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
	sj_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "sj",
		jitFnHash: "sj_cm6MsK",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_zxRrbt = utl.getJIT(\"sj_zxRrbt\"); return function sj_cm6MsK(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + sj_zxRrbt.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["sj_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_zxRrbt = utl.getJIT("sj_zxRrbt");
			return function sj_cm6MsK(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + sj_zxRrbt.fn(v[p1]));
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
	sj_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "sj",
		jitFnHash: "sj_zxRrbt",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not StringifyJson union: item does not belong to the union";\nconst sj_WEWIGI = utl.getJIT("sj_WEWIGI"); return function sj_zxRrbt(v){return \'{\'+(v.id === undefined ? \'\' : \'"id":\'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === \'string\') {return utl.asJSONString(v.id)} else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? \'\' : \'"errorData":\'+sj_WEWIGI.fn(v.errorData)+",")+(v.statusCode === undefined ? \'\' : \'"statusCode":\'+v.statusCode+",")+"\\"mion@isΣrrθr\\""+\':\'+(v["mion@isΣrrθr"] ? \'true\' : \'false\')+","+\'"type":\'+utl.asJSONString(v.type)+","+\'"publicMessage":\'+utl.asJSONString(v.publicMessage)+\'}\'}',
		dependenciesSet: new Set(["sj_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not StringifyJson union: item does not belong to the union";
			const sj_WEWIGI = utl.getJIT("sj_WEWIGI");
			return function sj_zxRrbt(v) {
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
						: '"errorData":' + sj_WEWIGI.fn(v.errorData) + ",") +
					(v.statusCode === undefined
						? ""
						: '"statusCode":' + v.statusCode + ",") +
					'"mion@isΣrrθr"' +
					":" +
					(v["mion@isΣrrθr"] ? "true" : "false") +
					"," +
					'"type":' +
					utl.asJSONString(v.type) +
					"," +
					'"publicMessage":' +
					utl.asJSONString(v.publicMessage) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	sj_WEWIGI: {
		isNoop: false,
		typeName: "Readonly",
		fnID: "sj",
		jitFnHash: "sj_WEWIGI",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function sj_WEWIGI(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + JSON.stringify(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function sj_WEWIGI(v) {
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
	tBi_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "tBi",
		jitFnHash: "tBi_cm6MsK",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_zxRrbt = utl.getJIT("tBi_zxRrbt"); return function tBi_cm6MsK(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); tBi_zxRrbt.fn(v[p0],Ser); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}',
		dependenciesSet: new Set(["tBi_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		},
		fn: undefined,
	},
	tBi_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tBi",
		jitFnHash: "tBi_zxRrbt",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr1 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_zxRrbt(v,Ser){;Ser.serString(v.type);Ser.serString(v.publicMessage);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === \'string\') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);} else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.statusCode !== undefined) {Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.setBitMask(bmI0, 2 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr1 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
			return function tBi_zxRrbt(v, Ser) {
				Ser.serString(v.type);
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
				if (v.statusCode !== undefined) {
					Ser.view.setFloat64(Ser.index, v.statusCode, 1, (Ser.index += 8));
					Ser.setBitMask(bmI0, 2 & 7);
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
	fBi_cm6MsK: {
		isNoop: false,
		typeName: "Record",
		fnID: "fBi",
		jitFnHash: "fBi_cm6MsK",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_zxRrbt = utl.getJIT("fBi_zxRrbt"); return function fBi_cm6MsK(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_zxRrbt.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_zxRrbt"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_zxRrbt = utl.getJIT("fBi_zxRrbt");
			return function fBi_cm6MsK(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desSafePropName();
					ret[p0] = fBi_zxRrbt.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_zxRrbt: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fBi",
		jitFnHash: "fBi_zxRrbt",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr1 = "Can not binary decode union: invalid union index";\nconst fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_zxRrbt(ret,Des){ret = {"mion@isΣrrθr":true,type:Des.desString(),publicMessage:Des.desString()}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {\n const dec1 = Des.view.getUint8(Des.index++);\n if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}\n else {throw new Error(uErr1)}\n ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}',
		dependenciesSet: new Set(["fBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr1 = "Can not binary decode union: invalid union index";
			const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
			return function fBi_zxRrbt(ret, Des) {
				ret = {
					"mion@isΣrrθr": true,
					type: Des.desString(),
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
				if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {
					ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));
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
	is_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "is",
		jitFnHash: "is_a8UQwC",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_WEWIGI = utl.getJIT(\"is_WEWIGI\"); return function is_a8UQwC(v){return (typeof v === 'object' && v !== null && v[\"mion@isΣrrθr\"] === true && v.type === \"route-not-found\" && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === 'string')) && typeof v.publicMessage === 'string' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)) && (v.statusCode === undefined || Number.isFinite(v.statusCode)))}",
		dependenciesSet: new Set(["is_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_WEWIGI = utl.getJIT("is_WEWIGI");
			return function is_a8UQwC(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					v["mion@isΣrrθr"] === true &&
					v.type === "route-not-found" &&
					(v.id === undefined ||
						Number.isFinite(v.id) ||
						typeof v.id === "string") &&
					typeof v.publicMessage === "string" &&
					(v.errorData === undefined || is_WEWIGI.fn(v.errorData)) &&
					(v.statusCode === undefined || Number.isFinite(v.statusCode))
				);
			};
		},
		fn: undefined,
	},
	te_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "te",
		jitFnHash: "te_a8UQwC",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const te_WEWIGI = utl.getJIT("te_WEWIGI"); return function te_a8UQwC(v,pth=[],er=[]){\n if (!(typeof v === \'object\' && v !== null)) {\n utl.err(pth,er,"class");\n } else {\n if (v["mion@isΣrrθr"] !== true) utl.err(pth,er,"literal",["mion@isΣrrθr"]);if (v.type !== "route-not-found") utl.err(pth,er,"literal",["type"]);if (v.id !== undefined) {if (!(Number.isFinite(v.id) || typeof v.id === \'string\')) utl.err(pth,er,"union",["id"]);};if (typeof v.publicMessage !== \'string\') utl.err(pth,er,"string",["publicMessage"]);if (v.errorData !== undefined) {pth.push("errorData"); te_WEWIGI.fn(v.errorData,pth,er); pth.splice(-1);};if (v.statusCode !== undefined) {if(!(Number.isFinite(v.statusCode))) utl.err(pth,er,"number",["statusCode"]);}\n }\n ; return er}',
		dependenciesSet: new Set(["te_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const te_WEWIGI = utl.getJIT("te_WEWIGI");
			return function te_a8UQwC(v, pth = [], er = []) {
				if (!(typeof v === "object" && v !== null)) {
					utl.err(pth, er, "class");
				} else {
					if (v["mion@isΣrrθr"] !== true)
						utl.err(pth, er, "literal", ["mion@isΣrrθr"]);
					if (v.type !== "route-not-found")
						utl.err(pth, er, "literal", ["type"]);
					if (v.id !== undefined) {
						if (!(Number.isFinite(v.id) || typeof v.id === "string"))
							utl.err(pth, er, "union", ["id"]);
					}
					if (typeof v.publicMessage !== "string")
						utl.err(pth, er, "string", ["publicMessage"]);
					if (v.errorData !== undefined) {
						pth.push("errorData");
						te_WEWIGI.fn(v.errorData, pth, er);
						pth.splice(-1);
					}
					if (v.statusCode !== undefined) {
						if (!Number.isFinite(v.statusCode))
							utl.err(pth, er, "number", ["statusCode"]);
					}
				}
				return er;
			};
		},
		fn: undefined,
	},
	tj_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tj",
		jitFnHash: "tj_a8UQwC",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const uErr0 = \"Can not json encode union: item does not belong to the union\"; return function tj_a8UQwC(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/} else {throw new Error(uErr0);}} return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			return function tj_a8UQwC(v) {
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
	fj_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fj",
		jitFnHash: "fj_a8UQwC",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index"; return function fj_a8UQwC(v){\n if (v.id !== undefined) {\n if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === \'number\') {\n const dec0 = v.id[0]; v.id = v.id[1];\n if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}\n else {throw new Error(uErr0)}\n }\n ;};\n let desFn1 = utl.getDeserializeFn("RpcError");\n if (desFn1) {v = desFn1(v)}\n else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}\n ; return v}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			return function fj_a8UQwC(v) {
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
	sj_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "sj",
		jitFnHash: "sj_a8UQwC",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not StringifyJson union: item does not belong to the union";\nconst sj_WEWIGI = utl.getJIT("sj_WEWIGI"); return function sj_a8UQwC(v){return \'{\'+(v.id === undefined ? \'\' : \'"id":\'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === \'string\') {return utl.asJSONString(v.id)} else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? \'\' : \'"errorData":\'+sj_WEWIGI.fn(v.errorData)+",")+(v.statusCode === undefined ? \'\' : \'"statusCode":\'+v.statusCode+",")+"\\"mion@isΣrrθr\\""+\':\'+(v["mion@isΣrrθr"] ? \'true\' : \'false\')+","+\'"type":\'+utl.asJSONString(v.type)+","+\'"publicMessage":\'+utl.asJSONString(v.publicMessage)+\'}\'}',
		dependenciesSet: new Set(["sj_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not StringifyJson union: item does not belong to the union";
			const sj_WEWIGI = utl.getJIT("sj_WEWIGI");
			return function sj_a8UQwC(v) {
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
						: '"errorData":' + sj_WEWIGI.fn(v.errorData) + ",") +
					(v.statusCode === undefined
						? ""
						: '"statusCode":' + v.statusCode + ",") +
					'"mion@isΣrrθr"' +
					":" +
					(v["mion@isΣrrθr"] ? "true" : "false") +
					"," +
					'"type":' +
					utl.asJSONString(v.type) +
					"," +
					'"publicMessage":' +
					utl.asJSONString(v.publicMessage) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	tBi_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tBi",
		jitFnHash: "tBi_a8UQwC",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr1 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_a8UQwC(v,Ser){;Ser.serString(v.publicMessage);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === \'string\') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);} else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.statusCode !== undefined) {Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.setBitMask(bmI0, 2 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr1 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
			return function tBi_a8UQwC(v, Ser) {
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
				if (v.statusCode !== undefined) {
					Ser.view.setFloat64(Ser.index, v.statusCode, 1, (Ser.index += 8));
					Ser.setBitMask(bmI0, 2 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	fBi_a8UQwC: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fBi",
		jitFnHash: "fBi_a8UQwC",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr1 = "Can not binary decode union: invalid union index";\nconst fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_a8UQwC(ret,Des){ret = {"mion@isΣrrθr":true,type:"route-not-found",publicMessage:Des.desString()}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {\n const dec1 = Des.view.getUint8(Des.index++);\n if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}\n else {throw new Error(uErr1)}\n ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}',
		dependenciesSet: new Set(["fBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr1 = "Can not binary decode union: invalid union index";
			const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
			return function fBi_a8UQwC(ret, Des) {
				ret = {
					"mion@isΣrrθr": true,
					type: "route-not-found",
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
				if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {
					ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));
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
	sj_JtnVhp: {
		isNoop: false,
		typeName: "params",
		fnID: "sj",
		jitFnHash: "sj_JtnVhp",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_b1N57x = utl.getJIT(\"sj_b1N57x\"); return function sj_JtnVhp(v){return '['+sj_b1N57x.fn(v[0])+(v[1] === undefined ? ','+'null' : ','+(v[1] ? 'true' : 'false'))+']'}",
		dependenciesSet: new Set(["sj_b1N57x"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_b1N57x = utl.getJIT("sj_b1N57x");
			return function sj_JtnVhp(v) {
				return (
					"[" +
					sj_b1N57x.fn(v[0]) +
					(v[1] === undefined
						? "," + "null"
						: "," + (v[1] ? "true" : "false")) +
					"]"
				);
			};
		},
		fn: undefined,
	},
	sj_b1N57x: {
		isNoop: false,
		typeName: "array",
		fnID: "sj",
		jitFnHash: "sj_b1N57x",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function sj_b1N57x(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = utl.asJSONString(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function sj_b1N57x(v) {
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
	is_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "is",
		jitFnHash: "is_uC6waY",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_tzFL7v = utl.getJIT("is_tzFL7v");\nconst is_OQaagS = utl.getJIT("is_OQaagS"); return function is_uC6waY(v){return ((typeof v === \'object\' && v !== null && (is_tzFL7v.fn(v) || is_OQaagS.fn(v))))}',
		dependenciesSet: new Set(["is_tzFL7v", "is_OQaagS"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_tzFL7v = utl.getJIT("is_tzFL7v");
			const is_OQaagS = utl.getJIT("is_OQaagS");
			return function is_uC6waY(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					(is_tzFL7v.fn(v) || is_OQaagS.fn(v))
				);
			};
		},
		fn: undefined,
	},
	is_tzFL7v: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "is",
		jitFnHash: "is_tzFL7v",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_tP7Vvb = utl.getJIT("is_tP7Vvb");\nconst is_TZrLNn = utl.getJIT("is_TZrLNn");\nconst is_tf5dpV = utl.getJIT("is_tf5dpV"); return function is_tzFL7v(v){return (is_tP7Vvb.fn(v.purFnDeps) && is_TZrLNn.fn(v.methods) && is_tf5dpV.fn(v.deps))}',
		dependenciesSet: new Set(["is_tP7Vvb", "is_TZrLNn", "is_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_tP7Vvb = utl.getJIT("is_tP7Vvb");
			const is_TZrLNn = utl.getJIT("is_TZrLNn");
			const is_tf5dpV = utl.getJIT("is_tf5dpV");
			return function is_tzFL7v(v) {
				return (
					is_tP7Vvb.fn(v.purFnDeps) &&
					is_TZrLNn.fn(v.methods) &&
					is_tf5dpV.fn(v.deps)
				);
			};
		},
		fn: undefined,
	},
	is_tP7Vvb: {
		isNoop: false,
		typeName: "PureFnsDataCache",
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
	is_TZrLNn: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "is",
		jitFnHash: "is_TZrLNn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_ecqqc8 = utl.getJIT(\"is_ecqqc8\"); return function is_TZrLNn(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (function(){for (const p0 in v){if (!(is_ecqqc8.fn(v[p0]))) return false;} return true;})())}",
		dependenciesSet: new Set(["is_ecqqc8"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_ecqqc8 = utl.getJIT("is_ecqqc8");
			return function is_TZrLNn(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(function () {
						for (const p0 in v) {
							if (!is_ecqqc8.fn(v[p0])) return false;
						}
						return true;
					})()
				);
			};
		},
		fn: undefined,
	},
	is_ecqqc8: {
		isNoop: false,
		typeName: "MethodWithOptions",
		fnID: "is",
		jitFnHash: "is_ecqqc8",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_Ei8qua = utl.getJIT(\"is_Ei8qua\");\nconst is_s8eky2 = utl.getJIT(\"is_s8eky2\");\nconst is_VJxRzx = utl.getJIT(\"is_VJxRzx\"); return function is_ecqqc8(v){return (typeof v === 'object' && v !== null && Number.isFinite(v.type) && typeof v.id === 'string' && typeof v.isAsync === 'boolean' && typeof v.hasReturnData === 'boolean' && (v.paramNames === undefined || is_Ei8qua.fn(v.paramNames)) && typeof v.paramsJitHash === 'string' && typeof v.returnJitHash === 'string' && (v.headersParam === undefined || is_s8eky2.fn(v.headersParam)) && (v.headersReturn === undefined || is_s8eky2.fn(v.headersReturn)) && (v.linkedFnIds === undefined || is_Ei8qua.fn(v.linkedFnIds)) && is_Ei8qua.fn(v.pointer) && Number.isFinite(v.nestLevel) && is_VJxRzx.fn(v.options))}",
		dependenciesSet: new Set(["is_Ei8qua", "is_s8eky2", "is_VJxRzx"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_Ei8qua = utl.getJIT("is_Ei8qua");
			const is_s8eky2 = utl.getJIT("is_s8eky2");
			const is_VJxRzx = utl.getJIT("is_VJxRzx");
			return function is_ecqqc8(v) {
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
					(v.linkedFnIds === undefined || is_Ei8qua.fn(v.linkedFnIds)) &&
					is_Ei8qua.fn(v.pointer) &&
					Number.isFinite(v.nestLevel) &&
					is_VJxRzx.fn(v.options)
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
	is_VJxRzx: {
		isNoop: false,
		typeName: "RemoteMethodOpts",
		fnID: "is",
		jitFnHash: "is_VJxRzx",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const is_hxdrPr = utl.getJIT(\"is_hxdrPr\"); return function is_VJxRzx(v){return (typeof v === 'object' && v !== null && (!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]') && (v.runOnError === undefined || typeof v.runOnError === 'boolean') && (v.validateParams === undefined || typeof v.validateParams === 'boolean') && (v.validateReturn === undefined || typeof v.validateReturn === 'boolean') && (v.description === undefined || typeof v.description === 'string') && (v.serializer === undefined || is_hxdrPr.fn(v.serializer)))}",
		dependenciesSet: new Set(["is_hxdrPr"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_hxdrPr = utl.getJIT("is_hxdrPr");
			return function is_VJxRzx(v) {
				return (
					typeof v === "object" &&
					v !== null &&
					!Array.isArray(v) &&
					Object.prototype.toString.call(v) === "[object Object]" &&
					(v.runOnError === undefined || typeof v.runOnError === "boolean") &&
					(v.validateParams === undefined ||
						typeof v.validateParams === "boolean") &&
					(v.validateReturn === undefined ||
						typeof v.validateReturn === "boolean") &&
					(v.description === undefined || typeof v.description === "string") &&
					(v.serializer === undefined || is_hxdrPr.fn(v.serializer))
				);
			};
		},
		fn: undefined,
	},
	is_hxdrPr: {
		isNoop: false,
		typeName: "SerializerMode",
		fnID: "is",
		jitFnHash: "is_hxdrPr",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: ' return function is_hxdrPr(v){return (v === "json" || v === "binary" || v === "stringifyJson")}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function is_hxdrPr(v) {
				return v === "json" || v === "binary" || v === "stringifyJson";
			};
		},
		fn: undefined,
	},
	is_tf5dpV: {
		isNoop: false,
		typeName: "FnsDataCache",
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
	is_OQaagS: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "is",
		jitFnHash: "is_OQaagS",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const is_WEWIGI = utl.getJIT("is_WEWIGI"); return function is_OQaagS(v){return ((v.statusCode === undefined || Number.isFinite(v.statusCode)) && v["mion@isΣrrθr"] === true && v.type === "rpc-metadata-not-found" && (v.id === undefined || (Number.isFinite(v.id) || typeof v.id === \'string\')) && typeof v.publicMessage === \'string\' && (v.errorData === undefined || is_WEWIGI.fn(v.errorData)))}',
		dependenciesSet: new Set(["is_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_WEWIGI = utl.getJIT("is_WEWIGI");
			return function is_OQaagS(v) {
				return (
					(v.statusCode === undefined || Number.isFinite(v.statusCode)) &&
					v["mion@isΣrrθr"] === true &&
					v.type === "rpc-metadata-not-found" &&
					(v.id === undefined ||
						Number.isFinite(v.id) ||
						typeof v.id === "string") &&
					typeof v.publicMessage === "string" &&
					(v.errorData === undefined || is_WEWIGI.fn(v.errorData))
				);
			};
		},
		fn: undefined,
	},
	te_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "te",
		jitFnHash: "te_uC6waY",
		args: { pλth: "pth", εrr: "er", vλl: "v" },
		defaultParamValues: { pλth: "[]", εrr: "[]", vλl: "" },
		code: 'const is_tzFL7v = utl.getJIT("is_tzFL7v");\nconst is_OQaagS = utl.getJIT("is_OQaagS"); return function te_uC6waY(v,pth=[],er=[]){if (!((typeof v === \'object\' && v !== null && (is_tzFL7v.fn(v) || is_OQaagS.fn(v))))) utl.err(pth,er,"union"); return er}',
		dependenciesSet: new Set(["is_tzFL7v", "is_OQaagS"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const is_tzFL7v = utl.getJIT("is_tzFL7v");
			const is_OQaagS = utl.getJIT("is_OQaagS");
			return function te_uC6waY(v, pth = [], er = []) {
				if (
					!(
						typeof v === "object" &&
						v !== null &&
						(is_tzFL7v.fn(v) || is_OQaagS.fn(v))
					)
				)
					utl.err(pth, er, "union");
				return er;
			};
		},
		fn: undefined,
	},
	tj_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "tj",
		jitFnHash: "tj_uC6waY",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json encode union: item does not belong to the union";\nconst tj_tzFL7v = utl.getJIT("tj_tzFL7v");\nconst fj_tzFL7v = utl.getJIT("fj_tzFL7v");\nconst is_tzFL7v = utl.getJIT("is_tzFL7v");\nconst tj_OQaagS = utl.getJIT("tj_OQaagS");\nconst fj_OQaagS = utl.getJIT("fj_OQaagS");\nconst is_OQaagS = utl.getJIT("is_OQaagS"); return function tj_uC6waY(v){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if (is_tzFL7v.fn(v)) {v = tj_tzFL7v.fn(v); v = [0, v]}else if (is_OQaagS.fn(v)) {v = tj_OQaagS.fn(v); v = [1, v]}else {throw new Error(uErr0);} return v}',
		dependenciesSet: new Set([
			"tj_tzFL7v",
			"fj_tzFL7v",
			"is_tzFL7v",
			"tj_OQaagS",
			"fj_OQaagS",
			"is_OQaagS",
		]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			const tj_tzFL7v = utl.getJIT("tj_tzFL7v");
			const fj_tzFL7v = utl.getJIT("fj_tzFL7v");
			const is_tzFL7v = utl.getJIT("is_tzFL7v");
			const tj_OQaagS = utl.getJIT("tj_OQaagS");
			const fj_OQaagS = utl.getJIT("fj_OQaagS");
			const is_OQaagS = utl.getJIT("is_OQaagS");
			return function tj_uC6waY(v) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_tzFL7v.fn(v)) {
					v = tj_tzFL7v.fn(v);
					v = [0, v];
				} else if (is_OQaagS.fn(v)) {
					v = tj_OQaagS.fn(v);
					v = [1, v];
				} else {
					throw new Error(uErr0);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_tzFL7v: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "tj",
		jitFnHash: "tj_tzFL7v",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_tP7Vvb = utl.getJIT("tj_tP7Vvb");\nconst tj_TZrLNn = utl.getJIT("tj_TZrLNn");\nconst tj_tf5dpV = utl.getJIT("tj_tf5dpV"); return function tj_tzFL7v(v){v.purFnDeps = tj_tP7Vvb.fn(v.purFnDeps);v.methods = tj_TZrLNn.fn(v.methods);v.deps = tj_tf5dpV.fn(v.deps); return v}',
		dependenciesSet: new Set(["tj_tP7Vvb", "tj_TZrLNn", "tj_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tj_tP7Vvb = utl.getJIT("tj_tP7Vvb");
			const tj_TZrLNn = utl.getJIT("tj_TZrLNn");
			const tj_tf5dpV = utl.getJIT("tj_tf5dpV");
			return function tj_tzFL7v(v) {
				v.purFnDeps = tj_tP7Vvb.fn(v.purFnDeps);
				v.methods = tj_TZrLNn.fn(v.methods);
				v.deps = tj_tf5dpV.fn(v.deps);
				return v;
			};
		},
		fn: undefined,
	},
	tj_tP7Vvb: {
		isNoop: false,
		typeName: "PureFnsDataCache",
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
	tj_TZrLNn: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "tj",
		jitFnHash: "tj_TZrLNn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_ecqqc8 = utl.getJIT("tj_ecqqc8"); return function tj_TZrLNn(v){for (const p0 in v){ v[p0] = tj_ecqqc8.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["tj_ecqqc8"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tj_ecqqc8 = utl.getJIT("tj_ecqqc8");
			return function tj_TZrLNn(v) {
				for (const p0 in v) {
					v[p0] = tj_ecqqc8.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_ecqqc8: {
		isNoop: false,
		typeName: "MethodWithOptions",
		fnID: "tj",
		jitFnHash: "tj_ecqqc8",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_VJxRzx = utl.getJIT("tj_VJxRzx"); return function tj_ecqqc8(v){v.options = tj_VJxRzx.fn(v.options); return v}',
		dependenciesSet: new Set(["tj_VJxRzx"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tj_VJxRzx = utl.getJIT("tj_VJxRzx");
			return function tj_ecqqc8(v) {
				v.options = tj_VJxRzx.fn(v.options);
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
	tj_VJxRzx: {
		isNoop: false,
		typeName: "RemoteMethodOpts",
		fnID: "tj",
		jitFnHash: "tj_VJxRzx",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const tj_hxdrPr = utl.getJIT("tj_hxdrPr"); return function tj_VJxRzx(v){if (v.serializer !== undefined) {v.serializer = tj_hxdrPr.fn(v.serializer);} return v}',
		dependenciesSet: new Set(["tj_hxdrPr"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tj_hxdrPr = utl.getJIT("tj_hxdrPr");
			return function tj_VJxRzx(v) {
				if (v.serializer !== undefined) {
					v.serializer = tj_hxdrPr.fn(v.serializer);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_hxdrPr: {
		isNoop: false,
		typeName: "SerializerMode",
		fnID: "tj",
		jitFnHash: "tj_hxdrPr",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json encode union: item does not belong to the union"; return function tj_hxdrPr(v){if (v === "json") { /*noop*/}else if (v === "binary") { /*noop*/}else if (v === "stringifyJson") { /*noop*/} else {throw new Error(uErr0);} return v}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			return function tj_hxdrPr(v) {
				if (v === "json") {
					/*noop*/
				} else if (v === "binary") {
					/*noop*/
				} else if (v === "stringifyJson") {
					/*noop*/
				} else {
					throw new Error(uErr0);
				}
				return v;
			};
		},
		fn: undefined,
	},
	tj_tf5dpV: {
		isNoop: false,
		typeName: "FnsDataCache",
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
	fj_tzFL7v: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "fj",
		jitFnHash: "fj_tzFL7v",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_tP7Vvb = utl.getJIT("fj_tP7Vvb");\nconst fj_TZrLNn = utl.getJIT("fj_TZrLNn");\nconst fj_tf5dpV = utl.getJIT("fj_tf5dpV"); return function fj_tzFL7v(v){v.purFnDeps = fj_tP7Vvb.fn(v.purFnDeps);v.methods = fj_TZrLNn.fn(v.methods);v.deps = fj_tf5dpV.fn(v.deps); return v}',
		dependenciesSet: new Set(["fj_tP7Vvb", "fj_TZrLNn", "fj_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fj_tP7Vvb = utl.getJIT("fj_tP7Vvb");
			const fj_TZrLNn = utl.getJIT("fj_TZrLNn");
			const fj_tf5dpV = utl.getJIT("fj_tf5dpV");
			return function fj_tzFL7v(v) {
				v.purFnDeps = fj_tP7Vvb.fn(v.purFnDeps);
				v.methods = fj_TZrLNn.fn(v.methods);
				v.deps = fj_tf5dpV.fn(v.deps);
				return v;
			};
		},
		fn: undefined,
	},
	fj_tP7Vvb: {
		isNoop: false,
		typeName: "PureFnsDataCache",
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
	fj_TZrLNn: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "fj",
		jitFnHash: "fj_TZrLNn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_ecqqc8 = utl.getJIT("fj_ecqqc8"); return function fj_TZrLNn(v){for (const p0 in v){ v[p0] = fj_ecqqc8.fn(v[p0]);} return v}',
		dependenciesSet: new Set(["fj_ecqqc8"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fj_ecqqc8 = utl.getJIT("fj_ecqqc8");
			return function fj_TZrLNn(v) {
				for (const p0 in v) {
					v[p0] = fj_ecqqc8.fn(v[p0]);
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_ecqqc8: {
		isNoop: false,
		typeName: "MethodWithOptions",
		fnID: "fj",
		jitFnHash: "fj_ecqqc8",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_VJxRzx = utl.getJIT("fj_VJxRzx"); return function fj_ecqqc8(v){v.options = fj_VJxRzx.fn(v.options); return v}',
		dependenciesSet: new Set(["fj_VJxRzx"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fj_VJxRzx = utl.getJIT("fj_VJxRzx");
			return function fj_ecqqc8(v) {
				v.options = fj_VJxRzx.fn(v.options);
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
	fj_VJxRzx: {
		isNoop: false,
		typeName: "RemoteMethodOpts",
		fnID: "fj",
		jitFnHash: "fj_VJxRzx",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const fj_hxdrPr = utl.getJIT("fj_hxdrPr"); return function fj_VJxRzx(v){if (v.serializer !== undefined) {v.serializer = fj_hxdrPr.fn(v.serializer);} return v}',
		dependenciesSet: new Set(["fj_hxdrPr"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fj_hxdrPr = utl.getJIT("fj_hxdrPr");
			return function fj_VJxRzx(v) {
				if (v.serializer !== undefined) {
					v.serializer = fj_hxdrPr.fn(v.serializer);
				}
				return v;
			};
		},
		fn: undefined,
	},
	fj_hxdrPr: {
		isNoop: false,
		typeName: "SerializerMode",
		fnID: "fj",
		jitFnHash: "fj_hxdrPr",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const uErr0 = \"Can not json decode union: invalid union index\"; return function fj_hxdrPr(v){\n if (v?.length === 2 && Array.isArray(v) && typeof v[0] === 'number') {\n const dec0 = v[0]; v = v[1];\n if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}else if (dec0 === 2) {/*noop*/}\n else {throw new Error(uErr0)}\n }\n ; return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			return function fj_hxdrPr(v) {
				if (v?.length === 2 && Array.isArray(v) && typeof v[0] === "number") {
					const dec0 = v[0];
					v = v[1];
					if (dec0 === 0) {
						/*noop*/
					} else if (dec0 === 1) {
						/*noop*/
					} else if (dec0 === 2) {
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
	fj_tf5dpV: {
		isNoop: false,
		typeName: "FnsDataCache",
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
	tj_OQaagS: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tj",
		jitFnHash: "tj_OQaagS",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const uErr0 = \"Can not json encode union: item does not belong to the union\"; return function tj_OQaagS(v){if (v.id !== undefined) {if (Number.isFinite(v.id)) { /*noop*/}else if (typeof v.id === 'string') { /*noop*/} else {throw new Error(uErr0);}} return v}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not json encode union: item does not belong to the union";
			return function tj_OQaagS(v) {
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
	fj_OQaagS: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fj",
		jitFnHash: "fj_OQaagS",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index"; return function fj_OQaagS(v){\n if (v.id !== undefined) {\n if (v.id?.length === 2 && Array.isArray(v.id) && typeof v.id[0] === \'number\') {\n const dec0 = v.id[0]; v.id = v.id[1];\n if (dec0 === 0) {/*noop*/}else if (dec0 === 1) {/*noop*/}\n else {throw new Error(uErr0)}\n }\n ;};\n let desFn1 = utl.getDeserializeFn("RpcError");\n if (desFn1) {v = desFn1(v)}\n else if (desFn1 = utl.getSerializeClass("RpcError")) {v = new desFn1(v)}\n ; return v}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			return function fj_OQaagS(v) {
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
	fj_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "fj",
		jitFnHash: "fj_uC6waY",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not json decode union: invalid union index";\nconst fj_tzFL7v = utl.getJIT("fj_tzFL7v");\nconst fj_OQaagS = utl.getJIT("fj_OQaagS"); return function fj_uC6waY(v){\n if (v?.length === 2 && Array.isArray(v) && typeof v[0] === \'number\') {\n const dec0 = v[0]; v = v[1];\n if (dec0 === 0) {v = fj_tzFL7v.fn(v)}else if (dec0 === 1) {v = fj_OQaagS.fn(v)}\n else {throw new Error(uErr0)}\n }\n ; return v}',
		dependenciesSet: new Set(["fj_tzFL7v", "fj_OQaagS"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not json decode union: invalid union index";
			const fj_tzFL7v = utl.getJIT("fj_tzFL7v");
			const fj_OQaagS = utl.getJIT("fj_OQaagS");
			return function fj_uC6waY(v) {
				if (v?.length === 2 && Array.isArray(v) && typeof v[0] === "number") {
					const dec0 = v[0];
					v = v[1];
					if (dec0 === 0) {
						v = fj_tzFL7v.fn(v);
					} else if (dec0 === 1) {
						v = fj_OQaagS.fn(v);
					} else {
						throw new Error(uErr0);
					}
				}
				return v;
			};
		},
		fn: undefined,
	},
	sj_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "sj",
		jitFnHash: "sj_uC6waY",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not StringifyJson union: item does not belong to the union";\nconst sj_tzFL7v = utl.getJIT("sj_tzFL7v");\nconst tj_tzFL7v = utl.getJIT("tj_tzFL7v");\nconst fj_tzFL7v = utl.getJIT("fj_tzFL7v");\nconst is_tzFL7v = utl.getJIT("is_tzFL7v");\nconst sj_OQaagS = utl.getJIT("sj_OQaagS");\nconst tj_OQaagS = utl.getJIT("tj_OQaagS");\nconst fj_OQaagS = utl.getJIT("fj_OQaagS");\nconst is_OQaagS = utl.getJIT("is_OQaagS"); return function sj_uC6waY(v){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if (is_tzFL7v.fn(v)) {return \'[0,\' + sj_tzFL7v.fn(v) + \']\'}else if (is_OQaagS.fn(v)) {return \'[1,\' + sj_OQaagS.fn(v) + \']\'}else {throw new Error(uErr0);}}',
		dependenciesSet: new Set([
			"sj_tzFL7v",
			"tj_tzFL7v",
			"fj_tzFL7v",
			"is_tzFL7v",
			"sj_OQaagS",
			"tj_OQaagS",
			"fj_OQaagS",
			"is_OQaagS",
		]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not StringifyJson union: item does not belong to the union";
			const sj_tzFL7v = utl.getJIT("sj_tzFL7v");
			const tj_tzFL7v = utl.getJIT("tj_tzFL7v");
			const fj_tzFL7v = utl.getJIT("fj_tzFL7v");
			const is_tzFL7v = utl.getJIT("is_tzFL7v");
			const sj_OQaagS = utl.getJIT("sj_OQaagS");
			const tj_OQaagS = utl.getJIT("tj_OQaagS");
			const fj_OQaagS = utl.getJIT("fj_OQaagS");
			const is_OQaagS = utl.getJIT("is_OQaagS");
			return function sj_uC6waY(v) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_tzFL7v.fn(v)) {
					return "[0," + sj_tzFL7v.fn(v) + "]";
				} else if (is_OQaagS.fn(v)) {
					return "[1," + sj_OQaagS.fn(v) + "]";
				} else {
					throw new Error(uErr0);
				}
			};
		},
		fn: undefined,
	},
	sj_tzFL7v: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "sj",
		jitFnHash: "sj_tzFL7v",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const sj_tP7Vvb = utl.getJIT("sj_tP7Vvb");\nconst sj_TZrLNn = utl.getJIT("sj_TZrLNn");\nconst sj_tf5dpV = utl.getJIT("sj_tf5dpV"); return function sj_tzFL7v(v){return \'{\'+\'"purFnDeps":\'+sj_tP7Vvb.fn(v.purFnDeps)+","+\'"methods":\'+sj_TZrLNn.fn(v.methods)+","+\'"deps":\'+sj_tf5dpV.fn(v.deps)+\'}\'}',
		dependenciesSet: new Set(["sj_tP7Vvb", "sj_TZrLNn", "sj_tf5dpV"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_tP7Vvb = utl.getJIT("sj_tP7Vvb");
			const sj_TZrLNn = utl.getJIT("sj_TZrLNn");
			const sj_tf5dpV = utl.getJIT("sj_tf5dpV");
			return function sj_tzFL7v(v) {
				return (
					"{" +
					'"purFnDeps":' +
					sj_tP7Vvb.fn(v.purFnDeps) +
					"," +
					'"methods":' +
					sj_TZrLNn.fn(v.methods) +
					"," +
					'"deps":' +
					sj_tf5dpV.fn(v.deps) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	sj_tP7Vvb: {
		isNoop: false,
		typeName: "PureFnsDataCache",
		fnID: "sj",
		jitFnHash: "sj_tP7Vvb",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_cE6uKo = utl.getJIT(\"sj_cE6uKo\"); return function sj_tP7Vvb(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + sj_cE6uKo.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["sj_cE6uKo"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_cE6uKo = utl.getJIT("sj_cE6uKo");
			return function sj_tP7Vvb(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + sj_cE6uKo.fn(v[p1]));
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
	sj_cE6uKo: {
		isNoop: false,
		typeName: "PureFunctionData",
		fnID: "sj",
		jitFnHash: "sj_cE6uKo",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_Ei8qua = utl.getJIT(\"sj_Ei8qua\"); return function sj_cE6uKo(v){return '{'+'\"paramNames\":'+sj_Ei8qua.fn(v.paramNames)+\",\"+'\"code\":'+utl.asJSONString(v.code)+\",\"+'\"pureFnHash\":'+utl.asJSONString(v.pureFnHash)+\",\"+'\"dependencies\":'+(function(){\n const ls0 = [];\n for (const it0 of v.dependencies) {\n const res0 = utl.asJSONString(it0);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']'\n })()+'}'}",
		dependenciesSet: new Set(["sj_Ei8qua"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
			return function sj_cE6uKo(v) {
				return (
					"{" +
					'"paramNames":' +
					sj_Ei8qua.fn(v.paramNames) +
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
	sj_Ei8qua: {
		isNoop: false,
		typeName: "array",
		fnID: "sj",
		jitFnHash: "sj_Ei8qua",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function sj_Ei8qua(v){\n const ls0 = [];\n for (let i0 = 0; i0 < v.length; i0++) {\n const res0 = utl.asJSONString(v[i0]);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']';\n }",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function sj_Ei8qua(v) {
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
	sj_TZrLNn: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "sj",
		jitFnHash: "sj_TZrLNn",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_ecqqc8 = utl.getJIT(\"sj_ecqqc8\"); return function sj_TZrLNn(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + sj_ecqqc8.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["sj_ecqqc8"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_ecqqc8 = utl.getJIT("sj_ecqqc8");
			return function sj_TZrLNn(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + sj_ecqqc8.fn(v[p1]));
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
	sj_ecqqc8: {
		isNoop: false,
		typeName: "MethodWithOptions",
		fnID: "sj",
		jitFnHash: "sj_ecqqc8",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const sj_Ei8qua = utl.getJIT("sj_Ei8qua");\nconst sj_s8eky2 = utl.getJIT("sj_s8eky2");\nconst sj_VJxRzx = utl.getJIT("sj_VJxRzx"); return function sj_ecqqc8(v){return \'{\'+(v.paramNames === undefined ? \'\' : \'"paramNames":\'+sj_Ei8qua.fn(v.paramNames)+",")+(v.headersParam === undefined ? \'\' : \'"headersParam":\'+sj_s8eky2.fn(v.headersParam)+",")+(v.headersReturn === undefined ? \'\' : \'"headersReturn":\'+sj_s8eky2.fn(v.headersReturn)+",")+(v.linkedFnIds === undefined ? \'\' : \'"linkedFnIds":\'+sj_Ei8qua.fn(v.linkedFnIds)+",")+\'"type":\'+v.type+","+\'"id":\'+utl.asJSONString(v.id)+","+\'"isAsync":\'+(v.isAsync ? \'true\' : \'false\')+","+\'"hasReturnData":\'+(v.hasReturnData ? \'true\' : \'false\')+","+\'"paramsJitHash":\'+utl.asJSONString(v.paramsJitHash)+","+\'"returnJitHash":\'+utl.asJSONString(v.returnJitHash)+","+\'"pointer":\'+sj_Ei8qua.fn(v.pointer)+","+\'"nestLevel":\'+v.nestLevel+","+\'"options":\'+sj_VJxRzx.fn(v.options)+\'}\'}',
		dependenciesSet: new Set(["sj_Ei8qua", "sj_s8eky2", "sj_VJxRzx"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
			const sj_s8eky2 = utl.getJIT("sj_s8eky2");
			const sj_VJxRzx = utl.getJIT("sj_VJxRzx");
			return function sj_ecqqc8(v) {
				return (
					"{" +
					(v.paramNames === undefined
						? ""
						: '"paramNames":' + sj_Ei8qua.fn(v.paramNames) + ",") +
					(v.headersParam === undefined
						? ""
						: '"headersParam":' + sj_s8eky2.fn(v.headersParam) + ",") +
					(v.headersReturn === undefined
						? ""
						: '"headersReturn":' + sj_s8eky2.fn(v.headersReturn) + ",") +
					(v.linkedFnIds === undefined
						? ""
						: '"linkedFnIds":' + sj_Ei8qua.fn(v.linkedFnIds) + ",") +
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
					sj_Ei8qua.fn(v.pointer) +
					"," +
					'"nestLevel":' +
					v.nestLevel +
					"," +
					'"options":' +
					sj_VJxRzx.fn(v.options) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	sj_s8eky2: {
		isNoop: false,
		typeName: "HeadersMetaData",
		fnID: "sj",
		jitFnHash: "sj_s8eky2",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_Ei8qua = utl.getJIT(\"sj_Ei8qua\"); return function sj_s8eky2(v){return '{'+'\"headerNames\":'+sj_Ei8qua.fn(v.headerNames)+\",\"+'\"jitHash\":'+utl.asJSONString(v.jitHash)+'}'}",
		dependenciesSet: new Set(["sj_Ei8qua"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
			return function sj_s8eky2(v) {
				return (
					"{" +
					'"headerNames":' +
					sj_Ei8qua.fn(v.headerNames) +
					"," +
					'"jitHash":' +
					utl.asJSONString(v.jitHash) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	sj_VJxRzx: {
		isNoop: false,
		typeName: "RemoteMethodOpts",
		fnID: "sj",
		jitFnHash: "sj_VJxRzx",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_hxdrPr = utl.getJIT(\"sj_hxdrPr\"); return function sj_VJxRzx(v){return (function(){const ns0 = [];if (v.runOnError !== undefined){ns0.push((v.runOnError === undefined ? '' : '\"runOnError\":'+(v.runOnError ? 'true' : 'false')))}if (v.validateParams !== undefined){ns0.push((v.validateParams === undefined ? '' : '\"validateParams\":'+(v.validateParams ? 'true' : 'false')))}if (v.validateReturn !== undefined){ns0.push((v.validateReturn === undefined ? '' : '\"validateReturn\":'+(v.validateReturn ? 'true' : 'false')))}if (v.description !== undefined){ns0.push((v.description === undefined ? '' : '\"description\":'+utl.asJSONString(v.description)))}if (v.serializer !== undefined){ns0.push((v.serializer === undefined ? '' : '\"serializer\":'+sj_hxdrPr.fn(v.serializer)))};return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["sj_hxdrPr"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_hxdrPr = utl.getJIT("sj_hxdrPr");
			return function sj_VJxRzx(v) {
				return (function () {
					const ns0 = [];
					if (v.runOnError !== undefined) {
						ns0.push(
							v.runOnError === undefined
								? ""
								: '"runOnError":' + (v.runOnError ? "true" : "false"),
						);
					}
					if (v.validateParams !== undefined) {
						ns0.push(
							v.validateParams === undefined
								? ""
								: '"validateParams":' + (v.validateParams ? "true" : "false"),
						);
					}
					if (v.validateReturn !== undefined) {
						ns0.push(
							v.validateReturn === undefined
								? ""
								: '"validateReturn":' + (v.validateReturn ? "true" : "false"),
						);
					}
					if (v.description !== undefined) {
						ns0.push(
							v.description === undefined
								? ""
								: '"description":' + utl.asJSONString(v.description),
						);
					}
					if (v.serializer !== undefined) {
						ns0.push(
							v.serializer === undefined
								? ""
								: '"serializer":' + sj_hxdrPr.fn(v.serializer),
						);
					}
					return "{" + ns0.join(",") + "}";
				})();
			};
		},
		fn: undefined,
	},
	sj_hxdrPr: {
		isNoop: false,
		typeName: "SerializerMode",
		fnID: "sj",
		jitFnHash: "sj_hxdrPr",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not StringifyJson union: item does not belong to the union"; return function sj_hxdrPr(v){if (v === "json") {return utl.asJSONString(v)}else if (v === "binary") {return utl.asJSONString(v)}else if (v === "stringifyJson") {return utl.asJSONString(v)} else {throw new Error(uErr0);}}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not StringifyJson union: item does not belong to the union";
			return function sj_hxdrPr(v) {
				if (v === "json") {
					return utl.asJSONString(v);
				} else if (v === "binary") {
					return utl.asJSONString(v);
				} else if (v === "stringifyJson") {
					return utl.asJSONString(v);
				} else {
					throw new Error(uErr0);
				}
			};
		},
		fn: undefined,
	},
	sj_tf5dpV: {
		isNoop: false,
		typeName: "FnsDataCache",
		fnID: "sj",
		jitFnHash: "sj_tf5dpV",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_EmCqyw = utl.getJIT(\"sj_EmCqyw\"); return function sj_tf5dpV(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + sj_EmCqyw.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());return '{'+ns0.join(',')+'}'})()}",
		dependenciesSet: new Set(["sj_EmCqyw"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_EmCqyw = utl.getJIT("sj_EmCqyw");
			return function sj_tf5dpV(v) {
				return (function () {
					const ns0 = [];
					ns0.push(
						(function () {
							const ls1 = [];
							for (const p1 in v) {
								if (p1 !== undefined)
									ls1.push(utl.asJSONString(p1) + ":" + sj_EmCqyw.fn(v[p1]));
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
	sj_EmCqyw: {
		isNoop: false,
		typeName: "JitCompiledFnData",
		fnID: "sj",
		jitFnHash: "sj_EmCqyw",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: "const sj_Ei8qua = utl.getJIT(\"sj_Ei8qua\");\nconst sj_gCQYSg = utl.getJIT(\"sj_gCQYSg\"); return function sj_EmCqyw(v){return '{'+(v.isNoop === undefined ? '' : '\"isNoop\":'+(v.isNoop ? 'true' : 'false')+\",\")+(v.paramNames === undefined ? '' : '\"paramNames\":'+sj_Ei8qua.fn(v.paramNames)+\",\")+'\"typeName\":'+utl.asJSONString(v.typeName)+\",\"+'\"fnID\":'+utl.asJSONString(v.fnID)+\",\"+'\"jitFnHash\":'+utl.asJSONString(v.jitFnHash)+\",\"+'\"args\":'+sj_gCQYSg.fn(v.args)+\",\"+'\"defaultParamValues\":'+sj_gCQYSg.fn(v.defaultParamValues)+\",\"+'\"code\":'+utl.asJSONString(v.code)+\",\"+'\"dependenciesSet\":'+(function(){\n const ls0 = [];\n for (const it0 of v.dependenciesSet) {\n const res0 = utl.asJSONString(it0);\n ls0.push(res0);\n }\n return '[' + ls0.join(',') + ']'\n })()+\",\"+'\"pureFnDependencies\":'+(function(){\n const ls1 = [];\n for (const it1 of v.pureFnDependencies) {\n const res1 = utl.asJSONString(it1);\n ls1.push(res1);\n }\n return '[' + ls1.join(',') + ']'\n })()+'}'}",
		dependenciesSet: new Set(["sj_Ei8qua", "sj_gCQYSg"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const sj_Ei8qua = utl.getJIT("sj_Ei8qua");
			const sj_gCQYSg = utl.getJIT("sj_gCQYSg");
			return function sj_EmCqyw(v) {
				return (
					"{" +
					(v.isNoop === undefined
						? ""
						: '"isNoop":' + (v.isNoop ? "true" : "false") + ",") +
					(v.paramNames === undefined
						? ""
						: '"paramNames":' + sj_Ei8qua.fn(v.paramNames) + ",") +
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
					sj_gCQYSg.fn(v.args) +
					"," +
					'"defaultParamValues":' +
					sj_gCQYSg.fn(v.defaultParamValues) +
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
	sj_gCQYSg: {
		isNoop: false,
		typeName: "JitFnArgs",
		fnID: "sj",
		jitFnHash: "sj_gCQYSg",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function sj_gCQYSg(v){return '{'+(function(){\n const ls0 = [];\n for (const p0 in v) {\n if (\"vλl\" === p0) continue;\n if (p0 !== undefined) ls0.push(utl.asJSONString(p0) + ':' + utl.asJSONString(v[p0]));\n }\n if (!ls0.length) return '';\n return ls0.join(',')+\",\";\n })()+\"\\\"vλl\\\"\"+':'+utl.asJSONString(v[\"vλl\"])+'}'}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function sj_gCQYSg(v) {
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
	sj_OQaagS: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "sj",
		jitFnHash: "sj_OQaagS",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: 'const uErr0 = "Can not StringifyJson union: item does not belong to the union";\nconst sj_WEWIGI = utl.getJIT("sj_WEWIGI"); return function sj_OQaagS(v){return \'{\'+(v.statusCode === undefined ? \'\' : \'"statusCode":\'+v.statusCode+",")+(v.id === undefined ? \'\' : \'"id":\'+(function(){if (Number.isFinite(v.id)) {return v.id}else if (typeof v.id === \'string\') {return utl.asJSONString(v.id)} else {throw new Error(uErr0);}})()+",")+(v.errorData === undefined ? \'\' : \'"errorData":\'+sj_WEWIGI.fn(v.errorData)+",")+"\\"mion@isΣrrθr\\""+\':\'+(v["mion@isΣrrθr"] ? \'true\' : \'false\')+","+\'"type":\'+utl.asJSONString(v.type)+","+\'"publicMessage":\'+utl.asJSONString(v.publicMessage)+\'}\'}',
		dependenciesSet: new Set(["sj_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not StringifyJson union: item does not belong to the union";
			const sj_WEWIGI = utl.getJIT("sj_WEWIGI");
			return function sj_OQaagS(v) {
				return (
					"{" +
					(v.statusCode === undefined
						? ""
						: '"statusCode":' + v.statusCode + ",") +
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
						: '"errorData":' + sj_WEWIGI.fn(v.errorData) + ",") +
					'"mion@isΣrrθr"' +
					":" +
					(v["mion@isΣrrθr"] ? "true" : "false") +
					"," +
					'"type":' +
					utl.asJSONString(v.type) +
					"," +
					'"publicMessage":' +
					utl.asJSONString(v.publicMessage) +
					"}"
				);
			};
		},
		fn: undefined,
	},
	tBi_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "tBi",
		jitFnHash: "tBi_uC6waY",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr0 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_tzFL7v = utl.getJIT("tBi_tzFL7v");\nconst is_tzFL7v = utl.getJIT("is_tzFL7v");\nconst tBi_OQaagS = utl.getJIT("tBi_OQaagS");\nconst is_OQaagS = utl.getJIT("is_OQaagS"); return function tBi_uC6waY(v,Ser){if (!(typeof v === \'object\' && v !== null)) {throw new Error(uErr0);}else if (is_tzFL7v.fn(v)) {Ser.view.setUint8(Ser.index++, 0);tBi_tzFL7v.fn(v,Ser)}else if (is_OQaagS.fn(v)) {Ser.view.setUint8(Ser.index++, 1);tBi_OQaagS.fn(v,Ser)}else {throw new Error(uErr0);} return Ser}',
		dependenciesSet: new Set([
			"tBi_tzFL7v",
			"is_tzFL7v",
			"tBi_OQaagS",
			"is_OQaagS",
		]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_tzFL7v = utl.getJIT("tBi_tzFL7v");
			const is_tzFL7v = utl.getJIT("is_tzFL7v");
			const tBi_OQaagS = utl.getJIT("tBi_OQaagS");
			const is_OQaagS = utl.getJIT("is_OQaagS");
			return function tBi_uC6waY(v, Ser) {
				if (!(typeof v === "object" && v !== null)) {
					throw new Error(uErr0);
				} else if (is_tzFL7v.fn(v)) {
					Ser.view.setUint8(Ser.index++, 0);
					tBi_tzFL7v.fn(v, Ser);
				} else if (is_OQaagS.fn(v)) {
					Ser.view.setUint8(Ser.index++, 1);
					tBi_OQaagS.fn(v, Ser);
				} else {
					throw new Error(uErr0);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_tzFL7v: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "tBi",
		jitFnHash: "tBi_tzFL7v",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_TZrLNn = utl.getJIT("tBi_TZrLNn");\nconst tBi_tf5dpV = utl.getJIT("tBi_tf5dpV");\nconst tBi_tP7Vvb = utl.getJIT("tBi_tP7Vvb"); return function tBi_tzFL7v(v,Ser){tBi_TZrLNn.fn(v.methods,Ser);tBi_tf5dpV.fn(v.deps,Ser);tBi_tP7Vvb.fn(v.purFnDeps,Ser);\n; return Ser}',
		dependenciesSet: new Set(["tBi_TZrLNn", "tBi_tf5dpV", "tBi_tP7Vvb"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_TZrLNn = utl.getJIT("tBi_TZrLNn");
			const tBi_tf5dpV = utl.getJIT("tBi_tf5dpV");
			const tBi_tP7Vvb = utl.getJIT("tBi_tP7Vvb");
			return function tBi_tzFL7v(v, Ser) {
				tBi_TZrLNn.fn(v.methods, Ser);
				tBi_tf5dpV.fn(v.deps, Ser);
				tBi_tP7Vvb.fn(v.purFnDeps, Ser);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_TZrLNn: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "tBi",
		jitFnHash: "tBi_TZrLNn",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_ecqqc8 = utl.getJIT("tBi_ecqqc8"); return function tBi_TZrLNn(v,Ser){\n let cnt0 = 0; const piI0 = Ser.index; Ser.index += 4;\n for (const p0 in v) {Ser.serString(p0); tBi_ecqqc8.fn(v[p0],Ser); cnt0++;}\n Ser.view.setUint32(piI0, cnt0, 1);\n ; return Ser}',
		dependenciesSet: new Set(["tBi_ecqqc8"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_ecqqc8 = utl.getJIT("tBi_ecqqc8");
			return function tBi_TZrLNn(v, Ser) {
				let cnt0 = 0;
				const piI0 = Ser.index;
				Ser.index += 4;
				for (const p0 in v) {
					Ser.serString(p0);
					tBi_ecqqc8.fn(v[p0], Ser);
					cnt0++;
				}
				Ser.view.setUint32(piI0, cnt0, 1);
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_ecqqc8: {
		isNoop: false,
		typeName: "MethodWithOptions",
		fnID: "tBi",
		jitFnHash: "tBi_ecqqc8",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");\nconst tBi_VJxRzx = utl.getJIT("tBi_VJxRzx");\nconst tBi_s8eky2 = utl.getJIT("tBi_s8eky2"); return function tBi_ecqqc8(v,Ser){Ser.view.setFloat64(Ser.index,v.type, 1, (Ser.index += 8));Ser.serString(v.id);Ser.view.setUint8(Ser.index++, !!v.isAsync);Ser.view.setUint8(Ser.index++, !!v.hasReturnData);Ser.serString(v.paramsJitHash);Ser.serString(v.returnJitHash);tBi_Ei8qua.fn(v.pointer,Ser);Ser.view.setFloat64(Ser.index,v.nestLevel, 1, (Ser.index += 8));tBi_VJxRzx.fn(v.options,Ser);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.paramNames !== undefined) {tBi_Ei8qua.fn(v.paramNames,Ser);Ser.setBitMask(bmI0, 0 & 7)}if (v.headersParam !== undefined) {tBi_s8eky2.fn(v.headersParam,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.headersReturn !== undefined) {tBi_s8eky2.fn(v.headersReturn,Ser);Ser.setBitMask(bmI0, 2 & 7)}if (v.linkedFnIds !== undefined) {tBi_Ei8qua.fn(v.linkedFnIds,Ser);Ser.setBitMask(bmI0, 3 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_Ei8qua", "tBi_VJxRzx", "tBi_s8eky2"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_Ei8qua = utl.getJIT("tBi_Ei8qua");
			const tBi_VJxRzx = utl.getJIT("tBi_VJxRzx");
			const tBi_s8eky2 = utl.getJIT("tBi_s8eky2");
			return function tBi_ecqqc8(v, Ser) {
				Ser.view.setFloat64(Ser.index, v.type, 1, (Ser.index += 8));
				Ser.serString(v.id);
				Ser.view.setUint8(Ser.index++, !!v.isAsync);
				Ser.view.setUint8(Ser.index++, !!v.hasReturnData);
				Ser.serString(v.paramsJitHash);
				Ser.serString(v.returnJitHash);
				tBi_Ei8qua.fn(v.pointer, Ser);
				Ser.view.setFloat64(Ser.index, v.nestLevel, 1, (Ser.index += 8));
				tBi_VJxRzx.fn(v.options, Ser);
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
				if (v.linkedFnIds !== undefined) {
					tBi_Ei8qua.fn(v.linkedFnIds, Ser);
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
	tBi_VJxRzx: {
		isNoop: false,
		typeName: "RemoteMethodOpts",
		fnID: "tBi",
		jitFnHash: "tBi_VJxRzx",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const tBi_hxdrPr = utl.getJIT("tBi_hxdrPr"); return function tBi_VJxRzx(v,Ser){\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.runOnError !== undefined) {Ser.view.setUint8(Ser.index++, !!v.runOnError);Ser.setBitMask(bmI0, 0 & 7)}if (v.validateParams !== undefined) {Ser.view.setUint8(Ser.index++, !!v.validateParams);Ser.setBitMask(bmI0, 1 & 7)}if (v.validateReturn !== undefined) {Ser.view.setUint8(Ser.index++, !!v.validateReturn);Ser.setBitMask(bmI0, 2 & 7)}if (v.description !== undefined) {Ser.serString(v.description);Ser.setBitMask(bmI0, 3 & 7)}if (v.serializer !== undefined) {tBi_hxdrPr.fn(v.serializer,Ser);Ser.setBitMask(bmI0, 4 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_hxdrPr"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const tBi_hxdrPr = utl.getJIT("tBi_hxdrPr");
			return function tBi_VJxRzx(v, Ser) {
				const bmI0 = Ser.index;
				Ser.view.setUint8(Ser.index++, 0);
				if (v.runOnError !== undefined) {
					Ser.view.setUint8(Ser.index++, !!v.runOnError);
					Ser.setBitMask(bmI0, 0 & 7);
				}
				if (v.validateParams !== undefined) {
					Ser.view.setUint8(Ser.index++, !!v.validateParams);
					Ser.setBitMask(bmI0, 1 & 7);
				}
				if (v.validateReturn !== undefined) {
					Ser.view.setUint8(Ser.index++, !!v.validateReturn);
					Ser.setBitMask(bmI0, 2 & 7);
				}
				if (v.description !== undefined) {
					Ser.serString(v.description);
					Ser.setBitMask(bmI0, 3 & 7);
				}
				if (v.serializer !== undefined) {
					tBi_hxdrPr.fn(v.serializer, Ser);
					Ser.setBitMask(bmI0, 4 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	tBi_hxdrPr: {
		isNoop: false,
		typeName: "SerializerMode",
		fnID: "tBi",
		jitFnHash: "tBi_hxdrPr",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr0 = "Can not encode union to binary: item does not belong to the union"; return function tBi_hxdrPr(v,Ser){if (v === "json") {Ser.view.setUint8(Ser.index++, 0);}else if (v === "binary") {Ser.view.setUint8(Ser.index++, 1);}else if (v === "stringifyJson") {Ser.view.setUint8(Ser.index++, 2);} else {throw new Error(uErr0);} return Ser}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 =
				"Can not encode union to binary: item does not belong to the union";
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
		typeName: "FnsDataCache",
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
		typeName: "PureFnsDataCache",
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
	tBi_OQaagS: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "tBi",
		jitFnHash: "tBi_OQaagS",
		args: { sεr: "Ser", vλl: "v" },
		defaultParamValues: { sεr: "", vλl: "" },
		code: 'const uErr1 = "Can not encode union to binary: item does not belong to the union";\nconst tBi_WEWIGI = utl.getJIT("tBi_WEWIGI"); return function tBi_OQaagS(v,Ser){;Ser.serString(v.publicMessage);\nconst bmI0 = Ser.index; Ser.view.setUint8(Ser.index++, 0)\nif (v.id !== undefined) {if (Number.isFinite(v.id)) {Ser.view.setUint8(Ser.index++, 0);Ser.view.setFloat64(Ser.index,v.id, 1, (Ser.index += 8));}else if (typeof v.id === \'string\') {Ser.view.setUint8(Ser.index++, 1);Ser.serString(v.id);} else {throw new Error(uErr1);};Ser.setBitMask(bmI0, 0 & 7)}if (v.errorData !== undefined) {tBi_WEWIGI.fn(v.errorData,Ser);Ser.setBitMask(bmI0, 1 & 7)}if (v.statusCode !== undefined) {Ser.view.setFloat64(Ser.index,v.statusCode, 1, (Ser.index += 8));Ser.setBitMask(bmI0, 2 & 7)} return Ser}',
		dependenciesSet: new Set(["tBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr1 =
				"Can not encode union to binary: item does not belong to the union";
			const tBi_WEWIGI = utl.getJIT("tBi_WEWIGI");
			return function tBi_OQaagS(v, Ser) {
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
				if (v.statusCode !== undefined) {
					Ser.view.setFloat64(Ser.index, v.statusCode, 1, (Ser.index += 8));
					Ser.setBitMask(bmI0, 2 & 7);
				}
				return Ser;
			};
		},
		fn: undefined,
	},
	fBi_uC6waY: {
		isNoop: false,
		typeName: "union",
		fnID: "fBi",
		jitFnHash: "fBi_uC6waY",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr0 = "Can not binary decode union: invalid union index";\nconst fBi_tzFL7v = utl.getJIT("fBi_tzFL7v");\nconst fBi_OQaagS = utl.getJIT("fBi_OQaagS"); return function fBi_uC6waY(ret,Des){\n const dec0 = Des.view.getUint8(Des.index++);\n if (dec0 === 0) {ret = fBi_tzFL7v.fn(undefined,Des)}else if (dec0 === 1) {ret = fBi_OQaagS.fn(undefined,Des)}\n else {throw new Error(uErr0)}\n ; return ret}',
		dependenciesSet: new Set(["fBi_tzFL7v", "fBi_OQaagS"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr0 = "Can not binary decode union: invalid union index";
			const fBi_tzFL7v = utl.getJIT("fBi_tzFL7v");
			const fBi_OQaagS = utl.getJIT("fBi_OQaagS");
			return function fBi_uC6waY(ret, Des) {
				const dec0 = Des.view.getUint8(Des.index++);
				if (dec0 === 0) {
					ret = fBi_tzFL7v.fn(undefined, Des);
				} else if (dec0 === 1) {
					ret = fBi_OQaagS.fn(undefined, Des);
				} else {
					throw new Error(uErr0);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_tzFL7v: {
		isNoop: false,
		typeName: "SerializableMethodsData",
		fnID: "fBi",
		jitFnHash: "fBi_tzFL7v",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_TZrLNn = utl.getJIT("fBi_TZrLNn");\nconst fBi_tf5dpV = utl.getJIT("fBi_tf5dpV");\nconst fBi_tP7Vvb = utl.getJIT("fBi_tP7Vvb"); return function fBi_tzFL7v(ret,Des){return {methods:fBi_TZrLNn.fn(undefined,Des),deps:fBi_tf5dpV.fn(undefined,Des),purFnDeps:fBi_tP7Vvb.fn(undefined,Des)}}',
		dependenciesSet: new Set(["fBi_TZrLNn", "fBi_tf5dpV", "fBi_tP7Vvb"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_TZrLNn = utl.getJIT("fBi_TZrLNn");
			const fBi_tf5dpV = utl.getJIT("fBi_tf5dpV");
			const fBi_tP7Vvb = utl.getJIT("fBi_tP7Vvb");
			return function fBi_tzFL7v(ret, Des) {
				return {
					methods: fBi_TZrLNn.fn(undefined, Des),
					deps: fBi_tf5dpV.fn(undefined, Des),
					purFnDeps: fBi_tP7Vvb.fn(undefined, Des),
				};
			};
		},
		fn: undefined,
	},
	fBi_TZrLNn: {
		isNoop: false,
		typeName: "MethodsCache",
		fnID: "fBi",
		jitFnHash: "fBi_TZrLNn",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_ecqqc8 = utl.getJIT("fBi_ecqqc8"); return function fBi_TZrLNn(ret,Des){const cnt0 = Des.view.getUint32(Des.index, 1); Des.index += 4; ret = {}; for (let propI0 = 0; propI0 < cnt0; propI0++) {const p0 = Des.desSafePropName();ret[p0] = fBi_ecqqc8.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_ecqqc8"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_ecqqc8 = utl.getJIT("fBi_ecqqc8");
			return function fBi_TZrLNn(ret, Des) {
				const cnt0 = Des.view.getUint32(Des.index, 1);
				Des.index += 4;
				ret = {};
				for (let propI0 = 0; propI0 < cnt0; propI0++) {
					const p0 = Des.desSafePropName();
					ret[p0] = fBi_ecqqc8.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_ecqqc8: {
		isNoop: false,
		typeName: "MethodWithOptions",
		fnID: "fBi",
		jitFnHash: "fBi_ecqqc8",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");\nconst fBi_VJxRzx = utl.getJIT("fBi_VJxRzx");\nconst fBi_s8eky2 = utl.getJIT("fBi_s8eky2"); return function fBi_ecqqc8(ret,Des){ret = {type:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),id:Des.desString(),isAsync:Des.view.getUint8(Des.index++) === 1,hasReturnData:Des.view.getUint8(Des.index++) === 1,paramsJitHash:Des.desString(),returnJitHash:Des.desString(),pointer:fBi_Ei8qua.fn(undefined,Des),nestLevel:Des.view.getFloat64(Des.index, 1, (Des.index += 8)),options:fBi_VJxRzx.fn(undefined,Des)}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.paramNames = fBi_Ei8qua.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.headersParam = fBi_s8eky2.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.headersReturn = fBi_s8eky2.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {ret.linkedFnIds = fBi_Ei8qua.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_Ei8qua", "fBi_VJxRzx", "fBi_s8eky2"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_Ei8qua = utl.getJIT("fBi_Ei8qua");
			const fBi_VJxRzx = utl.getJIT("fBi_VJxRzx");
			const fBi_s8eky2 = utl.getJIT("fBi_s8eky2");
			return function fBi_ecqqc8(ret, Des) {
				ret = {
					type: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
					id: Des.desString(),
					isAsync: Des.view.getUint8(Des.index++) === 1,
					hasReturnData: Des.view.getUint8(Des.index++) === 1,
					paramsJitHash: Des.desString(),
					returnJitHash: Des.desString(),
					pointer: fBi_Ei8qua.fn(undefined, Des),
					nestLevel: Des.view.getFloat64(Des.index, 1, (Des.index += 8)),
					options: fBi_VJxRzx.fn(undefined, Des),
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
					ret.linkedFnIds = fBi_Ei8qua.fn(undefined, Des);
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
	fBi_VJxRzx: {
		isNoop: false,
		typeName: "RemoteMethodOpts",
		fnID: "fBi",
		jitFnHash: "fBi_VJxRzx",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const fBi_hxdrPr = utl.getJIT("fBi_hxdrPr"); return function fBi_VJxRzx(ret,Des){ret = {}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {ret.runOnError = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.validateParams = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.validateReturn = Des.view.getUint8(Des.index++) === 1;}if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {ret.description = Des.desString();}if (Des.view.getUint8(bimI0, 1) & (1 << (4 & 7))) {ret.serializer = fBi_hxdrPr.fn(undefined,Des);} return ret}',
		dependenciesSet: new Set(["fBi_hxdrPr"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const fBi_hxdrPr = utl.getJIT("fBi_hxdrPr");
			return function fBi_VJxRzx(ret, Des) {
				ret = {};

				const bimI0 = Des.index;
				Des.index += 1;
				if (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {
					ret.runOnError = Des.view.getUint8(Des.index++) === 1;
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {
					ret.validateParams = Des.view.getUint8(Des.index++) === 1;
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {
					ret.validateReturn = Des.view.getUint8(Des.index++) === 1;
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (3 & 7))) {
					ret.description = Des.desString();
				}
				if (Des.view.getUint8(bimI0, 1) & (1 << (4 & 7))) {
					ret.serializer = fBi_hxdrPr.fn(undefined, Des);
				}
				return ret;
			};
		},
		fn: undefined,
	},
	fBi_hxdrPr: {
		isNoop: false,
		typeName: "SerializerMode",
		fnID: "fBi",
		jitFnHash: "fBi_hxdrPr",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr0 = "Can not binary decode union: invalid union index"; return function fBi_hxdrPr(ret,Des){\n const dec0 = Des.view.getUint8(Des.index++);\n if (dec0 === 0) {ret = "json"}else if (dec0 === 1) {ret = "binary"}else if (dec0 === 2) {ret = "stringifyJson"}\n else {throw new Error(uErr0)}\n ; return ret}',
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
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
		typeName: "FnsDataCache",
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
		typeName: "PureFnsDataCache",
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
	fBi_OQaagS: {
		isNoop: false,
		typeName: "RpcError",
		fnID: "fBi",
		jitFnHash: "fBi_OQaagS",
		args: { dεs: "Des", vλl: "ret" },
		defaultParamValues: { dεs: "", vλl: "" },
		code: 'const uErr1 = "Can not binary decode union: invalid union index";\nconst fBi_WEWIGI = utl.getJIT("fBi_WEWIGI"); return function fBi_OQaagS(ret,Des){ret = {"mion@isΣrrθr":true,type:"rpc-metadata-not-found",publicMessage:Des.desString()}\n\nconst bimI0 = Des.index; Des.index += 1;\nif (Des.view.getUint8(bimI0, 1) & (1 << (0 & 7))) {\n const dec1 = Des.view.getUint8(Des.index++);\n if (dec1 === 0) {ret.id = Des.view.getFloat64(Des.index, 1, (Des.index += 8))}else if (dec1 === 1) {ret.id = Des.desString()}\n else {throw new Error(uErr1)}\n ;}if (Des.view.getUint8(bimI0, 1) & (1 << (1 & 7))) {ret.errorData = fBi_WEWIGI.fn(undefined,Des);}if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));};let desFn0 = utl.getDeserializeFn("RpcError");if (desFn0) {ret = desFn0(ret)} else if (desFn0 = utl.getSerializeClass("RpcError")) {ret = new desFn0(ret)} return ret}',
		dependenciesSet: new Set(["fBi_WEWIGI"]),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			const uErr1 = "Can not binary decode union: invalid union index";
			const fBi_WEWIGI = utl.getJIT("fBi_WEWIGI");
			return function fBi_OQaagS(ret, Des) {
				ret = {
					"mion@isΣrrθr": true,
					type: "rpc-metadata-not-found",
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
				if (Des.view.getUint8(bimI0, 1) & (1 << (2 & 7))) {
					ret.statusCode = Des.view.getFloat64(Des.index, 1, (Des.index += 8));
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
	sj_hZzD9z: {
		isNoop: false,
		typeName: "params",
		fnID: "sj",
		jitFnHash: "sj_hZzD9z",
		args: { vλl: "v" },
		defaultParamValues: { vλl: "" },
		code: " return function sj_hZzD9z(v){return '['+utl.asJSONString(v[0])+(v[1] === undefined ? ','+'null' : ','+(v[1] ? 'true' : 'false'))+']'}",
		dependenciesSet: new Set(),
		pureFnDependencies: new Set(),
		createJitFn: function (utl) {
			return function sj_hZzD9z(v) {
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
};
export { jitFnsCache };

const pureFnsCache = {
	mion: {
		asJSONString: {
			namespace: "mion",
			paramNames: [],
			code: "const STR_ESCAPE = /[\\u0000-\\u001f\\u0022\\u005c\\ud800-\\udfff]/;\n const MAX_SCAPE_TEST_LENGTH = 1000;\n return function _asJSONStringRegexOnly(str) {\n if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {\n return '\"' + str + '\"';\n }\n else {\n return JSON.stringify(str);\n }\n };",
			fnName: "asJSONString",
			bodyHash: "Uao0GEmg",
			dependencies: new Set(),
			createJitFn: function asJSONString() {
				const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
				const MAX_SCAPE_TEST_LENGTH = 1000;
				return function _asJSONStringRegexOnly(str) {
					if (
						str.length < MAX_SCAPE_TEST_LENGTH &&
						STR_ESCAPE.test(str) === false
					) {
						return '"' + str + '"';
					} else {
						return JSON.stringify(str);
					}
				};
			},
			fn: undefined,
		},
		err: {
			namespace: "mion",
			paramNames: [],
			code: "return function _err(pλth, εrr, expected, accessPath) {\n const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];\n const runTypeErr = { expected, path };\n εrr.push(runTypeErr);\n };",
			fnName: "err",
			bodyHash: "UcYQSOgK",
			dependencies: new Set(),
			createJitFn: function err() {
				return function _err(pλth, εrr, expected, accessPath) {
					const path = accessPath?.length
						? [...pλth, ...accessPath]
						: [...pλth];
					const runTypeErr = { expected, path };
					εrr.push(runTypeErr);
				};
			},
			fn: undefined,
		},
	},
};
export { pureFnsCache };

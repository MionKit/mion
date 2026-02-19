const pureFnsCache = {
	mion: {
		asJSONString: {
			namespace: "mion",
			paramNames: [],
			code: "if (typeof Bun !== \"undefined\")\n return JSON.stringify;\n const STR_ESCAPE = /[\\u0000-\\u001f\\u0022\\u005c\\ud800-\\udfff]/;\n const MAX_SCAPE_TEST_LENGTH = 1e3;\n return function _asJSONStringRegexOnly(str) {\n if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {\n return '\"' + str + '\"';\n } else {\n return JSON.stringify(str);\n }\n };",
			fnName: "asJSONString",
			bodyHash: "RhfVXR77",
			pureFnDependencies: [],
			createJitFn: function () {
				if (typeof Bun !== "undefined") return JSON.stringify;
				const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
				const MAX_SCAPE_TEST_LENGTH = 1e3;
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
		newRunTypeErr: {
			namespace: "mion",
			paramNames: [],
			code: "return function _err(pλth, εrr, expected, accessPath) {\n const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];\n const runTypeErr = { expected, path };\n εrr.push(runTypeErr);\n };",
			fnName: "newRunTypeErr",
			bodyHash: "lr3bnXPD",
			pureFnDependencies: [],
			createJitFn: function () {
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

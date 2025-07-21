// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY
// NOTE exported constant name must be 'cΦmpilεdCachε' and file can not contain any other code
export const cΦmpilεdCachε = {
  tc_MM4wCU: {
    isNoop: false,
    fnID: 'tc',
    jitFnHash: 'tc_MM4wCU',
    args: {vλl: 'v'},
    defaultParamValues: {vλl: ''},
    code: "const tc_HzxD9j = utl.getJIT(\"tc_HzxD9j\"); function tc_MM4wCU(v){return (function(){const ns0 = [];ns0.push((function(){\n const ls1 = [];\n for (const p1 in v) {\n \n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + tc_HzxD9j.fn(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',');\n })());;return '{'+ns0.join(',')+'}'})()} return tc_MM4wCU;",
    dependenciesSet: new Set(['tc_HzxD9j', 'tc_smSKAu', 'tc_Y64gwQ']),
    pureFnDependencies: new Set(),
    closureFn: function closure_tc_MM4wCU(utl) {
      const tc_HzxD9j = utl.getJIT('tc_HzxD9j');
      function tc_MM4wCU(v) {
        return (function () {
          const ns0 = [];
          ns0.push(
            (function () {
              const ls1 = [];
              for (const p1 in v) {
                if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + tc_HzxD9j.fn(v[p1]));
              }
              if (!ls1.length) return '';
              return ls1.join(',');
            })()
          );
          return '{' + ns0.join(',') + '}';
        })();
      }
      return tc_MM4wCU;
    },
    fn: undefined,
  },
  tc_HzxD9j: {
    isNoop: false,
    fnID: 'tc',
    jitFnHash: 'tc_HzxD9j',
    args: {vλl: 'v'},
    defaultParamValues: {vλl: ''},
    code: "const tc_smSKAu = utl.getJIT(\"tc_smSKAu\");\nconst tc_Y64gwQ = utl.getJIT(\"tc_Y64gwQ\"); function tc_HzxD9j(v){return '{'+(v.isNoop === undefined ? '' : 'isNoop:'+(v.isNoop ? 'true' : 'false')+\",\")+(v.paramNames === undefined ? '' : 'paramNames:'+tc_smSKAu.fn(v.paramNames)+\",\")+'fnID:'+utl.asJSONString(v.fnID)+\",\"+'jitFnHash:'+utl.asJSONString(v.jitFnHash)+\",\"+'args:'+tc_Y64gwQ.fn(v.args)+\",\"+'defaultParamValues:'+tc_Y64gwQ.fn(v.defaultParamValues)+\",\"+'code:'+utl.asJSONString(v.code)+\",\"+'dependenciesSet:'+(function(){\n const ls2 = [];\n for (const it2 of v.dependenciesSet) {\n const res2 = utl.asJSONString(it2);\n ls2.push(res2);\n }\n if (!ls2.length) return 'new Set()';return 'new Set([' + ls2.join(',') + '])'\n })()+\",\"+'pureFnDependencies:'+(function(){\n const ls2 = [];\n for (const it2 of v.pureFnDependencies) {\n const res2 = utl.asJSONString(it2);\n ls2.push(res2);\n }\n if (!ls2.length) return 'new Set()';return 'new Set([' + ls2.join(',') + '])'\n })()+\",\"+'closureFn:'+'function closure_'+v.jitFnHash+'(utl){'+v.code+'}'+\",\"+'fn:'+'undefined'+'}'} return tc_HzxD9j;",
    dependenciesSet: new Set(['tc_smSKAu', 'tc_Y64gwQ']),
    pureFnDependencies: new Set(),
    closureFn: function closure_tc_HzxD9j(utl) {
      const tc_smSKAu = utl.getJIT('tc_smSKAu');
      const tc_Y64gwQ = utl.getJIT('tc_Y64gwQ');
      function tc_HzxD9j(v) {
        return (
          '{' +
          (v.isNoop === undefined ? '' : 'isNoop:' + (v.isNoop ? 'true' : 'false') + ',') +
          (v.paramNames === undefined ? '' : 'paramNames:' + tc_smSKAu.fn(v.paramNames) + ',') +
          'fnID:' +
          utl.asJSONString(v.fnID) +
          ',' +
          'jitFnHash:' +
          utl.asJSONString(v.jitFnHash) +
          ',' +
          'args:' +
          tc_Y64gwQ.fn(v.args) +
          ',' +
          'defaultParamValues:' +
          tc_Y64gwQ.fn(v.defaultParamValues) +
          ',' +
          'code:' +
          utl.asJSONString(v.code) +
          ',' +
          'dependenciesSet:' +
          (function () {
            const ls2 = [];
            for (const it2 of v.dependenciesSet) {
              const res2 = utl.asJSONString(it2);
              ls2.push(res2);
            }
            if (!ls2.length) return 'new Set()';
            return 'new Set([' + ls2.join(',') + '])';
          })() +
          ',' +
          'pureFnDependencies:' +
          (function () {
            const ls2 = [];
            for (const it2 of v.pureFnDependencies) {
              const res2 = utl.asJSONString(it2);
              ls2.push(res2);
            }
            if (!ls2.length) return 'new Set()';
            return 'new Set([' + ls2.join(',') + '])';
          })() +
          ',' +
          'closureFn:' +
          'function closure_' +
          v.jitFnHash +
          '(utl){' +
          v.code +
          '}' +
          ',' +
          'fn:' +
          'undefined' +
          '}'
        );
      }
      return tc_HzxD9j;
    },
    fn: undefined,
  },
  tc_smSKAu: {
    isNoop: false,
    fnID: 'tc',
    jitFnHash: 'tc_smSKAu',
    args: {vλl: 'v'},
    defaultParamValues: {vλl: ''},
    code: " function tc_smSKAu(v){const ls2 = [];\n for (let i2 = 0; i2 < v.length; i2++) {\n const res2 = utl.asJSONString(v[i2]);\n ls2.push(res2);\n }\n return '[' + ls2.join(',') + ']';} return tc_smSKAu;",
    dependenciesSet: new Set(),
    pureFnDependencies: new Set(),
    closureFn: function closure_tc_smSKAu(utl) {
      function tc_smSKAu(v) {
        const ls2 = [];
        for (let i2 = 0; i2 < v.length; i2++) {
          const res2 = utl.asJSONString(v[i2]);
          ls2.push(res2);
        }
        return '[' + ls2.join(',') + ']';
      }
      return tc_smSKAu;
    },
    fn: undefined,
  },
  tc_Y64gwQ: {
    isNoop: false,
    fnID: 'tc',
    jitFnHash: 'tc_Y64gwQ',
    args: {vλl: 'v'},
    defaultParamValues: {vλl: ''},
    code: " function tc_Y64gwQ(v){return '{'+(function(){\n const ls1 = [];\n for (const p1 in v) {\n if (\"vλl\" === p1) continue;\n if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + utl.asJSONString(v[p1]));\n }\n if (!ls1.length) return '';\n return ls1.join(',')+\",\";\n })()+\"\\\"vλl\\\"\"+':'+utl.asJSONString(v[\"vλl\"])+'}'} return tc_Y64gwQ;",
    dependenciesSet: new Set(),
    pureFnDependencies: new Set(),
    closureFn: function closure_tc_Y64gwQ(utl) {
      function tc_Y64gwQ(v) {
        return (
          '{' +
          (function () {
            const ls1 = [];
            for (const p1 in v) {
              if ('vλl' === p1) continue;
              if (p1 !== undefined) ls1.push(utl.asJSONString(p1) + ':' + utl.asJSONString(v[p1]));
            }
            if (!ls1.length) return '';
            return ls1.join(',') + ',';
          })() +
          '"vλl"' +
          ':' +
          utl.asJSONString(v['vλl']) +
          '}'
        );
      }
      return tc_Y64gwQ;
    },
    fn: undefined,
  },
};

// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY
// NOTE exported constant name must be 'cΦmpilεdCachε' and file can not contain any other code
export const cΦmpilεdCachεPure = {
  pf_sanitizeCompiledFn: {
    paramNames: [],
    code: "const anonymousRegex = /^\\s*function\\s+anonymous\\s*\\(/;\n return function sanitizeCompiled(fnCode) {\n if (anonymousRegex.test(fnCode)) {\n return fnCode.replace(anonymousRegex, 'function (');\n }\n return fnCode;\n };",
    pureFnHash: 'pf_sanitizeCompiledFn',
    dependencies: new Set(),
    closureFn: function closure_pf_sanitizeCompiledFn(utl) {
      const anonymousRegex = /^\s*function\s+anonymous\s*\(/;
      return function sanitizeCompiled(fnCode) {
        if (anonymousRegex.test(fnCode)) {
          return fnCode.replace(anonymousRegex, 'function (');
        }
        return fnCode;
      };
    },
    fn: undefined,
  },
};

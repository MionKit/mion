declare const plugin: {
    rules: {
        'no-typeof-runtype': import('@typescript-eslint/utils/ts-eslint').RuleModule<"noTypeof", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
        'strong-typed-routes': import('@typescript-eslint/utils/ts-eslint').RuleModule<"missingReturnType" | "missingParamTypes" | "missingReturnTypeRouter" | "missingParamTypesRouter", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
        'no-unreachable-union-types': import('@typescript-eslint/utils/ts-eslint').RuleModule<"unreachableUnionType", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
        'no-mixed-union-properties': import('@typescript-eslint/utils/ts-eslint').RuleModule<"mixedUnionProperties", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
        'no-type-imports': import('@typescript-eslint/utils/ts-eslint').RuleModule<"noTypeImports", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
        'pure-functions': import('@typescript-eslint/utils/ts-eslint').RuleModule<"purityThis" | "purityAwait" | "purityYield" | "purityDynamicImport" | "purityForbiddenIdentifier" | "purityClosureVariable" | "importedArgument" | "unresolvedArgument", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
        'type-formats-imports': import('@typescript-eslint/utils/ts-eslint').RuleModule<"typeFormatsImports", [], unknown, import('@typescript-eslint/utils/ts-eslint').RuleListener>;
    };
    configs: Record<string, unknown>;
};
export default plugin;

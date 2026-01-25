declare const plugin: {
    rules: {
        'no-typeof-runtype': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"noTypeof", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
        'strong-typed-routes': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"missingReturnType" | "missingParamTypes" | "missingReturnTypeRouter" | "missingParamTypesRouter", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
        'no-unreachable-union-types': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"unreachableUnionType", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
        'no-mixed-union-properties': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"mixedUnionProperties", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
        'no-type-imports': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"noTypeImports", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
    };
    configs: {
        recommended: {
            extends: never[];
            rules: {
                '@mionkit/no-typeof-runtype': string;
                '@mionkit/strong-typed-routes': string;
                '@mionkit/no-unreachable-union-types': string;
                '@mionkit/no-type-imports': string;
            };
        };
    };
};
export default plugin;

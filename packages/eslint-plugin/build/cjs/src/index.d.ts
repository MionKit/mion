declare const plugin: {
    rules: {
        'no-typeof-runtype': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"noTypeof", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
        'strong-typed-routes': import('@typescript-eslint/utils/dist/ts-eslint').RuleModule<"missingReturnType" | "missingParamTypes" | "missingReturnTypeRouter" | "missingParamTypesRouter", [], unknown, import('@typescript-eslint/utils/dist/ts-eslint').RuleListener>;
    };
    configs: {
        recommended: {
            extends: never[];
            rules: {
                '@mionkit/no-typeof-runtype': string;
                '@mionkit/strong-typed-routes': string;
            };
        };
    };
};
export default plugin;

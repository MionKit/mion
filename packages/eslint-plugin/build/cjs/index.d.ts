declare const plugin: {
    rules: {
        'no-typeof-runtype': import("@typescript-eslint/utils/dist/ts-eslint").RuleModule<"noTypeof", [], unknown, import("@typescript-eslint/utils/dist/ts-eslint").RuleListener>;
    };
    configs: {
        recommended: {
            extends: never[];
            rules: {
                '@mionkit/no-typeof-runtype': string;
            };
        };
    };
};
export default plugin;

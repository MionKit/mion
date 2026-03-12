import { TSESLint } from '@typescript-eslint/utils';
export interface Options {
    backendSources: string[];
}
type MessageIds = 'enforceTypeImport' | 'enforceTypeExport' | 'sideEffectImport';
declare const rule: TSESLint.RuleModule<MessageIds, [Options]>;
export default rule;

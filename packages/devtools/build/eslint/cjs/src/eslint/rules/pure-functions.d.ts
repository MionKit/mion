import { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'purityThis' | 'purityAwait' | 'purityYield' | 'purityDynamicImport' | 'purityForbiddenIdentifier' | 'purityClosureVariable';
declare const rule: TSESLint.RuleModule<MessageIds, []>;
export default rule;

import { TSESLint } from '@typescript-eslint/utils';
type MessageIds = 'missingPureFnName' | 'missingMapFromName' | 'nameNotStringLiteral' | 'registerPureFnFactoryNotAllowed';
declare const rule: TSESLint.RuleModule<MessageIds, []>;
export default rule;

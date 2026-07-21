import {TypeFormat} from '@mionjs/run-types';

// FormatDomainStrict is no longer generic; custom domain constraints are expressed with a
// direct TypeFormat<string, 'domain', Params> annotation (strict defaults spelled out).
type SocialMediaParams = {
    maxLength: 200;
    minParts: 2;
    maxParts: 3;
    names: {maxLength: 20; minLength: 2};
    tld: {maxLength: 3; minLength: 2};
};
type SocialMediaDomain = TypeFormat<string, 'domain', SocialMediaParams>;

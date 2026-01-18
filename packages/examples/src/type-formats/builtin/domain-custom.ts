import {StrDomainStrict} from '@mionkit/type-formats/FormatsString';

type SocialMediaDomain = StrDomainStrict<{
    maxLength: 200;
    minParts: 2;
    maxParts: 3;
    names: {
        allowedValues: {
            val: ['facebook', 'twitter', 'instagram', 'linkedin'];
            errorMessage: 'Only social media domains allowed';
        };
    };
    tld: {
        allowedValues: {
            val: ['com'];
            errorMessage: 'Only .com TLD allowed';
        };
    };
}>;


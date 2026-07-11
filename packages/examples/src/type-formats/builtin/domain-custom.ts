import {FormatDomainStrict} from '@mionjs/type-formats/StringFormats';

type SocialMediaDomain = FormatDomainStrict<{
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

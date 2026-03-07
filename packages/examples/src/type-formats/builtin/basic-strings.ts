import {
    FormatAlphaNumeric,
    FormatAlpha,
    FormatNumeric,
    FormatLowercase,
    FormatUppercase,
} from '@mionjs/type-formats/StringFormats';

type Username = FormatAlphaNumeric; // Letters and numbers only
type Name = FormatAlpha; // Letters only (supports Unicode)
type Code = FormatNumeric; // Digits only
type Slug = FormatLowercase; // Forced lowercase
type Initials = FormatUppercase; // Forced uppercase

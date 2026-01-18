import {StrAlphaNumeric, StrAlpha, StrNumeric, StrLowercase, StrUppercase} from '@mionkit/type-formats/FormatsString';

type Username = StrAlphaNumeric; // Letters and numbers only
type Name = StrAlpha; // Letters only (supports Unicode)
type Code = StrNumeric; // Digits only
type Slug = StrLowercase; // Forced lowercase
type Initials = StrUppercase; // Forced uppercase


import {AlphaNumeric, Alpha, Numeric, Lowercase, Uppercase} from '@ts-runtypes/core/formats';

type Username = AlphaNumeric; // Letters and numbers only
type Name = Alpha; // Letters only (supports Unicode)
type Code = Numeric; // Digits only
type Slug = Lowercase; // Forced lowercase
type Initials = Uppercase; // Forced uppercase

"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const RUN_TYPES_FORMAT_TYPES = /* @__PURE__ */ new Set(["TypeFormat"]);
const TYPE_FORMATS_FORMAT_TYPES = /* @__PURE__ */ new Set([
  // Number formats (numberFormat.runtype.ts + defaultNumberFormats.ts)
  "NumFormat",
  "NumInteger",
  "NumFloat",
  "NumPositive",
  "NumNegative",
  "NumPositiveInt",
  "NumNegativeInt",
  "NumInt8",
  "NumInt16",
  "NumInt32",
  "NumUInt8",
  "NumUInt16",
  "NumUInt32",
  // BigInt formats (bigIntFormat.runtype.ts + defaultBigNumberFormats.ts)
  "BigNumFormat",
  "BigNumPositive",
  "BigNumNegative",
  "BigNumPositiveInt",
  "BigNumNegativeInt",
  "BigNumInt64",
  "BigNUmUInt64",
  // String format base (stringFormat.runtype.ts)
  "StrFormat",
  // Date/Time formats (date.runtype.ts, time.runtype.ts, dateTime.runtype.ts)
  "StrDate",
  "StrTime",
  "StrDateTime",
  // Email formats (email.runtype.ts)
  "StrEmail",
  "StrEmailStrict",
  "StrEmailPattern",
  "StrEmailPunycode",
  // Domain formats (domain.runtype.ts)
  "StrDomain",
  "StrDomainStrict",
  // URL formats (url.runtype.ts)
  "StrUrl",
  "StrUrlFile",
  "StrUrlHttp",
  "StrUrlSocialMedia",
  // IP formats (ip.runtype.ts)
  "StrIP",
  "StrIPv4",
  "StrIPv6",
  "StrIPWithPort",
  "StrIPv4WithPort",
  "StrIPv6WithPort",
  // UUID formats (uuid.runtype.ts)
  "StrUUIDv4",
  "StrUUIDv7",
  // Default string formats (defaultStringFormats.runtype.ts)
  "StrAlphaNumeric",
  "StrAlpha",
  "StrNumeric",
  "StrLowercase",
  "StrUppercase",
  "StrCapitalize"
]);
const FORMAT_TYPES_BY_PACKAGE = /* @__PURE__ */ new Map([
  ["@mionkit/run-types", RUN_TYPES_FORMAT_TYPES],
  ["@mionkit/type-formats", TYPE_FORMATS_FORMAT_TYPES]
]);
exports.FORMAT_TYPES_BY_PACKAGE = FORMAT_TYPES_BY_PACKAGE;
exports.RUN_TYPES_FORMAT_TYPES = RUN_TYPES_FORMAT_TYPES;
exports.TYPE_FORMATS_FORMAT_TYPES = TYPE_FORMATS_FORMAT_TYPES;
//# sourceMappingURL=formatTypeNames.cjs.map

const RUN_TYPES_FORMAT_TYPES = /* @__PURE__ */ new Set(["TypeFormat"]);
const TYPE_FORMATS_FORMAT_TYPES = /* @__PURE__ */ new Set([
  // Number formats (numberFormat.runtype.ts + defaultNumberFormats.ts)
  "FormatNumber",
  "FormatInteger",
  "FormatFloat",
  "FormatPositive",
  "FormatNegative",
  "FormatPositiveInt",
  "FormatNegativeInt",
  "FormatInt8",
  "FormatInt16",
  "FormatInt32",
  "FormatUInt8",
  "FormatUInt16",
  "FormatUInt32",
  // BigInt formats (bigIntFormat.runtype.ts + defaultBigNumberFormats.ts)
  "FormatBigInt",
  "FormatBigPositive",
  "FormatBigNegative",
  "FormatBigPositiveInt",
  "FormatBigNegativeInt",
  "FormatBigInt64",
  "FormatBigUInt64",
  // String format base (stringFormat.runtype.ts)
  "FormatString",
  // Date/Time formats (date.runtype.ts, time.runtype.ts, dateTime.runtype.ts)
  "FormatStringDate",
  "FormatStringTime",
  "FormatStringDateTime",
  // Email formats (email.runtype.ts)
  "FormatEmail",
  "FormatEmailStrict",
  "FormatEmailPattern",
  "FormatEmailPunycode",
  // Domain formats (domain.runtype.ts)
  "FormatDomain",
  "FormatDomainStrict",
  // URL formats (url.runtype.ts)
  "FormatUrl",
  "FormatUrlFile",
  "FormatUrlHttp",
  "FormatUrlSocialMedia",
  // IP formats (ip.runtype.ts)
  "FormatIP",
  "FormatIPv4",
  "FormatIPv6",
  "FormatIPWithPort",
  "FormatIPv4WithPort",
  "FormatIPv6WithPort",
  // UUID formats (uuid.runtype.ts)
  "FormatUUIDv4",
  "FormatUUIDv7",
  // Default string formats (defaultStringFormats.runtype.ts)
  "FormatAlphaNumeric",
  "FormatAlpha",
  "FormatNumeric",
  "FormatLowercase",
  "FormatUppercase",
  "FormatCapitalize"
]);
const FORMAT_TYPES_BY_PACKAGE = /* @__PURE__ */ new Map([
  ["@mionkit/run-types", RUN_TYPES_FORMAT_TYPES],
  ["@mionkit/type-formats", TYPE_FORMATS_FORMAT_TYPES]
]);
export {
  FORMAT_TYPES_BY_PACKAGE,
  RUN_TYPES_FORMAT_TYPES,
  TYPE_FORMATS_FORMAT_TYPES
};
//# sourceMappingURL=formatTypeNames.js.map

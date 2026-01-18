import {StrIP, StrIPv4, StrIPv6, StrIPWithPort} from '@mionkit/type-formats/FormatsString';

type AnyIP = StrIP; // IPv4 or IPv6
type OnlyV4 = StrIPv4; // IPv4 only
type OnlyV6 = StrIPv6; // IPv6 only
type WithPort = StrIPWithPort; // Any IP with port support

// Examples
'192.168.0.1'; // ✓ StrIPv4
'2001:0db8:85a3::8a2e:0370:7334'; // ✓ StrIPv6
'localhost'; // ✓ (when allowLocalHost: true)


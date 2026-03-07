import {FormatIP, FormatIPv4, FormatIPv6, FormatIPWithPort} from '@mionjs/type-formats/StringFormats';

type AnyIP = FormatIP; // IPv4 or IPv6
type OnlyV4 = FormatIPv4; // IPv4 only
type OnlyV6 = FormatIPv6; // IPv6 only
type WithPort = FormatIPWithPort; // Any IP with port support

// Examples
('192.168.0.1'); // ✓ FormatIPv4
('2001:0db8:85a3::8a2e:0370:7334'); // ✓ FormatIPv6
('localhost'); // ✓ (when allowLocalHost: true)

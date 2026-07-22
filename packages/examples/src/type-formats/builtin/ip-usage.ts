import {IP, IPv4, IPv6, IPWithPort} from '@ts-runtypes/core/formats';

type AnyIP = IP; // IPv4 or IPv6
type OnlyV4 = IPv4; // IPv4 only
type OnlyV6 = IPv6; // IPv6 only
type WithPort = IPWithPort; // Any IP with port support

// Examples
('192.168.0.1'); // ✓ IPv4
('2001:0db8:85a3::8a2e:0370:7334'); // ✓ IPv6
('localhost'); // ✓ (when allowLocalHost: true)

import {StrUUIDv4, StrUUIDv7} from '@mionkit/type-formats/FormatsString';

type UserId = StrUUIDv4; // Standard UUID v4: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx
type EventId = StrUUIDv7; // Time-ordered UUID v7: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx

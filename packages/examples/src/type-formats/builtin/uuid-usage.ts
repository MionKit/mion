import {FormatUUIDv4, FormatUUIDv7} from '@mionjs/type-formats/StringFormats';

type UserId = FormatUUIDv4; // Standard UUID v4: xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx
type EventId = FormatUUIDv7; // Time-ordered UUID v7: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx

import {FormatUUIDv7} from '@mionkit/type-formats/StringFormats';

export interface Order {
    id: FormatUUIDv7;
    customer: string;
    total: number;
    status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
    createdAt: Date;
}

export type OrderEvent =
    | {type: 'placed'; orderId: FormatUUIDv7; at: Date}
    | {type: 'paid'; orderId: FormatUUIDv7; at: Date; method: string}
    | {type: 'shipped'; orderId: FormatUUIDv7; at: Date; carrier: string; tracking: string}
    | {type: 'delivered'; orderId: FormatUUIDv7; at: Date}
    | {type: 'cancelled'; orderId: FormatUUIDv7; at: Date; reason: string};

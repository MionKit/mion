import {BigIntRunTypeFormat} from '../FormatsBigint.ts';
import {NumberRunTypeFormat} from '../FormatsNumber.ts';
import {
    DateStringRunTypeFormat,
    DateTimeRunTypeFormat,
    DomainRunTypeFormat,
    EmailRunTypeFormat,
    IPRunTypeFormat,
    StringRunTypeFormat,
    TimeStringRunTypeFormat,
    URLRunTypeFormat,
    UUIDRunTypeFormat,
} from '../FormatsString.ts';

/** Format name constants for type formats - values imported from RunTypeFormat classes */
export const FormatNames = {
    // String formats
    stringFormat: StringRunTypeFormat.id,
    uuid: UUIDRunTypeFormat.id,
    email: EmailRunTypeFormat.id,
    url: URLRunTypeFormat.id,
    domain: DomainRunTypeFormat.id,
    ip: IPRunTypeFormat.id,
    date: DateStringRunTypeFormat.id,
    time: TimeStringRunTypeFormat.id,
    dateTime: DateTimeRunTypeFormat.id,
    // Number formats
    numberFormat: NumberRunTypeFormat.id,
    // BigInt formats
    bigintFormat: BigIntRunTypeFormat.id,
} as const;

export type FormatName = (typeof FormatNames)[keyof typeof FormatNames];

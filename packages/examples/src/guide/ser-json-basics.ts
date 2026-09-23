import {createJsonDecoderFn, createJsonEncoderFn} from '@mionjs/run-types';

// start-basics
type Meetup = {name: string; startsAt: Date};

const encodeMeetup = createJsonEncoderFn<Meetup>();
const decodeMeetup = createJsonDecoderFn<Meetup>();

const json = encodeMeetup({name: 'Launch', startsAt: new Date('2026-01-01')});
// '{"name":"Launch","startsAt":"2026-01-01T00:00:00.000Z"}'

const meetup = decodeMeetup(json!);
// end-basics

export {encodeMeetup, decodeMeetup, meetup};

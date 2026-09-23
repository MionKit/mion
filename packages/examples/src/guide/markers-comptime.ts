import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';

type Flag = {kind: 'on' | 'off'};

// the build picks the generated function from these literals
const isFlag = createValidateFn<Flag>(undefined, {noLiterals: true});
const encode = createJsonEncoderFn<Flag>(undefined, {strategy: 'direct'});

// a computed value is not a literal, so the build fails with a CTA error
const looseAtNight = new Date().getHours() < 6;
createValidateFn<Flag>(undefined, {noLiterals: looseAtNight});

export {isFlag, encode};

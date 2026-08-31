import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';

type Flag = {kind: 'on' | 'off'};

// These options are read by the BUILD, so they must be a literal written right
// at the call site: the build picks the specialized function from what it sees.
const isFlag = createValidateFn<Flag>(undefined, {noLiterals: true});
const encode = createJsonEncoderFn<Flag>(undefined, {strategy: 'direct'});

// A computed value is NOT a literal, so the build can't read it: this line
// fails compilation with a CTA diagnostic.
const looseAtNight = new Date().getHours() < 6;
createValidateFn<Flag>(undefined, {noLiterals: looseAtNight});

export {isFlag, encode};

import {describe, expect, it} from 'vitest';
import {parseCard} from '../src/card.ts';
import {parseNewArgs, starterCard} from '../src/new.ts';

describe('code card: new', () => {
  it('the starter card parses', () => {
    expect(parseCard(starterCard()).title).toBe('*Short title* in one line');
  });

  it('one name, optional --tmp', () => {
    expect(parseNewArgs(['demo'])).toEqual({name: 'demo', tmp: false});
    expect(parseNewArgs(['demo', '--tmp'])).toEqual({name: 'demo', tmp: true});
    expect(() => parseNewArgs([])).toThrow('usage: miondevx card new');
    expect(() => parseNewArgs(['Bad_Name'])).toThrow('lowercase letters');
    expect(() => parseNewArgs(['demo', '--nope'])).toThrow(/Unknown option/);
  });
});

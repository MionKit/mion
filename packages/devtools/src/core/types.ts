// Types shared by more than one core module.

import type {Diagnostic} from './protocol.ts';

export type LogStyle = 'grouped' | 'lines';

export interface Finding {
  diagnostic: Diagnostic;
  downgraded: boolean;
}

// One finding as the grouped log sees it; twin of Go diagnostics.GroupedEntry. Template carries `{slot}` names
// when slots is set, else it is the finished text.
export interface GroupedEntry extends Pick<Diagnostic, 'severity' | 'site' | 'related' | 'downgraded'> {
  name: string;
  template: string;
  slots?: readonly string[];
  args?: readonly string[];
}

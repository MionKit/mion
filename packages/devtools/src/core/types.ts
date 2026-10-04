import type {Diagnostic} from './protocol.ts';

export type LogStyle = 'grouped' | 'lines';

export interface Finding {
  diagnostic: Diagnostic;
  downgraded: boolean;
}

// Twin of Go diagnostics.GroupedEntry; template carries `{slot}` names when slots is set, else the finished text.
export interface GroupedEntry extends Pick<Diagnostic, 'severity' | 'site' | 'related' | 'downgraded'> {
  name: string;
  template: string;
  slots?: readonly string[];
  args?: readonly string[];
}

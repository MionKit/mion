package testfixtures

// RuntimePackages stages node_modules overlays: a script-file package, a `declare global` module package and an ordinary library.
func RuntimePackages() map[string]string {
	return map[string]string{
		"node_modules/@types/node/index.d.ts": `declare module "events" {
  export class EventEmitter {
    on(event: string, listener: () => void): this;
    emit(event: string): boolean;
    [Symbol.iterator](): Iterator<string>;
  }
}
declare namespace NodeJS {
  interface Timeout {
    ref(): this;
    unref(): this;
    hasRef(): boolean;
    [Symbol.toPrimitive](): number;
  }
}
interface URL {
  readonly href: string;
  toString(): string;
}
`,
		"node_modules/@types/handles/index.d.ts": `export {};
declare global {
  interface RuntimeHandle {
    close(): void;
    [Symbol.iterator](): Iterator<string>;
  }
}
`,
		"node_modules/dto-lib/index.d.ts": `export declare class Dto {
  id: string;
}
`,
	}
}

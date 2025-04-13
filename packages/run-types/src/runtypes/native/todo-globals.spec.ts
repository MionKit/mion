/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';

// TODO: ATM we can't correctly identify this types, the generated deepkit type does not have anything to indicate the type is a native type
// some types could be identified by the typeName property, but not all of them.
// Most of these types depend on the typescript types library, ie: lib.es5.d.ts, lib.es2015.d.ts, and so on so might differ from one version to another.
describe.skip('native types that throw when trying to create a RunType', () => {
    /**
     * List of all the types that throw when trying to create a RunType:
     * JSON, Worker, Math, Reflect, Proxy, Intl, Atomics, WebAssembly, WebAssembly.Module, WebAssembly.Instance, WebAssembly.Memory, WebAssembly.Table, WebAssembly.CompileError, WebAssembly.LinkError, WebAssembly.RuntimeError
     *  */

    it('should throw when creating RunType for JSON', () => {
        // src =  kind: 30, id: 1, types: [] } and children  { kind: 30, id: 2, types: [], annotations: {} }
        expect(() => runType<JSON>()).toThrow();
    });

    it('should throw when creating RunType for Worker', () => {
        // src = { kind: 0 } (never)
        expect(() => runType<Worker>()).toThrow();
    });

    it('should throw when creating RunType for Math', () => {
        // src = { kind: 30, with a property for each method and typeName: 'Math'}
        expect(() => runType<Math>()).toThrow();
    });

    it('should throw when creating RunType for Reflect', () => {
        // { kind: 30, types: [], annotations: {}, typeName: undefined}
        expect(() => runType<typeof Reflect>()).toThrow();
    });

    it('should throw when creating RunType for Proxy', () => {
        expect(() => runType<typeof Proxy>()).toThrow();
    });

    it('should throw when creating RunType for Intl', () => {
        expect(() => runType<typeof Intl>()).toThrow();
    });

    it('should throw when creating RunType for Atomics', () => {
        expect(() => runType<typeof Atomics>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly', () => {
        expect(() => runType<typeof WebAssembly>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.Module', () => {
        expect(() => runType<WebAssembly.Module>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.Instance', () => {
        expect(() => runType<WebAssembly.Instance>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.Memory', () => {
        expect(() => runType<WebAssembly.Memory>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.Table', () => {
        expect(() => runType<WebAssembly.Table>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.CompileError', () => {
        expect(() => runType<WebAssembly.CompileError>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.LinkError', () => {
        expect(() => runType<WebAssembly.LinkError>()).toThrow();
    });

    it('should throw when creating RunType for WebAssembly.RuntimeError', () => {
        expect(() => runType<WebAssembly.RuntimeError>()).toThrow();
    });
});

// A look-alike that is NOT ours. The toolchain matches the marker by name
// AND by declaring module (mion), so this local one is
// inert: no injection happens at call sites that use it.
type InjectRunTypeId<T> = string & {__myOwnBrand?: T};

function homemade<T>(id?: InjectRunTypeId<T>): string {
  // `id` stays undefined: the build never touches this.
  return id ?? 'nothing injected';
}

homemade<number>(); // returns 'nothing injected'

export {homemade};

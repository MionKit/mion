package purefunctions

import "testing"

func TestStripComments(t *testing.T) {
	cases := []struct {
		name, source, want string
	}{
		{
			name: "own-line comments go with their line",
			source: `export const x = function () {
  // leading note
  const a = 1;
  /* block note
     on two lines */
  return a;
};`,
			want: "const a = 1;\n  return a;",
		},
		{
			name: "trailing line comment goes with the spaces before it",
			source: `export const x = function () {
  const a = 1; // why one
  return a;
};`,
			want: "const a = 1;\n  return a;",
		},
		{
			name: "inline block comment keeps tokens apart",
			source: `export const x = function () {
  return typeof/**/a;
};`,
			want: "return typeof a;",
		},
		{
			name: "block comment holding a newline still ends a return",
			source: `export const x = function () {
  return /*
  */ 1;
};`,
			want: "return \n 1;",
		},
		{
			name:   "comment markers inside literals stay",
			source: "export const x = function () {\n  const a = '// not a comment';\n  const b = \"/* nor this */\";\n  return [a, b];\n};",
			want:   "const a = '// not a comment';\n  const b = \"/* nor this */\";\n  return [a, b];",
		},
		{
			name: "comment markers inside a regex stay",
			source: `export const x = function () {
  const slashes = /[//*]+/g;
  return 1 / 2 / slashes.source.length; // ratio
};`,
			want: "const slashes = /[//*]+/g;\n  return 1 / 2 / slashes.source.length;",
		},
		{
			name:   "comment markers inside template text stay, comments in substitutions go",
			source: "export const x = function (a: string) {\n  return `${a /* drop */}//${ {k: 1}.k }/* keep */`;\n};",
			want:   "return `${a }//${ {k: 1}.k }/* keep */`;",
		},
		{
			name: "arrow expression body",
			source: `export const x = (a: number) => /* note */ a + 1 // done
;`,
			want: "return a + 1;",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := stripFactoryBody(t, tc.source); got != tc.want {
				t.Errorf("got:\n%q\nwant:\n%q", got, tc.want)
			}
		})
	}
}

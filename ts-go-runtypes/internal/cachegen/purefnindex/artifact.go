package purefnindex

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// ArtifactFormat is the `format` a build writes into the artifact index. A
// reader accepts this value and below; a higher one comes from a newer compiler
// and the directory is skipped with a warning rather than misread.
const ArtifactFormat = 1

// ArtifactIndex is `index.json` inside the artifact directory a mion build
// writes into its output directory (constants.PureFnArtifactDir): the package's
// own pure functions by id, each with the binding its registration was assigned
// to and its source file. It is the one file a consumer's compiler reads on
// first touch of a package: a `.d.ts` import carries a NAME, never an id, so
// the name-to-id map has to come from somewhere without opening every module.
// The bodies live beside it, one cache module per id (ModulePath), read only
// for the ids a build demands.
type ArtifactIndex struct {
	Format  int                `json:"format"`
	Package string             `json:"package"`
	PureFns []ArtifactIndexRow `json:"pureFns"`
}

// ArtifactIndexRow is one pure function: its id verbatim (never recomputed by
// a consumer), the binding the registration was assigned to (how an untyped
// `.d.ts` name maps back to the id), and the source file relative to the
// package root (diagnostics, and the tiebreaker between two rows sharing a
// name).
type ArtifactIndexRow struct {
	ID          string `json:"id"`
	BindingName string `json:"bindingName,omitempty"`
	File        string `json:"file,omitempty"`
}

// ErrArtifactNewerFormat marks an index written by a newer compiler.
var ErrArtifactNewerFormat = errors.New("newer artifact format")

// RenderArtifactIndex writes the index for packageName from the package's OWN
// entries (the caller filters them), sorted by id so the bytes are stable
// across runs. Nil when there is nothing to write: an app with no pure fn gets
// no directory. File paths are made relative to packageRoot.
func RenderArtifactIndex(packageName, packageRoot string, entries []purefunctions.Entry) []byte {
	if len(entries) == 0 {
		return nil
	}
	rows := make([]ArtifactIndexRow, 0, len(entries))
	for _, entry := range entries {
		rows = append(rows, ArtifactIndexRow{ID: entry.ID, BindingName: entry.BindingName, File: relativeToRoot(packageRoot, entry.FilePath)})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	var payload bytes.Buffer
	encoder := json.NewEncoder(&payload)
	// A file path or a binding name may hold `<` or `&`; the default HTML
	// escaping would keep the file valid but unreadable, and nothing serves
	// it as HTML.
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(ArtifactIndex{Format: ArtifactFormat, Package: packageName, PureFns: rows}); err != nil {
		// Strings always marshal; this cannot happen.
		panic(fmt.Sprintf("render %s: %v", constants.PureFnArtifactIndexFile, err))
	}
	return payload.Bytes()
}

// ParseArtifactIndex decodes an index and checks it is one: the known format,
// a package name, and every row an id that package owns. A newer format is
// ErrArtifactNewerFormat, so the reader can say so instead of treating the
// package as unbuilt in silence.
func ParseArtifactIndex(content []byte) (ArtifactIndex, error) {
	var index ArtifactIndex
	if err := json.Unmarshal(content, &index); err != nil {
		return ArtifactIndex{}, fmt.Errorf("not valid JSON: %w", err)
	}
	if index.Format > ArtifactFormat {
		return ArtifactIndex{}, fmt.Errorf("%w %d (this compiler reads up to %d)", ErrArtifactNewerFormat, index.Format, ArtifactFormat)
	}
	if index.Format < 1 {
		return ArtifactIndex{}, errors.New("missing `format`")
	}
	if index.Package == "" {
		return ArtifactIndex{}, errors.New("missing `package`")
	}
	for _, row := range index.PureFns {
		if PackageOfID(row.ID) != index.Package {
			return ArtifactIndex{}, fmt.Errorf("row %q is not owned by %q", row.ID, index.Package)
		}
	}
	return index, nil
}

// ModulePath is where a pure fn's cache module sits inside the artifact
// directory: the module's basename (`pf/@acme/text/<hash>`) without the `pf/`
// segment the directory stands for, plus the module extension. The path is
// derived from the id, so the index needs no path per row, and it is the same
// file generate writes under `<genDir>/types/pf/`.
func ModulePath(id string) string {
	basename := entrymodules.ModuleName(id, entrymodules.KindPureFn)
	return strings.TrimPrefix(basename, constants.PureFnModuleDir+"/") + constants.EntryModuleSuffix
}

// IsArtifactDir reports whether a directory entry is the artifact directory.
func IsArtifactDir(name string) bool { return name == constants.PureFnArtifactDir }

// tupleKindPureFn is slot 0 of a pure-fn entry tuple (entrymodules.KindPureFn,
// entryTuple.ts KIND_PURE_FN); the literal is compared as text.
const tupleKindPureFn = "2"

// Tuple slots after the shared head (kind, deps thunk, footer). Mirrors
// purefunctions.CollectEntries: key, paramNames, code, deps, factory.
const (
	slotKey     = 3
	slotParams  = 4
	slotCode    = 5
	slotDeps    = 6
	slotFactory = 7
)

// ReadModule reads one pure fn's served row off its cache module: the module a
// build wrote for id, whatever emit mode that build used. The import block is
// ignored (a dep's module may sit in another package), and the tuple is read
// by slot. A module holding no tuple, or a tuple for another id, is an error
// naming what was found, so a stale or misplaced copy is reported rather than
// served.
func ReadModule(id, content string) (purefunctions.Entry, error) {
	// The parser wants an absolute name; the module's own path is not one.
	path := "/" + ModulePath(id)
	sourceFile := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: path, Path: tspath.Path(path)}, content, core.ScriptKindJS)
	if sourceFile == nil {
		return purefunctions.Entry{}, errors.New("could not be parsed")
	}
	var found *purefunctions.Entry
	var other string
	var visit ast.Visitor
	visit = func(node *ast.Node) bool {
		if node == nil || found != nil {
			return false
		}
		if node.Kind == ast.KindArrayLiteralExpression {
			if entry, ok := tupleEntry(node, content); ok {
				if entry.ID == id {
					found = &entry
					return false
				}
				other = entry.ID
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	if found == nil {
		if other != "" {
			return purefunctions.Entry{}, fmt.Errorf("holds the tuple of %q, not %q", other, id)
		}
		return purefunctions.Entry{}, errors.New("holds no pure-fn tuple")
	}
	return served(*found), nil
}

// tupleEntry reads a pure-fn entry tuple off an array literal: slot 0 the kind
// `2`, slot 3 the id, then paramNames, code and deps. In `functions` emit mode
// the code slot is a hole and the body is the function literal in the factory
// slot, whose block text is exactly the code the build wrote.
func tupleEntry(node *ast.Node, content string) (purefunctions.Entry, bool) {
	elements := node.AsArrayLiteralExpression().Elements.Nodes
	if len(elements) <= slotDeps {
		return purefunctions.Entry{}, false
	}
	if elements[0].Kind != ast.KindNumericLiteral || elements[0].Text() != tupleKindPureFn || !isStringLiteral(elements[slotKey]) {
		return purefunctions.Entry{}, false
	}
	if _, _, isID := purefunctions.SplitID(elements[slotKey].Text()); !isID {
		return purefunctions.Entry{}, false
	}
	paramNames, ok := stringArray(elements[slotParams])
	if !ok {
		return purefunctions.Entry{}, false
	}
	deps, ok := stringArray(elements[slotDeps])
	if !ok {
		return purefunctions.Entry{}, false
	}
	code := ""
	switch {
	case isStringLiteral(elements[slotCode]):
		code = elements[slotCode].Text()
	case len(elements) > slotFactory && ast.IsFunctionLike(elements[slotFactory]) && elements[slotFactory].Body() != nil:
		body := elements[slotFactory].Body()
		text := strings.TrimSpace(content[body.Pos():body.End()])
		if !strings.HasPrefix(text, "{") || !strings.HasSuffix(text, "}") {
			return purefunctions.Entry{}, false
		}
		code = text[1 : len(text)-1]
	default:
		return purefunctions.Entry{}, false
	}
	return purefunctions.Entry{
		ID:                 elements[slotKey].Text(),
		ParamNames:         paramNames,
		Code:               code,
		PureFnDependencies: deps,
	}, true
}

func isStringLiteral(node *ast.Node) bool {
	return node != nil && (node.Kind == ast.KindStringLiteral || node.Kind == ast.KindNoSubstitutionTemplateLiteral)
}

func stringArray(node *ast.Node) ([]string, bool) {
	if node == nil || node.Kind != ast.KindArrayLiteralExpression {
		return nil, false
	}
	elements := node.AsArrayLiteralExpression().Elements.Nodes
	out := make([]string, 0, len(elements))
	for _, element := range elements {
		if !isStringLiteral(element) {
			return nil, false
		}
		out = append(out, element.Text())
	}
	return out, true
}

func relativeToRoot(root, path string) string {
	if path == "" || root == "" {
		return ""
	}
	root = tspath.NormalizePath(root)
	path = tspath.NormalizePath(path)
	if rel, ok := strings.CutPrefix(path, root+"/"); ok {
		return rel
	}
	return path
}

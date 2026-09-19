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

// ArtifactFormat is the index's `format`; a higher one is a newer compiler's and is skipped with a warning, never misread.
const ArtifactFormat = 1

// ArtifactIndex is `index.json` in constants.PureFnArtifactDir, the one file a consumer's compiler reads on
// first touch of a package: a `.d.ts` import carries a NAME, never an id. Modules (ModulePath) are read on demand.
type ArtifactIndex struct {
	Format  int                `json:"format"`
	Package string             `json:"package"`
	PureFns []ArtifactIndexRow `json:"pureFns"`
}

// ArtifactIndexRow is one pure fn: its id verbatim (a consumer never recomputes it), the binding an untyped
// `.d.ts` name maps through, and its file relative to the package root, the tiebreak between two rows sharing a name.
type ArtifactIndexRow struct {
	ID          string `json:"id"`
	BindingName string `json:"bindingName,omitempty"`
	File        string `json:"file,omitempty"`
}

// ErrArtifactNewerFormat marks an index written by a newer compiler.
var ErrArtifactNewerFormat = errors.New("newer artifact format")

// RenderArtifactIndex renders the index from the package's OWN entries (the caller filters them), sorted by id
// so the bytes are stable across runs; nil when empty, so an app with no pure fn gets no directory.
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
	// Nothing serves this as HTML, and escaping `<` or `&` in a path or name would only make it unreadable.
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(ArtifactIndex{Format: ArtifactFormat, Package: packageName, PureFns: rows}); err != nil {
		// Strings always marshal; this cannot happen.
		panic(fmt.Sprintf("render %s: %v", constants.PureFnArtifactIndexFile, err))
	}
	return payload.Bytes()
}

// ParseArtifactIndex decodes an index and checks it is one. A newer format is ErrArtifactNewerFormat, so the
// reader can say so instead of treating the package as unbuilt in silence.
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

// ModulePath is a pure fn's module path inside the artifact dir: derived from the id, so the index carries no
// path per row, and the same file generate writes under `<genDir>/types/pf/` minus the `pf/` segment.
func ModulePath(id string) string {
	basename := entrymodules.ModuleName(id, entrymodules.KindPureFn)
	return strings.TrimPrefix(basename, constants.PureFnModuleDir+"/") + constants.EntryModuleSuffix
}

// IsArtifactDir reports whether a directory entry is the artifact directory.
func IsArtifactDir(name string) bool { return name == constants.PureFnArtifactDir }

// tupleKindPureFn mirrors entrymodules.KindPureFn (entryTuple.ts KIND_PURE_FN) as the text the literal is compared by.
const tupleKindPureFn = "2"

// Tuple slots after the shared head (kind, deps thunk, footer); mirrors purefunctions.CollectEntries.
const (
	slotKey     = 3
	slotParams  = 4
	slotCode    = 5
	slotDeps    = 6
	slotFactory = 7
)

// ReadModule reads a pure fn's served row off the cache module a build wrote for id, in any emit mode. Imports are
// ignored (a dep's module may sit in another package); no tuple, or another id's, is an error, so a stale or
// misplaced copy is reported rather than served.
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

// tupleEntry reads a tuple by slot; in `functions` emit mode the code slot is a hole and the factory literal's
// block text is the code the build wrote.
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

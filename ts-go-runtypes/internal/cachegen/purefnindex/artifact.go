package purefnindex

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// ArtifactFormat is the `format` a build writes into the artifact. A reader
// accepts this value and below; a higher one comes from a newer compiler and
// the file is skipped with a warning rather than misread.
const ArtifactFormat = 1

// Artifact is the file a mion build writes into its output directory
// (constants.PureFnArtifactFileName): the package's own pure functions and
// nothing else, so a consumer's compiler reads only this file and never a
// bundle. JSON, because nothing imports it: it is build-time input, read with
// no parser, and re-rendered in the CONSUMER's emit mode and module layout.
type Artifact struct {
	Format  int           `json:"format"`
	Package string        `json:"package"`
	PureFns []ArtifactRow `json:"pureFns"`
}

// ArtifactRow is one pure function: its id verbatim (never recomputed by a
// consumer), the binding the registration was assigned to (how an untyped
// `.d.ts` name maps back to the id), the source file relative to the package
// root (diagnostics, and the tiebreaker between two rows sharing a name), and
// the factory the runtime rebuilds from ParamNames + Code.
type ArtifactRow struct {
	ID                 string   `json:"id"`
	BindingName        string   `json:"bindingName,omitempty"`
	File               string   `json:"file,omitempty"`
	ParamNames         []string `json:"paramNames"`
	Code               string   `json:"code"`
	PureFnDependencies []string `json:"pureFnDependencies"`
}

// ErrArtifactNewerFormat marks an artifact written by a newer compiler.
var ErrArtifactNewerFormat = errors.New("newer artifact format")

// RenderArtifact writes the artifact for packageName from the package's OWN
// entries (the caller filters them), sorted by id so the bytes are stable
// across runs. Nil when there is nothing to write: an app with no pure fn gets
// no file. File paths are made relative to packageRoot.
func RenderArtifact(packageName, packageRoot string, entries []purefunctions.Entry) []byte {
	if len(entries) == 0 {
		return nil
	}
	rows := make([]ArtifactRow, 0, len(entries))
	for _, entry := range entries {
		rows = append(rows, ArtifactRow{
			ID:                 entry.ID,
			BindingName:        entry.BindingName,
			File:               relativeToRoot(packageRoot, entry.FilePath),
			ParamNames:         nonNil(entry.ParamNames),
			Code:               entry.Code,
			PureFnDependencies: nonNil(entry.PureFnDependencies),
		})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].ID < rows[j].ID })
	var payload bytes.Buffer
	encoder := json.NewEncoder(&payload)
	// A body is JavaScript, full of `<`, `>` and `&`; escaping them as \u003c
	// would keep the file valid but unreadable, and nothing serves it as HTML.
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(Artifact{Format: ArtifactFormat, Package: packageName, PureFns: rows}); err != nil {
		// Strings and string slices always marshal; this cannot happen.
		panic(fmt.Sprintf("render %s: %v", constants.PureFnArtifactFileName, err))
	}
	return payload.Bytes()
}

// ParseArtifact decodes an artifact and checks it is one: the known format, a
// package name, and every row an id that package owns. A newer format is
// ErrArtifactNewerFormat, so the reader can say so instead of treating the
// package as unbuilt in silence.
func ParseArtifact(content []byte) (Artifact, error) {
	var artifact Artifact
	if err := json.Unmarshal(content, &artifact); err != nil {
		return Artifact{}, fmt.Errorf("not valid JSON: %w", err)
	}
	if artifact.Format > ArtifactFormat {
		return Artifact{}, fmt.Errorf("%w %d (this compiler reads up to %d)", ErrArtifactNewerFormat, artifact.Format, ArtifactFormat)
	}
	if artifact.Format < 1 {
		return Artifact{}, errors.New("missing `format`")
	}
	if artifact.Package == "" {
		return Artifact{}, errors.New("missing `package`")
	}
	for _, row := range artifact.PureFns {
		if PackageOfID(row.ID) != artifact.Package {
			return Artifact{}, fmt.Errorf("row %q is not owned by %q", row.ID, artifact.Package)
		}
	}
	return artifact, nil
}

// Entry projects a row to the served entry shape.
func (row ArtifactRow) Entry() purefunctions.Entry {
	return served(purefunctions.Entry{
		ID:                 row.ID,
		BindingName:        row.BindingName,
		ParamNames:         row.ParamNames,
		Code:               row.Code,
		PureFnDependencies: row.PureFnDependencies,
	})
}

// IsArtifactFile reports whether a directory entry is the artifact.
func IsArtifactFile(name string) bool { return name == constants.PureFnArtifactFileName }

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

func nonNil(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}

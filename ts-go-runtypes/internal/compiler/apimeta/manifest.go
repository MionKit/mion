package apimeta

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
)

// `<genDir>/api/manifest.json`, the id table BOTH builds write: the server from its `initRoutes(...)`
// calls, a client under `bundleApi` from the routes it bundled. `mion api-check` compares the two files,
// so a split deployment can prove before a release that the client's bundled validators are the server's.

const (
	ManifestKindServer = "server"
	ManifestKindClient = "client"
)

// ManifestMethod is one method's row: what decides whether the client's compiled functions equal the server's.
type ManifestMethod struct {
	Type      int    `json:"type"`
	ParamsId  string `json:"paramsId"`
	ReturnId  string `json:"returnId"`
	HeadersId string `json:"headersId,omitempty"`
	// Families demanded for the params and return types, in demand order (the server's marker slots).
	Families []string `json:"families"`
	// Options is the resolved options literal the API type carries.
	Options map[string]any `json:"options"`
	// MiddleFnIds is the route's public middleFn chain in execution order.
	MiddleFnIds []string `json:"middleFnIds,omitempty"`
}

// BuildVersionLength is 12 base-62 characters, ~71 bits: a whole-API fingerprint, where a collision would
// hide a real mismatch, so it is wider than the 7-character per-type ids it is built from.
const BuildVersionLength = 12

// BuildVersion hashes every method row, sorted by id, into the version both ends of one API compare. Derived
// from the types alone (the rows are compiled ids), never from a build stamp, so two builds of one API agree.
func BuildVersion(methods map[string]ManifestMethod) string {
	if len(methods) == 0 {
		return ""
	}
	ids := make([]string, 0, len(methods))
	for id := range methods {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var input strings.Builder
	for _, id := range ids {
		row, err := json.Marshal(methods[id])
		if err != nil {
			panic("apimeta: hashing the manifest row of " + id + ": " + err.Error())
		}
		input.WriteString(id)
		input.WriteByte('=')
		input.Write(row)
		input.WriteByte('\n')
	}
	return hashid.QuickHash(input.String(), BuildVersionLength)
}

// Manifest is the file's shape; Mode and ApiTsconfig are set on a client manifest only. Ambiguous lists the
// ids a server program initializes more than once with differing rows: the first in file order is kept, and
// a client row for such an id never passes the check.
type Manifest struct {
	Kind        string                    `json:"kind"`
	Mode        string                    `json:"mode,omitempty"`
	ApiTsconfig string                    `json:"apiTsconfig,omitempty"`
	Methods     map[string]ManifestMethod `json:"methods"`
	// BuildVersion is the version this build injects at its `initRoutes` / `initClient` call, so a report
	// can name the value the server answers with.
	BuildVersion string   `json:"buildVersion,omitempty"`
	Ambiguous    []string `json:"ambiguous,omitempty"`
}

// Render is the file's text, keys sorted and newline-terminated, so rewriting the same content is a no-op on disk.
func (manifest *Manifest) Render() string {
	if manifest.Methods == nil {
		manifest.Methods = map[string]ManifestMethod{}
	}
	sort.Strings(manifest.Ambiguous)
	text, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		panic("apimeta: rendering the manifest: " + err.Error())
	}
	return string(text) + "\n"
}

// ReadManifest reads a manifest file and rejects one that carries neither kind.
func ReadManifest(path string) (*Manifest, error) {
	text, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	manifest := &Manifest{}
	if err := json.Unmarshal(text, manifest); err != nil {
		return nil, fmt.Errorf("%s: not a manifest: %w", path, err)
	}
	if manifest.Kind != ManifestKindServer && manifest.Kind != ManifestKindClient {
		return nil, fmt.Errorf("%s: not a manifest: kind %q", path, manifest.Kind)
	}
	if manifest.Methods == nil {
		manifest.Methods = map[string]ManifestMethod{}
	}
	return manifest, nil
}

// Mismatch is one difference api-check reports: the method, the field, and the two values.
type Mismatch struct {
	Id     string
	Field  string
	Client string
	Server string
}

func (mismatch Mismatch) String() string {
	return fmt.Sprintf("%s: %s differs: client %s, server %s", mismatch.Id, mismatch.Field, mismatch.Client, mismatch.Server)
}

// Compare checks every client row against the server manifest, in id order; server methods the client
// never bundled are not checked.
func Compare(client, server *Manifest) []Mismatch {
	ambiguous := map[string]bool{}
	for _, id := range server.Ambiguous {
		ambiguous[id] = true
	}
	ids := make([]string, 0, len(client.Methods))
	for id := range client.Methods {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var out []Mismatch
	for _, id := range ids {
		clientRow := client.Methods[id]
		serverRow, ok := server.Methods[id]
		if !ok {
			out = append(out, Mismatch{Id: id, Field: "method", Client: "bundled", Server: "not declared"})
			continue
		}
		if ambiguous[id] {
			out = append(out, Mismatch{Id: id, Field: "method", Client: "bundled", Server: "declared more than once with different types"})
			continue
		}
		out = append(out, compareRows(id, clientRow, serverRow)...)
	}
	return out
}

// RowsEqual says whether two rows would pass the check.
func RowsEqual(clientRow, serverRow ManifestMethod) bool {
	return len(compareRows("", clientRow, serverRow)) == 0
}

func compareRows(id string, clientRow, serverRow ManifestMethod) []Mismatch {
	var out []Mismatch
	check := func(field, clientValue, serverValue string) {
		if clientValue != serverValue {
			out = append(out, Mismatch{Id: id, Field: field, Client: clientValue, Server: serverValue})
		}
	}
	check("type", fmt.Sprint(clientRow.Type), fmt.Sprint(serverRow.Type))
	check("paramsId", clientRow.ParamsId, serverRow.ParamsId)
	check("returnId", clientRow.ReturnId, serverRow.ReturnId)
	check("headersId", clientRow.HeadersId, serverRow.HeadersId)
	check("families", strings.Join(clientRow.Families, ","), strings.Join(serverRow.Families, ","))
	check("options", canonicalJSON(clientRow.Options), canonicalJSON(serverRow.Options))
	check("middleFnIds", strings.Join(clientRow.MiddleFnIds, ","), strings.Join(serverRow.MiddleFnIds, ","))
	return out
}

// canonicalJSON is the sorted-key form two options literals are compared in.
func canonicalJSON(value any) string {
	text, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprint(value)
	}
	return string(text)
}

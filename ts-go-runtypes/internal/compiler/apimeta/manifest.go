package apimeta

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// The API manifest: `<genDir>/api/manifest.json`, the id table BOTH builds
// write so a split deployment can prove, before a release, that the client's
// bundled validators are the server's. The server build writes it from the
// program's `initRoutes(...)` call(s) (kind "server", every public method);
// a client build under `bundleApi` writes it from the routes it bundled
// (kind "client", those methods only). `mion api-check` compares the two:
// a client row must exist on the server with the same type ids, families,
// options and middleFn chain. Two JSON files, no network and no TypeScript,
// so the check runs wherever both build outputs are.

const (
	ManifestKindServer = "server"
	ManifestKindClient = "client"
)

// ManifestMethod is one method's row: what decides whether the client's
// compiled functions and metadata equal the server's.
type ManifestMethod struct {
	Type      int    `json:"type"`
	ParamsId  string `json:"paramsId"`
	ReturnId  string `json:"returnId"`
	HeadersId string `json:"headersId,omitempty"`
	// Families are the compiled-function families demanded for the params and
	// return types, in demand order (the server's marker slots).
	Families []string `json:"families"`
	// Options is the resolved options literal the API type carries.
	Options map[string]any `json:"options"`
	// MiddleFnIds is a route's public middleFn chain in execution order.
	MiddleFnIds []string `json:"middleFnIds,omitempty"`
}

// Manifest is the file's shape. Mode and ApiTsconfig are set on a client
// manifest only. Ambiguous lists the ids a server program initializes more
// than once with differing rows (several `initRoutes` calls, spec files in
// the program): the row kept is the first in file order, and a client row
// for such an id never passes the check.
type Manifest struct {
	Kind        string                    `json:"kind"`
	Mode        string                    `json:"mode,omitempty"`
	ApiTsconfig string                    `json:"apiTsconfig,omitempty"`
	Methods     map[string]ManifestMethod `json:"methods"`
	Ambiguous   []string                  `json:"ambiguous,omitempty"`
}

// Render is the file's text: indented JSON, keys sorted (encoding/json sorts
// map keys), a trailing newline, so a rewrite with the same content is a
// no-op on disk.
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

// ReadManifest reads and validates a manifest file: it must parse and carry
// one of the two kinds.
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

// Mismatch is one difference api-check reports: the method, the field, and
// the two values as the check saw them.
type Mismatch struct {
	Id     string
	Field  string
	Client string
	Server string
}

func (mismatch Mismatch) String() string {
	return fmt.Sprintf("%s: %s differs: client %s, server %s", mismatch.Id, mismatch.Field, mismatch.Client, mismatch.Server)
}

// Compare checks every client row against the server manifest, in id order:
// the id must exist on the server (and not be ambiguous there), and its type,
// ids, families, options and chain must be equal. Nothing is said about
// server methods the client never bundled.
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
func RowsEqual(a, b ManifestMethod) bool {
	return len(compareRows("", a, b)) == 0
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

// canonicalJSON renders a JSON-shaped value with sorted keys, the form two
// options literals are compared in.
func canonicalJSON(value any) string {
	text, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprint(value)
	}
	return string(text)
}

package protocol

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestRequestExt_Decodes(t *testing.T) {
	var request Request
	if err := json.Unmarshal([]byte(`{"op":"x","files":["a.ts"],"ext":{"checkA":true,"checkB":false,"opts":{"n":1}}}`), &request); err != nil {
		t.Fatal(err)
	}
	if request.Op != "x" || string(request.Ext["opts"]) != `{"n":1}` {
		t.Fatalf("decoded = %+v", request)
	}
	if !ExtFlag("checkA")(request) || ExtFlag("checkB")(request) || ExtFlag("missing")(request) || ExtFlag("opts")(request) {
		t.Fatal("ExtFlag must be true only for a literal true")
	}
}

func TestResponseExt_MarshalsSortedUnderExt(t *testing.T) {
	raw, err := json.Marshal(Response{OK: true, Ext: map[string]any{"zeta": 1, "alpha": []string{"a"}}})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(string(raw)); got != `{"ext":{"alpha":["a"],"zeta":1},"ok":true}` {
		t.Fatalf("marshalled = %s", got)
	}
	raw, _ = json.Marshal(Response{OK: true, Ext: map[string]any{}})
	if strings.Contains(string(raw), "ext") {
		t.Fatalf("an empty Ext must stay off the wire: %s", raw)
	}
}

package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// splitSources is one program holding a server file and a client file, each reflecting a type of its own that
// nests a type both use.
var splitSources = map[string]string{
	"shared.ts": `export type SharedAddress = {sharedStreet: string; sharedZip: number};
`,
	"server.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {SharedAddress} from './shared.ts';
export type ServerOnly = {serverSecret: string; createdAt: number; address: SharedAddress};
export const serverId = getRunTypeId<ServerOnly>();
`,
	"client.ts": `import {getRunTypeId} from '@mionjs/run-types';
import type {SharedAddress} from './shared.ts';
export type ClientForm = {clientName: string; address: SharedAddress};
export const formId = getRunTypeId<ClientForm>();
const draft: ClientForm = {clientName: '', address: {sharedStreet: '', sharedZip: 0}};
export const formIdByValue = getRunTypeId(draft);
`,
}

// loadedModules joins a reflection module with every module it imports, as a bundler would load them.
func loadedModules(resp protocol.Response, rootID string) string {
	var out strings.Builder
	seen := map[string]bool{}
	var visit func(source string)
	visit = func(source string) {
		out.WriteString(source)
		for _, line := range strings.Split(source, "\n") {
			from := strings.Index(line, "'rtmod:/")
			if !strings.HasPrefix(line, "import ") || from < 0 {
				continue
			}
			name := strings.TrimSuffix(line[from+len("'rtmod:/"):], ".js';")
			if !seen[name] {
				seen[name] = true
				visit(resp.EntryModules[name])
			}
		}
	}
	visit(reflectionModule(resp, rootID))
	return out.String()
}

func siteIDsIn(resp protocol.Response, file string) []string {
	var ids []string
	for _, site := range resp.Sites {
		if strings.HasSuffix(site.File, file) && site.FnId == "" {
			ids = append(ids, site.ID)
		}
	}
	return ids
}

// TestPerFileModules_ClientLacksServerRows: in one program, the client file's module holds no server type, and the reverse.
func TestPerFileModules_ClientLacksServerRows(t *testing.T) {
	dump := setupInline(t, splitSources).Dispatch(protocol.Request{Op: protocol.OpDump})
	if dump.Error != "" {
		t.Fatalf("dump: %s", dump.Error)
	}
	clientIDs := siteIDsIn(dump, "client.ts")
	if len(clientIDs) != 2 || clientIDs[0] != clientIDs[1] {
		t.Fatalf("both getRunTypeId call shapes must resolve to one id, got %v", clientIDs)
	}
	client := loadedModules(dump, clientIDs[0])
	if !strings.Contains(client, "clientName") || !strings.Contains(client, "sharedStreet") || strings.Contains(client, "serverSecret") {
		t.Errorf("the client must load its own and the shared types, never the server's:\n%s", client)
	}
	server := loadedModules(dump, siteIDsIn(dump, "server.ts")[0])
	if !strings.Contains(server, "serverSecret") || !strings.Contains(server, "sharedStreet") || strings.Contains(server, "clientName") {
		t.Errorf("the server must load its own and the shared types, never the client's:\n%s", server)
	}
}

// TestPerFileModules_SharedTypeWrittenOnce: a type both files reach is written once, in an rt/shared/ module.
func TestPerFileModules_SharedTypeWrittenOnce(t *testing.T) {
	dump := setupInline(t, splitSources).Dispatch(protocol.Request{Op: protocol.OpDump})
	if dump.Error != "" {
		t.Fatalf("dump: %s", dump.Error)
	}
	var homes []string
	for name, source := range dump.EntryModules {
		if strings.Contains(source, "'sharedStreet'") {
			homes = append(homes, name)
		}
	}
	if len(homes) != 1 || !strings.HasPrefix(homes[0], "rt/shared/") {
		t.Fatalf("the shared type's rows must be written once, in rt/shared/, got %v", homes)
	}
	for _, file := range []string{"client.ts", "server.ts"} {
		if module := reflectionModule(dump, siteIDsIn(dump, file)[0]); strings.Contains(module, "sharedStreet") {
			t.Errorf("%s's own module must import the shared rows, not copy them:\n%s", file, module)
		}
	}
}

// TestPerFileModules_ScanMatchesGenerate: a one-file dev scan emits the same module bytes as the whole-program dump.
func TestPerFileModules_ScanMatchesGenerate(t *testing.T) {
	session := setupInline(t, splitSources)
	scan := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"client.ts"}, IncludeEntryModules: true})
	if scan.Error != "" {
		t.Fatalf("scan: %s", scan.Error)
	}
	dump := session.Dispatch(protocol.Request{Op: protocol.OpDump})
	clientID := siteIDsIn(scan, "client.ts")[0]
	if scanned, dumped := reflectionModule(scan, clientID), reflectionModule(dump, clientID); scanned == "" || scanned != dumped {
		t.Errorf("the scanned module must equal the dumped one:\nscan:\n%s\ndump:\n%s", scanned, dumped)
	}
}

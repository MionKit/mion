package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// splitSources is one program holding a server file and a client file, each reflecting a type of its own.
var splitSources = map[string]string{
	"server.ts": `import {getRunTypeId} from '@mionjs/run-types';
export type ServerOnly = {serverSecret: string; createdAt: number};
export const serverId = getRunTypeId<ServerOnly>();
`,
	"client.ts": `import {getRunTypeId} from '@mionjs/run-types';
export type ClientForm = {clientName: string};
export const formId = getRunTypeId<ClientForm>();
const draft: ClientForm = {clientName: ''};
export const formIdByValue = getRunTypeId(draft);
`,
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
	client := reflectionModule(dump, clientIDs[0])
	if !strings.Contains(client, "clientName") || strings.Contains(client, "serverSecret") {
		t.Errorf("the client's module must carry only the client's types:\n%s", client)
	}
	server := reflectionModule(dump, siteIDsIn(dump, "server.ts")[0])
	if !strings.Contains(server, "serverSecret") || strings.Contains(server, "clientName") || server == client {
		t.Errorf("the server's module must carry only the server's types:\n%s", server)
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

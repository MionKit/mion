package resolver

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
)

// peerProgram is a SEPARATE project a session reads through: the batch source (`clientTsconfig`, a server
// build reading its client's batches) or the API source (`apiTsconfig`, a client build reading its API's
// routes). The peer session only resolves types and extracts sites: no output root, no disk cache, no
// reports of its own. It survives SetProgram / Reset, being another project, and its stamps say when it
// is rebuilt.
type peerProgram struct {
	session  *Session
	tsconfig string
	stamps   map[string]string
}

// open returns the peer session over tsconfig (absolute), reusing the current one while no stamped file
// changed; label names the option in errors, check validates a freshly built session.
func (peer *peerProgram) open(parent *Session, tsconfig, label string, check func(*Session, string) error) (*Session, error) {
	if peer.session != nil && peer.tsconfig == tsconfig && !peer.stale() {
		return peer.session, nil
	}
	peer.close()
	prog, err := program.New(program.Options{Cwd: filepath.Dir(tsconfig), TsconfigPath: tsconfig, SingleThreaded: parent.opts.SingleThreaded})
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", label, tsconfig, err)
	}
	opts := parent.opts
	opts.ClientTsconfig = ""
	opts.ApiTsconfig = ""
	opts.BundleApi = ""
	opts.Cwd = filepath.Dir(tsconfig)
	opts.TsconfigPath = tsconfig
	opts.TsconfigGenDir = ""
	opts.GenDir = ""
	opts.CacheDir = ""
	opts.CacheFollowsIncremental = false
	opts.PureFnReportWire = false
	opts.PureFnReportFile = false
	session, err := New(prog, opts)
	if err != nil {
		return nil, fmt.Errorf("%s %s: %w", label, tsconfig, err)
	}
	if check != nil {
		if err := check(session, tsconfig); err != nil {
			session.Close()
			return nil, err
		}
	}
	peer.session = session
	peer.tsconfig = tsconfig
	peer.stamps = stampProgramFiles(prog, tsconfig)
	return session, nil
}

func (peer *peerProgram) close() {
	if peer.session == nil {
		return
	}
	peer.session.Close()
	peer.session = nil
	peer.tsconfig = ""
	peer.stamps = nil
}

// stale reports a stamped file changed or went away, or a source file the peer never saw now matching its tsconfig.
func (peer *peerProgram) stale() bool {
	for path, stamp := range peer.stamps {
		if fileStamp(path) != stamp {
			return true
		}
	}
	config, err := program.ParseInferredConfig(filepath.Dir(peer.tsconfig), peer.tsconfig)
	if err != nil {
		return true // let the rebuild report it
	}
	for _, file := range config.FileNames() {
		if isDeclarationFileName(file) {
			continue
		}
		if _, known := peer.stamps[file]; !known {
			return true
		}
	}
	return false
}

// stampProgramFiles records mtime + size per non-declaration source file plus the tsconfig, the set a later generate compares.
func stampProgramFiles(prog *program.Program, tsconfig string) map[string]string {
	stamps := map[string]string{tsconfig: fileStamp(tsconfig)}
	for _, sourceFile := range prog.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		stamps[sourceFile.FileName()] = fileStamp(sourceFile.FileName())
	}
	return stamps
}

// fileStamp is "<mtime>-<size>", or "" for a file that cannot be stat'ed.
func fileStamp(path string) string {
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	return strconv.FormatInt(info.ModTime().UnixNano(), 10) + "-" + strconv.FormatInt(info.Size(), 10)
}

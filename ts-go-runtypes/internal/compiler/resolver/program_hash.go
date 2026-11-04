package resolver

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// programHash fingerprints everything a per-file transform reads besides the file itself, so a host cache keyed
// on file text alone (Vitest's fsModuleCache) can tell a stale transform apart. Declaration files are included:
// a type a site reflects can live in one. "" when an input cannot be read: the host then skips its cache.
func (sess *Session) programHash() string {
	digest := sha256.New()
	write := func(part string) {
		digest.Write([]byte(part))
		digest.Write([]byte{0})
	}
	// Version alone is "dev" for every local build; the stamp moves on each rebuild.
	write(constants.Version)
	write(binaryStamp())
	// The tsconfig text carries the mion plugin block, read from this file alone; inherited compiler options
	// arrive through the program's resolved options below.
	if sess.opts.TsconfigPath != "" {
		raw, err := os.ReadFile(tspath.ResolvePath(sess.opts.Cwd, sess.opts.TsconfigPath))
		if err != nil {
			return ""
		}
		write(string(raw))
	}
	if sess.Program == nil || sess.Program.TS == nil {
		return hex.EncodeToString(digest.Sum(nil))
	}
	options, err := json.Marshal(sess.Program.TS.Options())
	if err != nil {
		return ""
	}
	write(string(options))
	// tsgo lists the files in a fixed order: libs sorted, then the loader's walk.
	for _, sourceFile := range sess.Program.TS.SourceFiles() {
		write(sourceFile.FileName())
		write(sourceFile.Text())
	}
	return hex.EncodeToString(digest.Sum(nil))
}

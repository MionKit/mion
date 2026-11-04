package resolver

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// programHash covers what a transform reads beyond its file, for a host cache keyed on file text (Vitest's fsModuleCache).
// Declaration files count, since a reflected type can live in one; "" on a read failure makes the host skip its cache.
func (sess *Session) programHash() string {
	digest := sha256.New()
	write := func(part string) {
		digest.Write([]byte(part))
		digest.Write([]byte{0})
	}
	// Version alone is "dev" for every local build; the stamp moves on each rebuild.
	write(constants.Version)
	write(binaryStamp())
	// Raw tsconfig text covers the mion plugin block (read from this file only); inherited options arrive via Options().
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

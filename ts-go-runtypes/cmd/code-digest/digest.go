package main

import (
	"crypto/sha256"
	"encoding/hex"
	"path"
	"strings"

	"github.com/microsoft/typescript-go/shim/core"
)

// Bump when the token rules change, so every marker saved under the old rules stops matching.
const toolVersion = "1"

// digest hashes a file's code without its comments and blank lines; ok is false when the file must hash raw.
func digest(filePath, text string) (string, bool) {
	var out strings.Builder
	out.WriteString("code-digest " + toolVersion + "\n")
	var err error
	var directives []directive
	switch ext := path.Ext(filePath); ext {
	case ".ts", ".mts", ".cts":
		err, directives = tsTokens(filePath, text, core.ScriptKindTS, &out), tsDirectives
	case ".js", ".mjs", ".cjs":
		err, directives = tsTokens(filePath, text, core.ScriptKindJS, &out), tsDirectives
	case ".go":
		err, directives = goTokens(text, &out), goDirectives
	default:
		return "", false
	}
	if err != nil {
		return "", false
	}
	for _, line := range directiveLines(text, directives) {
		out.WriteString("directive " + line + "\n")
	}
	sum := sha256.Sum256([]byte(out.String()))
	return hex.EncodeToString(sum[:]), true
}

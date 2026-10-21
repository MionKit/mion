package program

import (
	"path/filepath"
	"strings"
)

// InferSrcDir picks the base of the default <srcDir>/.mion; the resolver and the enrich CLI share it so their trees agree.
// rootDir and baseUrl may be relative to cwd; fileNames are the program's root files.
func InferSrcDir(cwd, rootDir, baseUrl string, fileNames []string) string {
	// A rootDir above cwd is an emit root for type-checking siblings; honoring it would put the output outside the project.
	if rootDir != "" {
		if absRootDir := resolveAgainst(cwd, rootDir); isWithin(cwd, absRootDir) {
			return absRootDir
		}
	}
	if ancestor := commonDir(projectFiles(fileNames)); ancestor != "" {
		return ancestor
	}
	if baseUrl != "" {
		return resolveAgainst(cwd, baseUrl)
	}
	return cwd
}

// SrcDir is InferSrcDir over this config's rootDir, baseUrl and include-resolved files; cwd when nil.
func (inferredConfig *InferredConfig) SrcDir(cwd string) string {
	if inferredConfig == nil || inferredConfig.options == nil {
		return cwd
	}
	return InferSrcDir(cwd, inferredConfig.options.RootDir, inferredConfig.options.BaseUrl, inferredConfig.fileNames)
}

func resolveAgainst(cwd, path string) string {
	if path == "" || filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}

// isWithin compares as forward-slash paths, so the prefix test is separator-safe.
func isWithin(base, target string) bool {
	if base == "" {
		return false
	}
	base = strings.TrimSuffix(filepath.ToSlash(base), "/")
	target = strings.TrimSuffix(filepath.ToSlash(target), "/")
	return target == base || strings.HasPrefix(target, base+"/")
}

// projectFiles drops node_modules entries, so a dependency .d.ts cannot drag the common ancestor up to a shared parent.
func projectFiles(fileNames []string) []string {
	files := make([]string, 0, len(fileNames))
	for _, name := range fileNames {
		if name == "" || strings.Contains(filepath.ToSlash(name), "/node_modules/") {
			continue
		}
		files = append(files, name)
	}
	return files
}

// commonDir is the deepest directory holding every path's parent; tsgo paths already arrive forward-slash.
func commonDir(paths []string) string {
	var segmented [][]string
	for _, path := range paths {
		if path == "" {
			continue
		}
		dir := filepath.ToSlash(filepath.Dir(path))
		segmented = append(segmented, strings.Split(dir, "/"))
	}
	if len(segmented) == 0 {
		return ""
	}
	common := segmented[0]
	for _, segments := range segmented[1:] {
		limit := min(len(common), len(segments))
		matched := 0
		for matched < limit && common[matched] == segments[matched] {
			matched++
		}
		common = common[:matched]
	}
	// A lone leading "" means the paths share only the filesystem root: let the caller fall through.
	if len(common) <= 1 {
		return ""
	}
	return strings.Join(common, "/")
}

package program

import (
	"time"

	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
)

// overlayFS layers an in-memory set of virtual files on top of a real VFS.
// Writes are not propagated; reads of virtual paths return the overlay text.
// Mirrors the pattern used in tsgolint's internal/utils/overlay_vfs.go.
//
// The overlay also synthesizes the DIRECTORY tree implied by its file paths
// (`dirs`), so node/bundler module resolution can walk a purely-virtual
// `node_modules/<pkg>/…` layout that has no on-disk backing — DirectoryExists
// and GetAccessibleEntries would otherwise fall through to the base OS FS and
// report the virtual directories as missing. Without this, a virtual package
// only resolves through an ambient `declare module`, never through its real
// package.json exports + .d.ts tree.
type overlayFS struct {
	base          vfspkg.FS
	files         map[string]string
	dirs          map[string]struct{}
	caseSensitive bool
}

func newOverlayFS(base vfspkg.FS, files map[string]string) vfspkg.FS {
	normalized := make(map[string]string, len(files))
	dirs := make(map[string]struct{})
	for path, content := range files {
		norm := tspath.NormalizePath(path)
		normalized[norm] = content
		// Register every ancestor directory of the file so the virtual tree is
		// walkable. Stops when GetDirectoryPath stops shrinking (root reached).
		for dir := tspath.GetDirectoryPath(norm); dir != ""; {
			if _, seen := dirs[dir]; seen {
				break
			}
			dirs[dir] = struct{}{}
			parent := tspath.GetDirectoryPath(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}
	return &overlayFS{base: base, files: normalized, dirs: dirs, caseSensitive: base.UseCaseSensitiveFileNames()}
}

func (overlay *overlayFS) UseCaseSensitiveFileNames() bool { return overlay.caseSensitive }

func (overlay *overlayFS) FileExists(path string) bool {
	if _, ok := overlay.files[tspath.NormalizePath(path)]; ok {
		return true
	}
	return overlay.base.FileExists(path)
}

func (overlay *overlayFS) ReadFile(path string) (string, bool) {
	if content, ok := overlay.files[tspath.NormalizePath(path)]; ok {
		return content, true
	}
	return overlay.base.ReadFile(path)
}

func (overlay *overlayFS) WriteFile(path string, data string) error {
	return overlay.base.WriteFile(path, data)
}

func (overlay *overlayFS) AppendFile(path string, data string) error {
	return overlay.base.AppendFile(path, data)
}

func (overlay *overlayFS) Remove(path string) error {
	return overlay.base.Remove(path)
}

func (overlay *overlayFS) DirectoryExists(path string) bool {
	if _, ok := overlay.dirs[tspath.NormalizePath(path)]; ok {
		return true
	}
	return overlay.base.DirectoryExists(path)
}

// GetAccessibleEntries merges the base FS entries with the virtual files and
// directories that sit DIRECTLY under path, so a directory read of a virtual
// package lists its overlay contents (module resolution reads directories to
// find package.json / index files / typesVersions candidates).
func (overlay *overlayFS) GetAccessibleEntries(path string) vfspkg.Entries {
	norm := tspath.NormalizePath(path)
	entries := overlay.base.GetAccessibleEntries(path)
	seenFiles := make(map[string]struct{}, len(entries.Files))
	for _, file := range entries.Files {
		seenFiles[file] = struct{}{}
	}
	seenDirs := make(map[string]struct{}, len(entries.Directories))
	for _, dir := range entries.Directories {
		seenDirs[dir] = struct{}{}
	}
	files := entries.Files
	for filePath := range overlay.files {
		if tspath.GetDirectoryPath(filePath) != norm {
			continue
		}
		name := tspath.GetBaseFileName(filePath)
		if _, ok := seenFiles[name]; !ok {
			seenFiles[name] = struct{}{}
			files = append(files, name)
		}
	}
	directories := entries.Directories
	for dirPath := range overlay.dirs {
		if tspath.GetDirectoryPath(dirPath) != norm {
			continue
		}
		name := tspath.GetBaseFileName(dirPath)
		if _, ok := seenDirs[name]; !ok {
			seenDirs[name] = struct{}{}
			directories = append(directories, name)
		}
	}
	return vfspkg.Entries{Files: files, Directories: directories}
}

func (overlay *overlayFS) Stat(path string) vfspkg.FileInfo {
	return overlay.base.Stat(path)
}

func (overlay *overlayFS) WalkDir(root string, walkFn vfspkg.WalkDirFunc) error {
	return overlay.base.WalkDir(root, walkFn)
}

func (overlay *overlayFS) Realpath(path string) string {
	return overlay.base.Realpath(path)
}

func (overlay *overlayFS) Chtimes(path string, accessTime time.Time, modTime time.Time) error {
	return overlay.base.Chtimes(path, accessTime, modTime)
}

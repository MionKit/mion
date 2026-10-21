package diskcache

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// HashLookup is the two-way mapping needed to verify a cached entry's child refs across builds. Implemented by runtype.Cache,
// declared here so typefns can depend on the contract without pulling in the runtype package.
type HashLookup interface {
	// StructuralForHash returns the structural id behind a short hash, or "" when this build has not interned it.
	StructuralForHash(hash string) string
	// HashForStructural returns the current short hash for a structural id, or "" when this build has not interned it.
	HashForStructural(structural string) string
}

// Store reads and writes the cache files under one build-options-fingerprinted directory; construct one per resolver session.
// Methods on a nil receiver no-op, so the renderer treats "no cache wired" and "cache miss" with one code path.
type Store struct {
	// root is this fingerprint's base directory; every read and write stays under it.
	root string
}

// New returns a Store rooted at <baseDir>/<fingerprint>, or nil for an empty argument (no caching).
// The directory is created lazily on the first write, so a cold read-only session never touches the filesystem.
func New(baseDir string, fingerprint string) *Store {
	if baseDir == "" || fingerprint == "" {
		return nil
	}
	return &Store{root: filepath.Join(baseDir, fingerprint)}
}

// ReadRT loads the cached entry for (typeID, fnTag); a file that is absent, malformed, of another format or stale-headered is a miss.
// I/O errors other than ENOENT are surfaced, so a broken cache directory fails loudly instead of silently disabling itself.
func (s *Store) ReadRT(typeID, fnTag string) (*RTEntry, bool, error) {
	if s == nil || typeID == "" || fnTag == "" {
		return nil, false, nil
	}
	path := s.entryPath(typeID, fnTag)
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, false, nil
		}
		return nil, false, err
	}
	var entry RTEntry
	if err := json.Unmarshal(raw, &entry); err != nil {
		// A leftover from a crashed older binary must not bring the build down.
		return nil, false, nil
	}
	if entry.Format != FormatVersion {
		return nil, false, nil
	}
	return &entry, true, nil
}

// WriteRT serialises entry to <root>/<typeID>/<fnTag>.json through a sibling tempfile and a rename, which is atomic on POSIX,
// so a concurrent reader sees either the previous file or the new one, never a torn write.
func (s *Store) WriteRT(typeID, fnTag string, entry RTEntry) error {
	if s == nil || typeID == "" || fnTag == "" {
		return nil
	}
	if entry.Format == 0 {
		entry.Format = FormatVersion
	}
	dir := filepath.Join(s.root, typeID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	finalPath := filepath.Join(dir, fnTag+".json")
	tmp, err := os.CreateTemp(dir, fnTag+".*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

// entryPath stays private: every cross-package caller goes through ReadRT / WriteRT, so the layout is this package's detail.
func (s *Store) entryPath(typeID, fnTag string) string {
	return filepath.Join(s.root, typeID, fnTag+".json")
}

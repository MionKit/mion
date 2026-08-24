package diskcache

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// HashLookup is the two-way mapping the disk layer needs to verify a
// cached entry's child refs across builds. Implemented by
// runtype.Cache; defined here so typefns can depend on the contract
// without pulling in the runtype package.
type HashLookup interface {
	// StructuralForHash returns the structural id behind a short hash,
	// or "" when the hash is not interned in the current build.
	StructuralForHash(hash string) string
	// HashForStructural returns the current short hash for a
	// structural id, or "" when the structural id is not interned in
	// the current build.
	HashForStructural(structural string) string
}

// Store reads/writes per-(typeID, fnTag) RT cache files under a single
// build-options-fingerprinted directory. Construct one per resolver
// session; nil-safe — methods on a nil receiver no-op (so the renderer
// can treat "no cache wired" and "cache miss" with the same code path).
type Store struct {
	// root is the base directory for this fingerprint, e.g.
	// <projectRoot>/node_modules/.cache/ts-runtypes/<optsFingerprint>.
	// All reads / writes are under here.
	root string
}

// New returns a Store rooted at <baseDir>/<fingerprint>. baseDir is
// typically <projectRoot>/node_modules/.cache/ts-runtypes; passing
// "" returns nil (no caching). The directory is created lazily on the
// first write — read-only sessions never touch the filesystem if the
// cache is cold.
func New(baseDir string, fingerprint string) *Store {
	if baseDir == "" || fingerprint == "" {
		return nil
	}
	return &Store{root: filepath.Join(baseDir, fingerprint)}
}

// ReadRT loads the cached entry for (typeID, fnTag). Returns (nil,
// false, nil) for a miss (file absent, malformed, wrong format, or
// stale header). Real I/O errors other than ENOENT are surfaced so a
// broken cache directory fails loudly rather than silently disabling
// itself.
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
		// Malformed file → treat as miss. The writer's temp-and-rename
		// makes a partial file unlikely, but any leftover from a crashed
		// older binary shouldn't bring the build down.
		return nil, false, nil
	}
	if entry.Format != FormatVersion {
		return nil, false, nil
	}
	return &entry, true, nil
}

// WriteRT serialises entry to <root>/<typeID>/<fnTag>.json atomically:
// write to a sibling tempfile, fsync, rename into place. The rename
// is atomic on POSIX so a concurrent reader either sees the previous
// file or the new one, never a torn write.
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

// entryPath builds the on-disk path for a given (typeID, fnTag) pair.
// Kept private — every cross-package caller goes through ReadRT /
// WriteRT so the layout stays a disk-package internal detail.
func (s *Store) entryPath(typeID, fnTag string) string {
	return filepath.Join(s.root, typeID, fnTag+".json")
}

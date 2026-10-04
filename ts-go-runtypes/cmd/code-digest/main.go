// code-digest hashes JS/TS and Go files by their code alone, so a CI lane can treat a commit that only
// touches comments or blank lines as unchanged (scripts/ci/lanes.mjs runs it from the gate job).
//
// Run:
//
//	printf '<objectname> <path>\n…' | code-digest -C <repo>   prints `<objectname> <language> <digest>`, or digest `-` to hash raw
//	code-digest --markers                                      prints the directive markers kept as code
package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
)

type blob struct {
	objectname string
	path       string
	digest     string
}

func main() {
	dir := flag.String("C", ".", "git repository the object names belong to")
	markers := flag.Bool("markers", false, "print the directive markers and exit")
	flag.Parse()
	if *markers {
		for _, marker := range append(append([]string{}, tsDirectives...), goDirectives...) {
			fmt.Println(marker)
		}
		return
	}
	blobs, err := readBlobs(*dir, os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "code-digest:", err)
		os.Exit(1)
	}
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()
	for _, entry := range blobs {
		fmt.Fprintf(writer, "%s %s %s\n", entry.objectname, language(entry.path), entry.digest)
	}
}

// readBlobs reads every listed object through one `git cat-file --batch` and digests them in parallel.
func readBlobs(dir string, input io.Reader) ([]*blob, error) {
	var blobs []*blob
	seen := map[string]bool{}
	lines := bufio.NewScanner(input)
	for lines.Scan() {
		objectname, filePath, ok := strings.Cut(lines.Text(), " ")
		// One blob can sit at a .ts and a .js path, and the two languages digest it differently.
		key := objectname + " " + language(filePath)
		if !ok || seen[key] {
			continue
		}
		seen[key] = true
		blobs = append(blobs, &blob{objectname: objectname, path: filePath, digest: "-"})
	}
	if err := lines.Err(); err != nil {
		return nil, err
	}

	cmd := exec.Command("git", "-C", dir, "cat-file", "--batch")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	go func() {
		writer := bufio.NewWriter(stdin)
		for _, entry := range blobs {
			fmt.Fprintln(writer, entry.objectname)
		}
		writer.Flush()
		stdin.Close()
	}()

	work := make(chan func())
	var workers sync.WaitGroup
	for range runtime.NumCPU() {
		workers.Go(func() {
			for job := range work {
				job()
			}
		})
	}
	reader := bufio.NewReader(stdout)
	var readErr error
	for _, entry := range blobs {
		text, err := readObject(reader)
		if err != nil {
			readErr = fmt.Errorf("%s: %w", entry.objectname, err)
			break
		}
		work <- func() {
			if sum, ok := digest(entry.path, text); ok {
				entry.digest = sum
			}
		}
	}
	close(work)
	workers.Wait()
	if readErr != nil {
		return nil, readErr
	}
	return blobs, cmd.Wait()
}

// readObject reads one `<oid> <type> <size>\n<content>\n` record.
func readObject(reader *bufio.Reader) (string, error) {
	header, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	fields := strings.Fields(header)
	if len(fields) != 3 || fields[1] != "blob" {
		return "", fmt.Errorf("unexpected cat-file header %q", strings.TrimSpace(header))
	}
	size, err := strconv.Atoi(fields[2])
	if err != nil {
		return "", err
	}
	content := make([]byte, size+1)
	if _, err := io.ReadFull(reader, content); err != nil {
		return "", err
	}
	return string(content[:size]), nil
}

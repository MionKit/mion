// Command mion answers compile-time type-reflection queries for runtypes; pkg/cli holds its body.
package main

import (
	"os"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/cli"
)

func main() { cli.Main(os.Args[1:]) }

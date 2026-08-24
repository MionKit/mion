module github.com/mionkit/ts-runtypes

go 1.26

replace (
	github.com/microsoft/typescript-go/shim/ast => ./third_party/tsgolint/shim/ast
	github.com/microsoft/typescript-go/shim/bundled => ./third_party/tsgolint/shim/bundled
	github.com/microsoft/typescript-go/shim/checker => ./third_party/tsgolint/shim/checker
	github.com/microsoft/typescript-go/shim/compiler => ./third_party/tsgolint/shim/compiler
	github.com/microsoft/typescript-go/shim/core => ./third_party/tsgolint/shim/core
	github.com/microsoft/typescript-go/shim/lsp/lsproto => ./third_party/tsgolint/shim/lsp/lsproto
	github.com/microsoft/typescript-go/shim/parser => ./third_party/tsgolint/shim/parser
	github.com/microsoft/typescript-go/shim/project => ./third_party/tsgolint/shim/project
	github.com/microsoft/typescript-go/shim/scanner => ./third_party/tsgolint/shim/scanner
	github.com/microsoft/typescript-go/shim/tsoptions => ./third_party/tsgolint/shim/tsoptions
	github.com/microsoft/typescript-go/shim/tspath => ./third_party/tsgolint/shim/tspath
	github.com/microsoft/typescript-go/shim/vfs => ./third_party/tsgolint/shim/vfs
	github.com/microsoft/typescript-go/shim/vfs/cachedvfs => ./third_party/tsgolint/shim/vfs/cachedvfs
	github.com/microsoft/typescript-go/shim/vfs/osvfs => ./third_party/tsgolint/shim/vfs/osvfs
)

require (
	github.com/microsoft/typescript-go/shim/ast v0.0.0
	github.com/microsoft/typescript-go/shim/bundled v0.0.0
	github.com/microsoft/typescript-go/shim/checker v0.0.0
	github.com/microsoft/typescript-go/shim/compiler v0.0.0
	github.com/microsoft/typescript-go/shim/core v0.0.0
	github.com/microsoft/typescript-go/shim/parser v0.0.0
	github.com/microsoft/typescript-go/shim/scanner v0.0.0
	github.com/microsoft/typescript-go/shim/tsoptions v0.0.0
	github.com/microsoft/typescript-go/shim/tspath v0.0.0
	github.com/microsoft/typescript-go/shim/vfs v0.0.0
	github.com/microsoft/typescript-go/shim/vfs/cachedvfs v0.0.0
	github.com/microsoft/typescript-go/shim/vfs/osvfs v0.0.0
)

require (
	github.com/dlclark/regexp2 v1.11.5 // indirect
	github.com/go-json-experiment/json v0.0.0-20260214004413-d219187c3433 // indirect
	github.com/klauspost/cpuid/v2 v2.2.10 // indirect
	github.com/microsoft/typescript-go v0.0.0-20260309214900-4a59cd78390d // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
	golang.org/x/text v0.36.0 // indirect
)

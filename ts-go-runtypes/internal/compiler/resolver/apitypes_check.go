package resolver

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apitypes/apitypesmeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// apiTypesCheck is the verdict on the packages this program's clients read their API from.
type apiTypesCheck struct {
	diags []diagnostics.Diagnostic
	// refusedSites are the `initClient` sites whose package MET015 refused, refusedRoots those packages' roots.
	refusedSites map[diagnostics.Site]bool
	refusedRoots map[string]bool
}

// apiTypesPackages checks each client's API package: a types-only one must carry the marker `mion api-types`
// writes (MET015), from this compiler version (MET016). One finding per package, at its first client.
func (sess *Session) apiTypesPackages() *apiTypesCheck {
	memo := sess.fetchMemo()
	if memo.apiTypes != nil {
		return memo.apiTypes
	}
	check := &apiTypesCheck{refusedSites: map[diagnostics.Site]bool{}, refusedRoots: map[string]bool{}}
	memo.apiTypes = check
	if sess.Program == nil || sess.checker == nil {
		return check
	}
	clients, _ := sess.clientFacts()
	seen := map[string]bool{}
	for _, client := range clients {
		file := apimeta.ApiDeclarationFile(sess.checker, client.ApiType)
		if file == "" {
			continue
		}
		name, root := marker.PackageOfFile(file, sess.Program.FS)
		if root == "" {
			continue
		}
		if check.refusedRoots[root] {
			check.refusedSites[client.DiagSite] = true
		}
		if seen[root] {
			continue
		}
		seen[root] = true
		info := apitypesmeta.ReadPackage(root, sess.Program.FS)
		switch {
		case !info.TypesOnly:
		case info.Marker == nil:
			check.refusedRoots[root] = true
			check.refusedSites[client.DiagSite] = true
			check.diags = append(check.diags, diagnostics.New(diagnostics.CodeApiMetaTypesNotBuiltByMion, client.DiagSite, name, info.Problem))
		case info.Marker.Compiler != constants.Version:
			check.diags = append(check.diags, diagnostics.New(diagnostics.CodeApiMetaTypesOtherCompiler, client.DiagSite, name, info.Marker.Compiler, constants.Version))
		}
	}
	return check
}

// dropRefusedApiTypeDiags removes what MET015 already explains: the version codes at a refused client, and a
// typeless private member declared in a refused package. Whole-program ops only, the ones that report MET015.
func (sess *Session) dropRefusedApiTypeDiags(list []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	check := sess.apiTypesPackages()
	if len(check.refusedRoots) == 0 {
		return list
	}
	kept := list[:0]
	for _, diagnostic := range list {
		switch diagnostic.Code {
		case diagnostics.CodeApiMetaServerVersionMismatch, diagnostics.CodeApiMetaNoServerVersion:
			if check.refusedSites[diagnostic.Site] {
				continue
			}
		case diagnostics.CodeMarkerTypelessPrivateMember:
			if sess.declaredInRefusedPackage(diagnostic, check) {
				continue
			}
		}
		kept = append(kept, diagnostic)
	}
	return kept
}

func (sess *Session) declaredInRefusedPackage(diagnostic diagnostics.Diagnostic, check *apiTypesCheck) bool {
	for _, related := range diagnostic.Related {
		if _, root := marker.PackageOfFile(sess.absPath(related.FilePath), sess.Program.FS); check.refusedRoots[root] {
			return true
		}
	}
	return false
}

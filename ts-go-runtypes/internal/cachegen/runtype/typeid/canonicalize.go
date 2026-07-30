package typeid

// Canonical (entry-point-independent) ids for cyclic type clusters.
//
// A raw walk's cycle tokens anchor wherever the walk happened to close a
// cycle: entering `Record<string, N0[]>` through the checker-interned
// `Array<N0>` closes at the ARRAY, while the jsonSchema-authored twin (a
// fresh array node per schema literal) closes at the object knot — two
// honest spellings of one bisimulation class, hence two ids. This file
// replaces every raw cyclic unroll with a canonical one:
//
//  1. TEMPLATES — each cluster member is re-dispatched with in-cluster
//     children resolved to slot placeholders (`Compute`'s templating check),
//     non-cluster children to their real final ids. Order-sensitive-by-
//     content composites (unions, brand sets, call-signature groups) are
//     emitted as UNORDERED RUNS and sorted only at emission, because checker
//     member order is declaration-position-tiebroken and therefore not
//     canonical across cloned anonymous members.
//  2. REFINEMENT — partition members by normalized template, then refine by
//     successor blocks using EXACT per-round ordinals (hashes could silently
//     merge non-bisimilar nodes). Monotone: round k+1 refines round k (equal
//     at k+1 forces equal templates and targets equal under k), so the
//     partition stabilizes within |cluster| rounds. Blocks = bisimulation
//     classes. Labels derive from structure alone, so bisimilar clusters
//     discovered by SEPARATE walks reach identical fixpoints — the property
//     that makes independently computed twins converge.
//  3. EMISSION — each block's id is a deterministic unroll of the quotient
//     rooted at that block: an on-stack target renders as the bare token
//     `$<kind>_<relDepth>` (relDepth in the EMISSION stack — walk-order
//     independent by construction), an off-stack target re-expands (bounded
//     exactly like the raw unroll it replaces), runs sort after resolution.
//     Emission is a function of (block, stack) only, so the representative
//     choice cannot matter.
//  4. OVERRIDES — refinement and the PURE emission are suffix-free; a
//     block's `overrideX` families are looked up by its pure emission (the
//     entry-point-independent replacement for the old raw base key), and the
//     FINAL emission appends `OverrideStructuralKey(families)` at each
//     block expansion site. Fold and stamp passes both route through cold
//     BaseStructuralKey walks, so producer and consumer stay consistent.
//  5. ALIAS — for every block, its COMPOSITION SPELLING (template with slots
//     substituted by full final ids) is registered on the Computer: that is
//     byte-for-byte what an acyclic parent pointing into the cluster
//     composes as its dispatch base, so an entry container that sits OUTSIDE
//     the pointer-SCC (the interned `Array<N0>` above) remaps to the block's
//     canonical id at its own cacheable pop. Without this the motivating
//     Record case still diverges: rooted emission fixes the knot, the alias
//     map fixes the container.
//
// Known narrower residual (diverges today too, unreachable by the fuzz
// lane's two-sided fixtures): a later walk's cluster that pointer-references
// a member of a PREVIOUSLY closed, bisimilar-overlapping cluster embeds that
// member's finished id as an opaque leaf, so rotated hand-written partial
// duplications of one cycle can still spell differently. A session-level
// block registry would close it; deliberately not built here.

import (
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Template control bytes — valid only INSIDE template strings, never in final
// ids. User-provided bytes (literal values, member names, labels, enum
// discriminators, class names) are escaped in template mode by Computer.lit,
// so a literal type like "\x00S0\x00" cannot spoof a slot.
const (
	slotByte     = "\x00" // \x00<decimal slot index>\x00
	runOpenByte  = "\x01" // unordered run: \x01 member \x02 member … \x03
	runSepByte   = "\x02"
	runCloseByte = "\x03"
	escapeByte   = 0x1B // \x1b\x1b = literal \x1b; \x1b(b|0x10) = literal b
)

func slotMark(index int) string {
	return slotByte + strconv.Itoa(index) + slotByte
}

// clusterState marks a template-extraction re-walk: Compute resolves any
// child in slotOf to a placeholder instead of text.
type clusterState struct {
	slotOf map[*checker.Type]int
}

// aliasEntry carries a canonical block's two spellings: `final` (override
// suffixes folded — what the pointer cache and parents compose) and `pure`
// (suffix-free — the override map's key space).
type aliasEntry struct {
	final string
	pure  string
}

type canonResult struct {
	final string
	pure  string
}

// lit escapes user-provided bytes when (and only when) a template extraction
// is active, so template control bytes stay unforgeable. Identity on every
// ordinary walk — acyclic ids keep their exact bytes.
func (computer *Computer) lit(s string) string {
	if computer.templating == nil {
		return s
	}
	if !strings.ContainsAny(s, "\x00\x01\x02\x03\x1b") {
		return s
	}
	var b strings.Builder
	b.Grow(len(s) + 4)
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == escapeByte:
			b.WriteByte(escapeByte)
			b.WriteByte(escapeByte)
		case c <= 0x03:
			b.WriteByte(escapeByte)
			b.WriteByte(c | 0x10)
		default:
			b.WriteByte(c)
		}
	}
	return b.String()
}

// sortedJoin composes a content-sorted composite (union members, intersection
// brand sets, object members, call-signature groups). Ordinary walks sort and
// join immediately — byte-identical to the historical spelling. Template
// walks defer: member order from the checker is declaration-position-
// tiebroken (not canonical across cloned anonymous members) and members may
// contain slot placeholders whose bytes are walk-order-dependent, so the run
// is kept unordered until emission resolves and sorts it.
func (computer *Computer) sortedJoin(ids []string) string {
	if computer.templating != nil {
		return runOpenByte + strings.Join(ids, runSepByte) + runCloseByte
	}
	sort.Strings(ids)
	return strings.Join(ids, ",")
}

// canonicalizeCluster computes canonical ids for the SCC cluster rooted at
// root (members = the pointers popped uncacheable since the root was pushed,
// i.e. pending[mark:], plus root itself), caches every member's final id, and
// registers the blocks' composition spellings in the alias map. rawBase is
// the root's discarded raw unroll, returned only on a depth-cap abort (the
// cache layer discards and diagnoses that walk anyway).
func (computer *Computer) canonicalizeCluster(root *checker.Type, mark int, rawBase string) canonResult {
	segment := computer.pending[mark:]
	computer.pending = computer.pending[:mark]
	members := make([]*checker.Type, 0, len(segment)+1)
	slotOf := make(map[*checker.Type]int, len(segment)+1)
	add := func(tsType *checker.Type) {
		if _, ok := slotOf[tsType]; !ok {
			slotOf[tsType] = len(members)
			members = append(members, tsType)
		}
	}
	add(root)
	for _, tsType := range segment {
		add(tsType)
	}

	// Template extraction. The member frame is pushed for defense: a checker
	// query minting a FRESH pointer mid-template just computes normally (and a
	// pathological fresh spiral hits the existing depth backstop).
	templates := make([]string, len(members))
	kinds := make([]protocol.ReflectionKind, len(members))
	saved := computer.templating
	computer.templating = &clusterState{slotOf: slotOf}
	for i, member := range members {
		kinds[i] = KindOf(computer.typeChecker, member)
		computer.pushFrame(member)
		templates[i] = computer.dispatch(member)
		computer.popFrame()
		if computer.depthExceeded {
			break
		}
	}
	computer.templating = saved
	if computer.depthExceeded {
		return canonResult{final: rawBase, pure: rawBase}
	}

	// Partition refinement with exact ordinals.
	blocks := make([]int, len(members))
	labels := make([]string, len(members))
	relabel := func(labelOf func(slot int) string) {
		for i, template := range templates {
			labels[i] = computer.resolveTemplate(template, labelOf, true)
		}
	}
	relabel(func(int) string { return slotByte + "S" + slotByte })
	blocks = assignOrdinals(labels)
	for round := 0; round <= len(members); round++ {
		relabel(func(slot int) string { return slotByte + strconv.Itoa(blocks[slot]) + slotByte })
		next := assignOrdinals(labels)
		if samePartition(blocks, next) {
			blocks = next
			break
		}
		blocks = next
	}
	representative := make(map[int]int, len(members))
	for i, block := range blocks {
		if _, ok := representative[block]; !ok {
			representative[block] = i
		}
	}

	// Rooted emissions. pure = suffix-free (override key space); final folds
	// each block's override families at its expansion sites.
	emit := func(rootBlock int, suffixOf func(block int) string) string {
		var emitBlock func(block int, stack []int) string
		emitBlock = func(block int, stack []int) string {
			if len(stack) >= maxWalkDepth {
				if !computer.depthExceeded {
					computer.depthExceeded = true
				}
				return depthSentinel
			}
			stack = append(stack, block)
			text := computer.resolveTemplate(templates[representative[block]], func(slot int) string {
				target := blocks[slot]
				for i := len(stack) - 1; i >= 0; i-- {
					if stack[i] == target {
						return "$" + strconv.Itoa(int(kinds[representative[target]])) + "_" + strconv.Itoa(len(stack)-i)
					}
				}
				return emitBlock(target, stack)
			}, false)
			return text + suffixOf(block)
		}
		return emitBlock(rootBlock, nil)
	}
	pureOf := make(map[int]string, len(representative))
	for block := range representative {
		pureOf[block] = emit(block, func(int) string { return "" })
	}
	families := make(map[int]map[string]string, len(representative))
	if len(computer.overrides) > 0 {
		for block, pure := range pureOf {
			families[block] = computer.overrides[pure]
		}
	}
	suffixOf := func(block int) string { return OverrideStructuralKey(families[block]) }
	finalOf := make(map[int]string, len(representative))
	for block := range representative {
		finalOf[block] = emit(block, suffixOf)
	}
	if computer.depthExceeded {
		return canonResult{final: rawBase, pure: rawBase}
	}

	// Commit member ids and the blocks' composition spellings (see the file
	// header: the alias map is what converges entry containers OUTSIDE the
	// pointer-SCC). First writer wins on an alias key — bisimilar clusters
	// register byte-identical entries, so overwriting is a no-op by
	// construction and skipping it keeps the map insert-only.
	for i, member := range members {
		computer.cache[member] = finalOf[blocks[i]]
	}
	if computer.alias == nil {
		computer.alias = make(map[string]aliasEntry, len(representative))
	}
	for block, index := range representative {
		spelling := computer.resolveTemplate(templates[index], func(slot int) string { return finalOf[blocks[slot]] }, false)
		if _, exists := computer.alias[spelling]; !exists {
			computer.alias[spelling] = aliasEntry{final: finalOf[block], pure: pureOf[block]}
		}
	}
	return canonResult{final: finalOf[blocks[0]], pure: pureOf[blocks[0]]}
}

// resolveTemplate walks a template string, replacing slot placeholders via
// resolveSlot and resolving unordered runs (members resolved recursively,
// then sorted, then comma-joined). keepControl keeps the run framing and
// escape sequences intact — refinement labels stay in template space, while
// emission (keepControl=false) unescapes user bytes and joins runs with `,`
// so the output is a plain structural id.
func (computer *Computer) resolveTemplate(template string, resolveSlot func(slot int) string, keepControl bool) string {
	var b strings.Builder
	b.Grow(len(template))
	i := 0
	for i < len(template) {
		c := template[i]
		switch c {
		case escapeByte:
			if i+1 < len(template) {
				if keepControl {
					b.WriteByte(template[i])
					b.WriteByte(template[i+1])
				} else if template[i+1] == escapeByte {
					b.WriteByte(escapeByte)
				} else {
					b.WriteByte(template[i+1] &^ 0x10)
				}
				i += 2
				continue
			}
			b.WriteByte(c)
			i++
		case slotByte[0]:
			end := strings.IndexByte(template[i+1:], slotByte[0])
			if end < 0 {
				// Unterminated slot — unreachable by construction.
				b.WriteString(template[i:])
				return b.String()
			}
			slot, err := strconv.Atoi(template[i+1 : i+1+end])
			if err != nil {
				// Unreachable by construction (slot marks are machine-written);
				// keep the bytes rather than corrupt the id silently.
				b.WriteString(template[i : i+2+end])
			} else {
				b.WriteString(resolveSlot(slot))
			}
			i += end + 2
		case runOpenByte[0]:
			memberStrings, next := computer.resolveRun(template, i+1, resolveSlot, keepControl)
			sort.Strings(memberStrings)
			if keepControl {
				b.WriteString(runOpenByte)
				b.WriteString(strings.Join(memberStrings, runSepByte))
				b.WriteString(runCloseByte)
			} else {
				b.WriteString(strings.Join(memberStrings, ","))
			}
			i = next
		default:
			b.WriteByte(c)
			i++
		}
	}
	return b.String()
}

// resolveRun parses one unordered run starting just past its opening byte,
// resolving each member fragment recursively (members may nest runs). Returns
// the resolved members and the index just past the closing byte.
func (computer *Computer) resolveRun(template string, start int, resolveSlot func(slot int) string, keepControl bool) ([]string, int) {
	var memberStrings []string
	var current strings.Builder
	depth := 0
	i := start
	flush := func() {
		memberStrings = append(memberStrings, computer.resolveTemplate(current.String(), resolveSlot, keepControl))
		current.Reset()
	}
	for i < len(template) {
		c := template[i]
		switch c {
		case escapeByte:
			if i+1 < len(template) {
				current.WriteByte(template[i])
				current.WriteByte(template[i+1])
				i += 2
				continue
			}
			current.WriteByte(c)
			i++
		case runOpenByte[0]:
			depth++
			current.WriteByte(c)
			i++
		case runCloseByte[0]:
			if depth == 0 {
				if current.Len() > 0 || len(memberStrings) > 0 {
					flush()
				}
				return memberStrings, i + 1
			}
			depth--
			current.WriteByte(c)
			i++
		case runSepByte[0]:
			if depth == 0 {
				flush()
			} else {
				current.WriteByte(c)
			}
			i++
		default:
			current.WriteByte(c)
			i++
		}
	}
	// Unterminated run — unreachable by construction; flush what we have.
	if current.Len() > 0 || len(memberStrings) > 0 {
		flush()
	}
	return memberStrings, i
}

// assignOrdinals maps each label to its rank among the sorted distinct labels
// — canonical given canonical labels, and collision-free by construction
// (unlike hashing, which could silently merge non-bisimilar nodes).
func assignOrdinals(labels []string) []int {
	distinct := make([]string, len(labels))
	copy(distinct, labels)
	sort.Strings(distinct)
	distinct = compact(distinct)
	rank := make(map[string]int, len(distinct))
	for i, label := range distinct {
		rank[label] = i
	}
	out := make([]int, len(labels))
	for i, label := range labels {
		out[i] = rank[label]
	}
	return out
}

func compact(sorted []string) []string {
	out := sorted[:0]
	for i, s := range sorted {
		if i == 0 || s != sorted[i-1] {
			out = append(out, s)
		}
	}
	return out
}

// samePartition reports whether two ordinal assignments induce the same
// grouping (ordinal VALUES may permute between rounds while the partition is
// already stable — compare group structure, not labels).
func samePartition(a, b []int) bool {
	firstA := make(map[int]int)
	firstB := make(map[int]int)
	for i := range a {
		ra, okA := firstA[a[i]]
		rb, okB := firstB[b[i]]
		if okA != okB {
			return false
		}
		if !okA {
			firstA[a[i]] = i
			firstB[b[i]] = i
			continue
		}
		if ra != rb {
			return false
		}
	}
	return true
}

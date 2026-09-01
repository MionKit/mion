package convert_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

func TestChain_CycleThroughUnion(t *testing.T) {
	source := "export type Chain = {next: Chain | null};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

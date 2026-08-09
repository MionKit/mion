package convert_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/convert"
)

func TestChain_CycleThroughUnion(t *testing.T) {
	source := "export type Chain = {next: Chain | null};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	convertAndCheckIDs(t, schemaForm, convert.TargetType)
}

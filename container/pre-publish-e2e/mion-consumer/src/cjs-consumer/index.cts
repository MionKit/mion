// `import = require` of the ESM-only packages must resolve real types.
import router = require('@mionjs/router');
import runTypes = require('@mionjs/run-types');

export const createRouter: typeof router.createMionRouter = router.createMionRouter;
export const getRunTypeId: typeof runTypes.getRunTypeId = runTypes.getRunTypeId;

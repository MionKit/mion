// route options no types
export const optionsObjectWithNoTypes = {
    handler: (body) => ({sentence: `hello to ${body.username}`}),
    version: '1.0.0',
    logLevel: 'debug',
};

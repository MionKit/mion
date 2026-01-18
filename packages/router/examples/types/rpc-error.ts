class RpcError<ErrType extends string, ErrData = any> extends Error {
    /** Error type identifier - use this to identify errors */
    readonly type: ErrType;
    /** Public message sent to client */
    readonly publicMessage: string;
    /** Typed error data accessible on client */
    readonly errorData?: ErrData;
    /** Optional HTTP status code (transport detail, not for error identification) */
    statusCode?: number;
    /** Unique error ID (auto-generated if RouterOptions.autoGenerateErrorId is true) */
    readonly id?: string | number;

    constructor(opts: {type: ErrType; publicMessage: string; errorData?: ErrData; statusCode?: number; id?: string | number}) {
        super(opts.publicMessage);
        this.type = opts.type;
        this.publicMessage = opts.publicMessage;
        this.errorData = opts.errorData;
        this.statusCode = opts.statusCode;
        this.id = opts.id;
    }
}


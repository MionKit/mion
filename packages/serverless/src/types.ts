/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface AwsLambdaOptions {
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: Record<string, string>;
}

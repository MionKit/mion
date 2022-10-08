/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export const API_ROUTE_PARAMS_LENGTH = 4;
export const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.mts'];
export const ABSOLUTE_PATH_TOKEN = '/{{PROJECT_ROOT}}'; // used to sanitise absolute path in metadata output
// the types of the parameters of the router function call, keep same order as in the ApiRoute
export const ROUTE_PARAMETERS_EXPECTED_TYPE_NAME = ['any', 'FastifyRequest', 'FastifyReply', 'FastifyInstance'];


interface User {
    id: number,
    name: string,
};

const getUser = async (data: ReqData) => {
    const id = data.user.id;
    const user = await db.users.get(id);
    return user;
  };

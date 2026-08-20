/** Stand-in for your own models/repository layer, so the router examples compile as written. */

export interface User {
    id: number;
    name: string;
    surname: string;
}

export const userRepository = {
    async getUserById(id: number): Promise<User> {
        return {id, name: 'John', surname: 'Smith'};
    },
};

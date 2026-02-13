export interface User {
    id: number;
    name: string;
    surname: string;
    lastUpdate: Date;
}
export interface RawUser {
    id: number;
    name: string;
    surname: string;
    lastUpdate: string;
}
export type NewUser = Omit<User, "id" | "lastUpdate">;
export type UserId = User | number;
export type PartialUser = Partial<User> & {
    id: number;
};
export type SayHello = {
    hello: string;
};
export type HelloReply = {
    hello: string;
};
export declare type __ΩUser = any[];
export declare type __ΩRawUser = any[];
export declare type __ΩNewUser = any[];
export declare type __ΩUserId = any[];
export declare type __ΩPartialUser = any[];
export declare type __ΩSayHello = any[];
export declare type __ΩHelloReply = any[];
//# sourceMappingURL=models.d.ts.map
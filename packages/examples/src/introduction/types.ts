// Types used in ESLint rule examples

export interface User {
    id: number;
    name: string;
    email: string;
}

export interface Product {
    id: number;
    name: string;
    price: number;
}

export interface LogData {
    message: string;
    level: 'info' | 'warn' | 'error';
}

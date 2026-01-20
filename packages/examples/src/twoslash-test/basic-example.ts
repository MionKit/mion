/**
 * Simple example for twoslash testing with code-import
 */

interface Product {
    id: number;
    name: string;
    price: number;
}

const myProduct: Product = {
    id: 1,
    name: 'Widget',
    price: 29.99,
};

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
myProduct.name;
//        ^?

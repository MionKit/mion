// @errors: 2339 2322
// @noErrors: 1003
/**
 * Twoslash annotations demo - explicit type queries and features
 */
interface Product {
    id: number;
    name: string;
    price: number;
    inStock?: boolean;
}

const myProduct: Product = {
    id: 1,
    name: 'Widget',
    price: 29.99,
};

// display type popup
myProduct.name;
//        ^?

// display autocomplete (^| positioned right after the dot)
// prettier-ignore
myProduct.name;
//        ^|

// display error: Property does not exist
myProduct.hello = 'Super Widget';

// display error: Type not assignable
myProduct.price = '29.99';

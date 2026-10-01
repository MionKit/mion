import {createJsonEncoderFn, CircularReferenceError} from '@mionjs/run-types';

interface Category {
  name: string;
  parent?: Category;
}

const encodeCategory = createJsonEncoderFn<Category>(undefined, {
  rejectCircularRefs: true,
});

const root: Category = {name: 'root'};
root.parent = root; // a value that points back to itself

try {
  encodeCategory(root);
} catch (err) {
  if (err instanceof CircularReferenceError) console.log(err.message, err.path);
  // Circular reference detected at parent ['parent']
}

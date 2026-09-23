import {CircularReferenceError, createJsonEncoderFn} from '@mionjs/run-types';

// start-circular
interface ListItem {
  name: string;
  next?: ListItem;
}

const encodeItem = createJsonEncoderFn<ListItem>(undefined, {
  rejectCircularRefs: true,
});

const item: ListItem = {name: 'a'};
item.next = item;

try {
  encodeItem(item);
} catch (err) {
  if (err instanceof CircularReferenceError) console.log(err.path); // ['next']
}
// end-circular

export {encodeItem};

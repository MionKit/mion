<p align="center">
  <img alt='apids, json-schema-typeorm' src='https://raw.githubusercontent.com/apids/apids/master/logo/public/logo-squarex60.png' 
  width=60 height=60>
</p>
<p align="center">
    <strong><code>apids</code> <code>typeorm-schema</code></strong>
    <br/>
    Transforms TypeORM Entities into Json-schemas and viceversa 
</p>

---

## Features

- Json-Schema defintion for TypeORM Entities.
- Compiles Typescript entities into Json-schemas and viceversa.
- TypeORM Validation: validates if a Typescript or json file is a TypeORM entity.

&nbsp;

### Compiling Typescript To Json-Schema.

```ts
//filename: src/user.ts
import {Entity, PrimaryGeneratedColumn, Column} from 'typeorm';
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  firstName: string;
}
```

```ts
import * as fs fomr 'fs';
import {JsonSchema} from '@apids/typeormSchema';

const typescrip = fs.readFileSync('src/user.ts');
const json_schema = new JsonSchema(typescrip).compile();
fs.writeFileSync('schemas/user.json',json_schema);
```

&nbsp;

### Compiling Json-Schema to Typescript.

```ts
//filename: schemas/user.json
{
    id:'/user'
    type: 'object',
    properites:{
        //TODO: finish the schema example
    }
}
```

```ts
import * as fs fomr 'fs';
import {Typescript} from '@apids/typeormSchema';

const json_schema = fs.readFileSync('schemas/user.json');
const typescrip = Typescript(json_schema).compile();
fs.writeFileSync('src/user.ts',json_schema);
```

&nbsp;

### Validating json TypeORM entities.

Below json is not a valid TypeORM entity (nested objects not allowed)

```ts
//filename: schemas/user.json
{
    id:'/user'
    type: 'object',
    properites:{
        //TODO: finish the schema example
        ...
        friend: {
            id:'/friend'
            type: 'object',
            properites:{ ...}
        }
    }
}
```

```ts
import * as fs fomr 'fs';
import {JsonSchema} from '@apids/typeormSchema';

const json_schema = fs.readFileSync('schemas/user.json');
JsonSchema.validate(json_schema); //fail: nested objects not allowed
```

&nbsp;

### Validating Typescript TypeORM entities.

Below Typescript is not a TypeORM entity (mising @Entity annotation)

```ts
//filename: src/user.ts
export class User {
  id: number;
  firstName: string;
}
```

```ts
import * as fs fomr 'fs';
import {Typescript} from '@apids/typeormSchema';

const typescrip = fs.readFileSync('src/user.ts');
Typescript.validate(json_schema); //fail: mising @Entity() annotation.
```

## &nbsp;

_License: [MIT](./LICENSE)_

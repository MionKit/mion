import {Hono} from 'hono';
import {typiaValidator} from '@hono/typia-validator';
import typia from 'typia';

interface IBbsArticle {
    // ❌ Must declare type separately
    id: string;
    title: string;
    body: string;
    created_at: string;
}

// ❌ Must create validator with explicit generic type
const validate = typia.createValidate<IBbsArticle>();

const app = new Hono();

app.post(
    '/',
    typiaValidator('json', validate), // ❌ Pass validator as middleware
    (c) => {
        const data = c.req.valid('json');
        return c.json({id: data.id, title: data.title, body: data.body});
    }
);

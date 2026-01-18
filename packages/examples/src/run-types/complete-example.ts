import {
    createIsTypeFn,
    createTypeErrorsFn,
    createJsonStringifyFn,
    createRestoreFromJsonFn,
    createMockTypeFn,
} from '@mionkit/run-types';

interface BlogPost {
    id: string;
    title: string;
    content: string;
    author: {
        name: string;
        email: string;
    };
    tags: string[];
    publishedAt: Date;
    metadata: Map<string, any>;
}

async function completeExample() {
    // Create all needed functions
    const isPost = await createIsTypeFn<BlogPost>();
    const getErrors = await createTypeErrorsFn<BlogPost>();
    const stringify = await createJsonStringifyFn<BlogPost>();
    const restore = await createRestoreFromJsonFn<BlogPost>();
    const mockPost = await createMockTypeFn<BlogPost>();

    // Generate mock data
    const post = mockPost();

    // Validate
    if (isPost(post)) {
        // Serialize to JSON (does not mutate original)
        const json = stringify(post);

        // Deserialize
        const parsed = JSON.parse(json);
        const restored = restore(parsed);
        // restored.publishedAt is a Date
        // restored.metadata is a Map
    } else {
        const errors = getErrors(post);
        console.log('Validation failed:', errors);
    }
}


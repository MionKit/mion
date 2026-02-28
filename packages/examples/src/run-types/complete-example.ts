import {
    createIsTypeFn,
    createTypeErrorsFn,
    createStringifyJsonFn,
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

// Create all needed functions
const isPost = await createIsTypeFn<BlogPost>();
const getPostErrors = await createTypeErrorsFn<BlogPost>();
const stringifyPost = await createStringifyJsonFn<BlogPost>();
const restorePost = await createRestoreFromJsonFn<BlogPost>();
const mockPost = await createMockTypeFn<BlogPost>();

// Generate mock data
const post = mockPost();

// Validate
if (isPost(post)) {
    // Serialize to JSON (does not mutate original)
    const json = stringifyPost(post);

    // Deserialize
    const parsed = JSON.parse(json);
    const restored = restorePost(parsed);
    // restored.publishedAt is a Date
    // restored.metadata is a Map
} else {
    const errors = getPostErrors(post);
    console.log('Validation failed:', errors);
}

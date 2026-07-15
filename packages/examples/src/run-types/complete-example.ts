import {createValidate, createGetValidationErrors, createJsonEncoder, createJsonDecoder, createMockData} from '@mionjs/run-types';

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

// The public run-types factory functions (all synchronous, no await needed).
const isPost = createValidate<BlogPost>();
const getPostErrors = createGetValidationErrors<BlogPost>();
const encodePost = createJsonEncoder<BlogPost>();
const decodePost = createJsonDecoder<BlogPost>();
const mockPost = createMockData<BlogPost>();

// Generate mock data
const post = mockPost();

// Validate
if (isPost(post)) {
    // Serialize to a JSON string (does not mutate the original)
    const json = encodePost(post);

    // Deserialize back to a typed value (publishedAt -> Date, metadata -> Map)
    const restored = decodePost(json!);
} else {
    const errors = getPostErrors(post);
    console.log('Validation failed:', errors);
}

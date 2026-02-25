import {z} from 'zod';

// Zod example - schema is source of truth
const UserSchema = z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
});
type User = z.infer<typeof UserSchema>;

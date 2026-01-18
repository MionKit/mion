import {Routes, route} from '@mionkit/router';
import {runType} from '@mionkit/run-types';

interface User {
    id: string;
    name: string;
}

interface AuditLog {
    action: string;
    timestamp: Date;
}

declare function findUser(id: string): User;

const routes = {
    // ✅ User type WILL be compiled (exposed in return type)
    getUser: route((ctx, id: string): User => {
        return findUser(id);
    }),

    // ✅ string parameter WILL be compiled
    saveUser: route((ctx, name: string): void => {
        // ...
    }),
} satisfies Routes;

// ❌ AuditLog type will NOT be compiled!
// It's not used in any route parameter or return type
async function logAction(log: AuditLog): Promise<void> {
    const validate = await runType<AuditLog>().createJitFunction('isType');
    // This will fail in secure environments (no JIT available)
}

// ❌ This route won't be compiled if it's in a file
// that is not imported by the start script
// routes-admin.ts (not imported)
const adminRoutes = {
    deleteUser: route((ctx, id: string): void => {
        /* ... */
    }),
};


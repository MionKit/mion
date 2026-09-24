---
title: *Typed match* coming soon to run-types
subtitle: Match unknown data by type. The runtime check is generated at build time.
file: feed.ts
highlight: 11-12
footer: No schemas to keep in sync. Just TypeScript.
badge: @mionjs/run-types
---

```ts
import { match } from '@mionjs/run-types';

interface User  { id: number; name: string; email: string }
interface Order { orderId: string; total: number; items: string[] }

// straight from the network: no types, no trust
const data: unknown = await fetch('/api/feed').then(res => res.json());

// every when<T> is a real runtime check, built from T
const message = match(data)
  .when<User>(user => `👋 Hi ${user.name}`)
  .when<Order>(order => `🧾 ${order.items.length} items, $${order.total}`)
  .otherwise(() => '🤷 Not something I know');

message; // string, and every branch is fully typed
```

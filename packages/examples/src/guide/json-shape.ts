import type {JSONShape} from '@mionjs/run-types';

interface Order {
  id: string;
  total: bigint;
  placedAt: Date;
  tags: Set<string>;
}

type OrderJson = JSONShape<Order>;
// {id: string; total: `${bigint}`; placedAt: string; tags: string[]}

const fromAnotherService: OrderJson = {
  id: 'o-1',
  total: '4999',
  placedAt: '2024-05-01T10:00:00.000Z',
  tags: ['gift'],
};

export {fromAnotherService};

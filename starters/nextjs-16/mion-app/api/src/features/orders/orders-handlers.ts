import {route, Routes} from '@mionkit/router';
import {FormatUUIDv7} from '@mionkit/type-formats/StringFormats';
import {Order, OrderEvent} from './orders-models.ts';
import {findAllOrders, findOrderById, insertOrder, findEventsByOrderId, findEventsByOrderIds} from './orders-repository.ts';

export const ordersRoutes = {
    listOrders: route((): Order[] => {
        return findAllOrders();
    }),
    getOrder: route((ctx, id: FormatUUIDv7): Order | undefined => {
        return findOrderById(id);
    }),
    createOrder: route((ctx, customer: string, total: number, id?: FormatUUIDv7): Order => {
        return insertOrder(customer, total, id);
    }),

    getOrderEvents: route((ctx, orderId: FormatUUIDv7): OrderEvent[] => {
        return findEventsByOrderId(orderId);
    }),
    getOrdersEvents: route((ctx, orderIds: FormatUUIDv7[]): OrderEvent[] => {
        return findEventsByOrderIds(orderIds);
    }),
} satisfies Routes;

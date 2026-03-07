'use client';

import {useState, useEffect} from 'react';
import {initClient, routesFlow, mapFrom} from '@mionkit/client';
import type {MyApi} from '@mion-app/api';
import type {Order, OrderEvent} from '@/api/src/features/orders/orders-models';

// Initialize mion client — fully typed RPC, automatic Date deserialization
const {routes} = initClient<MyApi>({
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',
  prefix: 'api/mion',
});

// ---- Event styling per type (discriminated union in action) ----

const eventStyles: Record<string, {color: string; icon: string; label: string}> = {
  placed: {color: '#3b82f6', icon: '\u{1F4E6}', label: 'Order Placed'},
  paid: {color: '#10b981', icon: '\u{1F4B3}', label: 'Payment Received'},
  shipped: {color: '#f59e0b', icon: '\u{1F69A}', label: 'Shipped'},
  delivered: {color: '#22c55e', icon: '\u2705', label: 'Delivered'},
  cancelled: {color: '#ef4444', icon: '\u274C', label: 'Cancelled'},
};

function EventDetails({event}: {event: OrderEvent}) {
  switch (event.type) {
    case 'paid':
      return <span style={{color: '#6b7280'}}>via {event.method}</span>;
    case 'shipped':
      return (
        <span style={{color: '#6b7280'}}>
          {event.carrier} &middot; {event.tracking}
        </span>
      );
    case 'cancelled':
      return <span style={{color: '#ef4444'}}>{event.reason}</span>;
    default:
      return null;
  }
}

// ---- Components ----

function EventTimeline({events}: {events: OrderEvent[]}) {
  return (
    <div style={{position: 'relative', paddingLeft: '32px'}}>
      <div
        style={{
          position: 'absolute',
          left: '15px',
          top: '0',
          bottom: '0',
          width: '2px',
          backgroundColor: '#e5e7eb',
        }}
      />
      {events.map((event, i) => {
        const style = eventStyles[event.type];
        return (
          <div key={i} style={{position: 'relative', paddingBottom: '24px'}}>
            <div
              style={{
                position: 'absolute',
                left: '-25px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: style.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
              }}
            >
              {style.icon}
            </div>
            <div>
              <div style={{fontWeight: 600}}>{style.label}</div>
              <div style={{fontSize: '13px', color: '#6b7280'}}>{event.at.toLocaleString()}</div>
              <div style={{fontSize: '13px', marginTop: '2px'}}>
                <EventDetails event={event} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderCard({order, events}: {order: Order; events: OrderEvent[]}) {
  const statusColors: Record<string, string> = {
    pending: '#f59e0b',
    paid: '#10b981',
    shipped: '#3b82f6',
    delivered: '#22c55e',
    cancelled: '#ef4444',
  };

  return (
    <div style={{border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', marginBottom: '16px'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
        <div>
          <h2 style={{fontSize: '18px', fontWeight: 600, marginBottom: '4px'}}>{order.customer}</h2>
          <span style={{fontFamily: 'monospace', fontSize: '13px', color: '#6b7280'}}>{order.id}</span>
        </div>
        <div style={{textAlign: 'right'}}>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'white',
              backgroundColor: statusColors[order.status] || '#6b7280',
            }}
          >
            {order.status}
          </span>
          <div style={{fontSize: '14px', fontWeight: 600, marginTop: '8px'}}>${order.total.toFixed(2)}</div>
          <div style={{fontSize: '13px', color: '#6b7280'}}>{order.createdAt.toLocaleDateString()}</div>
        </div>
      </div>
      {events.length > 0 && (
        <>
          <h3 style={{fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: '#374151'}}>Event Timeline</h3>
          <EventTimeline events={events} />
        </>
      )}
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [eventsByOrder, setEventsByOrder] = useState<Record<string, OrderEvent[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Single HTTP request: listOrders -> mapFrom extracts IDs server-side -> getOrdersEvents
    const ordersList = routes.orders.listOrders();
    const orderIds = mapFrom(ordersList, (orders) => orders!.map((o) => o.id)).type();

    routesFlow([ordersList, routes.orders.getOrdersEvents(orderIds)]).then(
      ([[ordersData, allEvents]]) => {
        if (ordersData) setOrders(ordersData);
        if (allEvents) {
          const eventsMap: Record<string, OrderEvent[]> = {};
          for (const event of allEvents) {
            (eventsMap[event.orderId] ??= []).push(event);
          }
          setEventsByOrder(eventsMap);
        }
        setLoading(false);
      }
    );
  }, []);

  if (loading) return <div style={{padding: '40px', textAlign: 'center'}}>Loading orders...</div>;

  return (
    <div style={{maxWidth: '900px', margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif'}}>
      <h1 style={{fontSize: '24px', fontWeight: 700, marginBottom: '8px'}}>Orders</h1>
      <p style={{color: '#6b7280', marginBottom: '32px'}}>
        Mion showcase: routesFlow batches multiple routes into a single HTTP request
      </p>

      {orders.map((order) => (
        <OrderCard key={order.id} order={order} events={eventsByOrder[order.id] || []} />
      ))}
    </div>
  );
}

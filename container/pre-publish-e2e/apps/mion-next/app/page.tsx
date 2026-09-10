// A plain page, so the app is a real Next app and not just a bag of route handlers.
// The interesting work happens in app/selftest/route.ts.
export default function Page() {
  return (
    <main>
      <div id="mion-app">mion next e2e</div>
    </main>
  );
}

// Preflight: fail fast with a friendly message if the app's port is taken,
// instead of a raw EADDRINUSE stack trace (and before PM2 would crash-loop).
import net from 'node:net';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const tester = net.createServer();

tester.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n✖ Port ${PORT} is already in use — the app can't start.\n`);
    console.error('Something is already listening on that port. Most likely one of:');
    console.error('  • a background instance        → run:  npm run bg:stop');
    console.error('  • "npm run dev" in another tab → stop it with Ctrl+C');
    console.error('  • another program on the port  → close it, or use another port:');
    console.error(`        PORT=3002 npm run bg:start   (then open http://localhost:3002)\n`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

tester.once('listening', () => {
  tester.close(() => process.exit(0));
});

// Bind with no host to mirror the app's `app.listen(PORT)` so detection matches.
tester.listen(PORT);

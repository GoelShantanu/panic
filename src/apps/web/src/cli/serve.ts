import pg from 'pg';
import { mailerFromEnv } from '@stockpanic/mail';
import { createGoogleVerifier } from '../google.ts';
import { createApiServer } from '../server.ts';

const url = process.env['DATABASE_URL'];
const authSecret = process.env['AUTH_SECRET'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
if (!authSecret || authSecret.length < 32) {
  console.error('AUTH_SECRET must be set to at least 32 characters (keys sign-in code hashes)');
  process.exit(2);
}
const port = Number(process.env['PORT'] ?? 3000);
const googleClientId = process.env['GOOGLE_CLIENT_ID'];

const pool = new pg.Pool({ connectionString: url, max: 10 });
const server = createApiServer(pool, {
  mailer: mailerFromEnv(),
  authSecret,
  google: googleClientId ? createGoogleVerifier(googleClientId) : null,
});
server.listen(port, () => console.log(`api listening on :${port}${googleClientId ? '' : ' (Google sign-in disabled: GOOGLE_CLIENT_ID unset)'}`));

const shutdown = () => server.close(() => void pool.end());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

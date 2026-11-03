import 'dotenv/config';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';

const app = createApp(pool);

export default app;
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST ,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER ,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  // pg-pool ya retira la conexión dañada; mantenemos el proceso vivo para que
  // las siguientes peticiones puedan volver a intentar conectarse.
  console.error('Conexión PostgreSQL inactiva cerrada:', err.message);
});

export const query = (text, params) => pool.query(text, params);

export default pool;

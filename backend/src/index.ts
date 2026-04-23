import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import dataSourcesRouter from './routes/dataSources';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/data-sources', dataSourcesRouter);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

export default app;

import express from 'express';
import cors from 'cors';
import { calculatorRouter } from './routes/calculator.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/calculator', calculatorRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

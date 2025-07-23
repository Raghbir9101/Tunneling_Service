const express = require('express');
const app = express();
const PORT = 7860;

// Middleware
app.use(express.json());

// Test routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hello from local test server!', 
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'success', 
    data: 'This is a test API endpoint',
    query: req.query
  });
});

app.post('/api/echo', (req, res) => {
  res.json({
    method: req.method,
    body: req.body,
    headers: req.headers,
    echo: 'Data received successfully'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'test-server',
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Test server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /');
  console.log('  GET  /api/test');
  console.log('  POST /api/echo');
  console.log('  GET  /health');
}); 
const { default: axios } = require('axios');
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

// Streaming test endpoint
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  console.log('Starting stream...');
  
  let counter = 0;
  const interval = setInterval(() => {
    counter++;
    const data = {
      message: `Streaming message ${counter}`,
      timestamp: new Date().toISOString(),
      counter: counter
    };
    
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    if (counter >= 10) {
      clearInterval(interval);
      res.write('data: [DONE]\n\n');
      res.end();
      console.log('Stream completed');
    }
  }, 1000);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected from stream');
    clearInterval(interval);
  });
});

// Chat-like streaming endpoint (simulates AI response)
app.post('/api/chat/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  
  const message = req.body.message || 'Hello';
  const response = `This is a streaming response to your message: "${message}". `;
  const words = response.split(' ');
  
  console.log('Starting chat stream...');
  
  let wordIndex = 0;
  const interval = setInterval(() => {
    if (wordIndex < words.length) {
      res.write(words[wordIndex] + ' ');
      wordIndex++;
    } else {
      res.end();
      clearInterval(interval);
      console.log('Chat stream completed');
    }
  }, 200);
  
  req.on('close', () => {
    console.log('Client disconnected from chat stream');
    clearInterval(interval);
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Test server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /');
  console.log('  GET  /api/test');
  console.log('  POST /api/echo');
  console.log('  GET  /health');
  console.log('  GET  /api/stream        (Server-Sent Events)');
  console.log('  POST /api/chat/stream   (Chunked streaming)');
}); 


const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
  }
});

// Store active tunnels and pending requests
const tunnels = new Map();
const pendingRequests = new Map();

// Middleware to parse JSON and handle larger payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ limit: '50mb', type: 'application/octet-stream' }));

// Handle tunnel client connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Register tunnel
  socket.on('register-tunnel', (data) => {
    const { tunnelId, subdomain } = data;
    tunnels.set(subdomain, {
      socketId: socket.id,
      tunnelId,
      socket: socket
    });
    
    console.log(`Tunnel registered: ${subdomain} -> ${socket.id}`);
    socket.emit('tunnel-registered', { success: true, subdomain });
  });
  
  // Handle responses from local server
  socket.on('request-response', (data) => {
    const { requestId, statusCode, headers, body, error } = data;
    
    if (pendingRequests.has(requestId)) {
      const { res } = pendingRequests.get(requestId);
      
      if (error) {
        res.status(500).json({ error: 'Internal server error' });
      } else {
        // Set headers
        if (headers) {
          Object.keys(headers).forEach(key => {
            res.set(key, headers[key]);
          });
        }
        
        res.status(statusCode || 200);
        
        // Handle different content types
        if (typeof body === 'string') {
          res.send(body);
        } else if (Buffer.isBuffer(body)) {
          res.send(body);
        } else {
          res.json(body);
        }
      }
      
      pendingRequests.delete(requestId);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove tunnel registration
    for (const [subdomain, tunnel] of tunnels.entries()) {
      if (tunnel.socketId === socket.id) {
        tunnels.delete(subdomain);
        console.log(`Tunnel unregistered: ${subdomain}`);
        break;
      }
    }
  });
});

// Catch-all route to handle tunnel requests
app.all('*', (req, res) => {
  const host = req.get('host');
  let subdomain;
  
  // Handle localhost testing - use first available tunnel
  if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'))) {
    const availableTunnels = Array.from(tunnels.keys());
    subdomain = availableTunnels.length > 0 ? availableTunnels[0] : null;
    console.log(`Localhost request, using tunnel: ${subdomain}`);
  } else {
    // Production subdomain extraction
    subdomain = host ? host.split('.')[0] : null;
  }
  
  console.log(`Request for: ${host}${req.path} -> tunnel: ${subdomain}`);
  
  if (!subdomain || !tunnels.has(subdomain)) {
    return res.status(404).json({ 
      error: 'Tunnel not found',
      message: `No tunnel registered for ${host}. Available tunnels: ${Array.from(tunnels.keys()).join(', ')}`
    });
  }
  
  const tunnel = tunnels.get(subdomain);
  const requestId = uuidv4();
  
  // Store the response object for later use
  pendingRequests.set(requestId, { res });
  
  // Prepare request data
  const requestData = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    headers: req.headers,
    body: req.body
  };
  
  // Forward request to local server
  tunnel.socket.emit('http-request', requestData);
  
  // Set timeout for request
  setTimeout(() => {
    if (pendingRequests.has(requestId)) {
      pendingRequests.delete(requestId);
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway timeout' });
      }
    }
  }, 30000); // 30 second timeout
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    tunnels: Array.from(tunnels.keys()),
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`VPS Relay Server running on port ${PORT}`);
  console.log(`Health check: http://${process.env.IP}:${PORT}/health`);
});
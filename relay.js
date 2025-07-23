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
    
    console.log(`✅ Tunnel registered: ${subdomain} -> ${socket.id}`);
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
  let tunnelName;
  let targetPath;
  
  // Extract tunnel name from path: /tunnel-name/rest/of/path
  const pathParts = req.path.split('/').filter(part => part.length > 0);
  
  if (pathParts.length === 0) {
    // Root path - show available tunnels
    return res.json({
      message: 'Tunneling Service',
      available_tunnels: Array.from(tunnels.keys()),
      usage: 'Use /{tunnel-name}/path/to/endpoint',
      examples: Array.from(tunnels.keys()).map(name => `${req.protocol}://${host}/${name}/`)
    });
  }
  
  tunnelName = pathParts[0];
  targetPath = '/' + pathParts.slice(1).join('/');
  
  console.log(`Request for: ${host}${req.path} -> tunnel: ${tunnelName}, target: ${targetPath}`);
  
  if (!tunnels.has(tunnelName)) {
    return res.status(404).json({ 
      error: 'Tunnel not found',
      message: `No tunnel registered with name '${tunnelName}'`,
      available_tunnels: Array.from(tunnels.keys()),
      usage: 'Use /{tunnel-name}/path/to/endpoint'
    });
  }
  
  const tunnel = tunnels.get(tunnelName);
  const requestId = uuidv4();
  
  // Store the response object for later use
  pendingRequests.set(requestId, { res });
  
  // Prepare request data with modified path
  const requestData = {
    requestId,
    method: req.method,
    path: targetPath,
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

// Health check endpoint - before the catch-all route
app.get('/__health', (req, res) => {
  res.json({ 
    status: 'ok', 
    active_tunnels: Array.from(tunnels.keys()),
    tunnel_count: tunnels.size,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VPS Relay Server running on port ${PORT}`);
  console.log(`📊 Health check: http://${process.env.IP}:${PORT}/__health`);
  console.log(`🔗 Tunnel access: http://${process.env.IP}:${PORT}/{tunnel-name}/`);
});
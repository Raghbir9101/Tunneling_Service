const { io } = require('socket.io-client');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

class TunnelClient {
  constructor(config) {
    this.vpsUrl = config.vpsUrl;
    this.localPort = config.localPort;
    this.subdomain = config.subdomain || `tunnel-${Date.now()}`;
    this.tunnelId = uuidv4();
    this.socket = null;
    this.localUrl = `http://localhost:${this.localPort}`;
  }
  
  connect() {
    console.log(`Connecting to VPS: ${this.vpsUrl}`);
    
    this.socket = io(this.vpsUrl, {
      transports: ['websocket'],
      upgrade: false
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to VPS relay server');
      this.registerTunnel();
    });
    
    this.socket.on('tunnel-registered', (data) => {
      if (data.success) {
        console.log(`✅ Tunnel active!`);
        console.log(`🌐 Public URL: http://${this.vpsUrl.replace('http://', '').replace('https://', '')}/${this.subdomain}/`);
        console.log(`🏠 Local service: ${this.localUrl}`);
        console.log(`📝 Usage: Access your service at /{tunnel-name}/path`);
      } else {
        console.error('Failed to register tunnel:', data.error);
      }
    });
    
    this.socket.on('http-request', (requestData) => {
      this.handleRequest(requestData);
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from VPS');
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
    });
  }
  
  registerTunnel() {
    this.socket.emit('register-tunnel', {
      tunnelId: this.tunnelId,
      subdomain: this.subdomain
    });
  }
  
  async handleRequest(requestData) {
    const { requestId, method, path, query, headers, body } = requestData;
    
    try {
      console.log(`${method} ${path}`);
      
      // Build the full URL with query parameters
      const url = new URL(path, this.localUrl);
      Object.keys(query || {}).forEach(key => {
        url.searchParams.append(key, query[key]);
      });
      
      // Prepare request config
      const config = {
        method: method.toLowerCase(),
        url: url.toString(),
        headers: {
          ...headers,
          // Remove host header to avoid conflicts
          host: undefined
        },
        data: body,
        timeout: 25000, // 25 second timeout
        validateStatus: () => true // Accept all status codes
      };
      
      // Make request to local AI model
      const response = await axios(config);
      
      // Send response back to VPS
      this.socket.emit('request-response', {
        requestId,
        statusCode: response.status,
        headers: response.headers,
        body: response.data
      });
      
    } catch (error) {
      console.error('Error handling request:', error.message);
      
      // Send error response
      this.socket.emit('request-response', {
        requestId,
        error: error.message,
        statusCode: 500
      });
    }
  }
  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Configuration
const config = {
  vpsUrl: `http://${process.env.IP}:${process.env.PORT}`, // Replace with your VPS IP:PORT
  localPort: 7860, // Port where your AI model is running
  subdomain: 'my-ai-model' // Choose your tunnel name (used in path: /my-ai-model/)
};

// Create and start tunnel
const tunnel = new TunnelClient(config);
tunnel.connect();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down tunnel...');
  tunnel.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  tunnel.disconnect();
  process.exit(0);
});
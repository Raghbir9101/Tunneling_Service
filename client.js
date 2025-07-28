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
      upgrade: false,
      timeout: 60000, // 60 second connection timeout
      pingTimeout: 60000, // 60 seconds to wait for pong
      pingInterval: 25000, // Send ping every 25 seconds
      maxHttpBufferSize: 1e8, // 100MB buffer for large responses
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
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
        validateStatus: () => true, // Accept all status codes
        responseType: 'stream', // Enable streaming
        timeout: 0, // No timeout for streaming requests
        maxRedirects: 5,
        // Keep connection alive for streaming
        httpAgent: new (require('http').Agent)({ keepAlive: true }),
        httpsAgent: new (require('https').Agent)({ keepAlive: true })
      };
      
      // Make request to local service
      const response = await axios(config);
      
      // Check if response should be streamed
      const contentType = response.headers['content-type'] || '';
      const isStreamingResponse = contentType.includes('text/event-stream') || 
                                contentType.includes('application/x-ndjson') ||
                                contentType.includes('text/plain') && response.headers['transfer-encoding'] === 'chunked';
      
      if (isStreamingResponse) {
        console.log('Handling streaming response');
        
        // Send stream start event
        this.socket.emit('stream-start', {
          requestId,
          statusCode: response.status,
          headers: response.headers
        });
        
        // Handle streaming data
        response.data.on('data', (chunk) => {
          this.socket.emit('stream-chunk', {
            requestId,
            chunk: chunk.toString()
          });
        });
        
        response.data.on('end', () => {
          console.log('Stream ended');
          this.socket.emit('stream-end', {
            requestId
          });
        });
        
        response.data.on('error', (error) => {
          console.error('Stream error:', error);
          this.socket.emit('stream-error', {
            requestId,
            error: error.message
          });
        });
        
      } else {
        // Handle regular (non-streaming) response
        let responseData = '';
        response.data.on('data', (chunk) => {
          responseData += chunk;
        });
        
        response.data.on('end', () => {
          // Try to parse as JSON if possible, otherwise send as string
          let body = responseData;
          try {
            if (contentType.includes('application/json')) {
              body = JSON.parse(responseData);
            }
          } catch (e) {
            // Keep as string if JSON parsing fails
          }
          
          // Send response back to VPS
          this.socket.emit('request-response', {
            requestId,
            statusCode: response.status,
            headers: response.headers,
            body: body
          });
        });
      }
      
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
  vpsUrl: `https://${process.env.IP}:${process.env.PORT}`, // Replace with your VPS IP:PORT
  localPort: 1234, // Port where your AI model is running
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
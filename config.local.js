// Local testing configuration
// Copy this to .env or set these environment variables

module.exports = {
  IP: 'localhost',  // For local testing, use your VPS IP for production
  PORT: '3001'      // Relay server port
};

// To use: 
// 1. Create .env file with:
//    IP=localhost
//    PORT=3001
// 2. Or set environment variables:
//    set IP=localhost && set PORT=3001 
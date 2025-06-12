# UnityVerse Signaling Server

WebRTC signaling server for UnityVerse - connects Quest VR and mobile devices.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start server (no auth - development)
npm start

# Start with authentication
npm run start:auth
```

## Configuration

Edit `.env` file:

```env
PORT=8080                    # Server port
REQUIRE_AUTH=true           # Enable authentication
AUTH_KEY=your-secret-key    # Authentication key
MAX_CLIENTS_PER_ROOM=10     # Max clients per room
```

## Endpoints

- `ws://localhost:8080` - WebSocket connection
- `http://localhost:8080/auth` - Authentication endpoint
- `http://localhost:8080/health` - Health check
- `http://localhost:8080/rooms` - List active rooms

## Unity Client Setup

1. **Quest App**: Set `requireAuthentication: true` in ConnectionConfig
2. **Mobile App**: Set `requireAuthentication: true` in ConnectionConfig
3. Both apps should use the same `authKey` as configured in server

## Production Deployment

```bash
# Set production environment variables
export REQUIRE_AUTH=true
export AUTH_KEY=your-production-key
export PORT=443

# Run with PM2
pm2 start server.js --name unityverse-signaling
```

## Security Features

- Token-based authentication
- Rate limiting per IP
- Message size limits
- Input sanitization
- Room capacity limits
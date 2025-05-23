const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const tokenManager = require('./auth/tokenManager');

// Load environment variables from .env file if it exists
try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        });
        console.log('Loaded .env file');
    }
} catch (error) {
    // Ignore if .env doesn't exist
}

const PORT = process.env.PORT || 8080;
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

// Create HTTP server for authentication endpoint
const server = http.createServer((req, res) => {
    const { pathname } = url.parse(req.url);
    
    if (pathname === '/auth' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { clientId, clientType, authKey } = JSON.parse(body);
                
                // Simple auth key validation (in production, validate against database)
                const expectedAuthKey = process.env.AUTH_KEY || 'development-key';
                if (authKey !== expectedAuthKey) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid auth key' }));
                    return;
                }
                
                const token = tokenManager.generateToken(clientId, clientType);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token }));
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

const wss = new WebSocket.Server({ server });

const clients = new Map();
const rooms = new Map();

// Error handler wrapper
function handleError(context, error) {
    console.error(`[ERROR] ${context}:`, error.message);
    if (error.stack) {
        console.error(error.stack);
    }
}

// Validate message format
function validateMessage(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid message format');
    }
    
    if (!data.type || typeof data.type !== 'string') {
        throw new Error('Message type is required');
    }
    
    return true;
}

// Send error to client
function sendError(ws, error, context) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'error',
            error: error.message,
            context: context
        }));
    }
}

wss.on('connection', (ws, req) => {
    const connectionId = Date.now() + '_' + Math.random();
    const query = url.parse(req.url, true).query;
    
    // Check authentication if required
    if (REQUIRE_AUTH) {
        const token = query.token;
        if (!token) {
            ws.close(1008, 'Authentication required');
            return;
        }
        
        const tokenData = tokenManager.validateToken(token);
        if (!tokenData) {
            ws.close(1008, 'Invalid or expired token');
            return;
        }
        
        // Store authenticated client info
        ws.authenticated = true;
        ws.authData = tokenData;
    }
    
    console.log(`New client connected: ${connectionId}${ws.authenticated ? ' (authenticated)' : ''}`);
    
    // Heartbeat to detect disconnected clients
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
            validateMessage(data);
        } catch (error) {
            handleError('Parsing message', error);
            sendError(ws, error, 'message_parse');
            return;
        }
        
        console.log(`Received from ${connectionId}:`, JSON.stringify(data));
        
        try {
            // Handle client registration
            if (data.type === 'register') {
                if (!data.peerId || !data.clientType || !data.roomId) {
                    throw new Error('Missing required fields: peerId, clientType, roomId');
                }
                
                // Validate room ID format
                if (!/^[a-zA-Z0-9_-]+$/.test(data.roomId)) {
                    throw new Error('Invalid room ID format');
                }
                
                const clientInfo = {
                    ws: ws,
                    connectionId: connectionId,
                    peerId: data.peerId,
                    clientType: data.clientType,
                    roomId: data.roomId,
                    authenticated: ws.authenticated || false
                };
                
                clients.set(ws, clientInfo);
                
                // Add to room
                if (!rooms.has(data.roomId)) {
                    rooms.set(data.roomId, new Set());
                }
                rooms.get(data.roomId).add(ws);
                
                console.log(`Client registered: ${data.peerId} (${data.clientType}) in room ${data.roomId}`);
                console.log(`Room ${data.roomId} now has ${rooms.get(data.roomId).size} clients`);
                
                // Send registration confirmation
                ws.send(JSON.stringify({
                    type: 'registered',
                    roomId: data.roomId,
                    peerId: data.peerId
                }));
                
                // Notify others in room
                broadcastToRoom(ws, data.roomId, {
                    type: 'peer-joined',
                    peerId: data.peerId,
                    clientType: data.clientType
                });
                return;
            }
            
            // Broadcast all other messages to room
            const sender = clients.get(ws);
            if (sender && sender.roomId) {
                console.log(`Broadcasting ${data.type} from ${sender.clientType} to room ${sender.roomId}`);
                broadcastToRoom(ws, sender.roomId, data);
            } else {
                throw new Error('Client not registered or missing room');
            }
        } catch (error) {
            handleError('Processing message', error);
            sendError(ws, error, 'message_process');
        }
    });

    ws.on('close', (code, reason) => {
        try {
            const clientInfo = clients.get(ws);
            if (clientInfo) {
                console.log(`Client disconnected: ${clientInfo.peerId} (${clientInfo.clientType}) - Code: ${code}, Reason: ${reason}`);
                
                // Remove from room
                if (clientInfo.roomId) {
                    const room = rooms.get(clientInfo.roomId);
                    if (room) {
                        room.delete(ws);
                        console.log(`Room ${clientInfo.roomId} now has ${room.size} clients`);
                        
                        // Notify others
                        broadcastToRoom(ws, clientInfo.roomId, {
                            type: 'peer-left',
                            peerId: clientInfo.peerId,
                            clientType: clientInfo.clientType
                        });
                        
                        if (room.size === 0) {
                            rooms.delete(clientInfo.roomId);
                            console.log(`Room ${clientInfo.roomId} deleted (empty)`);
                        }
                    }
                }
            }
            clients.delete(ws);
        } catch (error) {
            handleError('Client disconnect', error);
        }
    });

    ws.on('error', (error) => {
        handleError(`WebSocket error for ${connectionId}`, error);
    });
});

// Broadcast to all clients in a room except sender
function broadcastToRoom(senderWs, roomId, message) {
    try {
        const room = rooms.get(roomId);
        if (!room) {
            console.warn(`Room ${roomId} not found`);
            return;
        }
        
        const messageStr = JSON.stringify(message);
        let sent = 0;
        let failed = 0;
        
        room.forEach((clientWs) => {
            if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
                try {
                    clientWs.send(messageStr);
                    sent++;
                } catch (error) {
                    failed++;
                    handleError('Broadcasting to client', error);
                }
            }
        });
        
        console.log(`Broadcasted to ${sent} clients in room ${roomId}${failed > 0 ? ` (${failed} failed)` : ''}`);
    } catch (error) {
        handleError('Broadcasting to room', error);
    }
}

// Heartbeat interval to detect stale connections
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log('Terminating stale connection');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`Signaling server running on ws://localhost:${PORT}`);
    console.log(`Authentication endpoint: http://localhost:${PORT}/auth`);
    console.log(`Authentication required: ${REQUIRE_AUTH}`);
    console.log('Features: authentication, client registration, room-based messaging, heartbeat, error handling');
});

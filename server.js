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
const HOST = process.env.HOST || '0.0.0.0';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';
const MAX_CLIENTS_PER_ROOM = parseInt(process.env.MAX_CLIENTS_PER_ROOM) || 10;

// Create HTTP server for authentication endpoint
const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
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

// Room structure for 1:N connections
class Room {
    constructor(roomId) {
        this.roomId = roomId;
        this.host = null;
        this.clients = new Set();
        this.maxClients = MAX_CLIENTS_PER_ROOM;
        this.createdAt = Date.now();
    }
    
    get clientCount() {
        return this.clients.size;
    }
    
    get allConnections() {
        const all = new Set(this.clients);
        if (this.host) all.add(this.host);
        return all;
    }
    
    isHost(ws) {
        return this.host === ws;
    }
    
    addHost(ws) {
        if (this.host) {
            // Check if existing host connection is still alive
            if (this.host.readyState === WebSocket.OPEN) {
                throw new Error('Room already has a host');
            }
            // Previous host connection is closed, allow replacement
            console.log('Replacing stale host connection');
        }
        this.host = ws;
    }
    
    addClient(ws) {
        if (this.clients.size >= this.maxClients) {
            throw new Error('Room is full');
        }
        this.clients.add(ws);
    }
    
    remove(ws) {
        if (this.host === ws) {
            this.host = null;
        } else {
            this.clients.delete(ws);
        }
    }
    
    isEmpty() {
        return !this.host && this.clients.size === 0;
    }
}

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
            // Handle different message types
            switch (data.type) {
                case 'register':
                    handleRegister(ws, connectionId, data);
                    break;
                    
                case 'join-room':
                    handleJoinRoom(ws, connectionId, data);
                    break;
                    
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    handleWebRTCSignaling(ws, data);
                    break;
                    
                default:
                    // Forward other messages to room
                    handleRoomMessage(ws, data);
                    break;
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
                console.log(`Client disconnected: ${clientInfo.peerId} (${clientInfo.role}) - Code: ${code}, Reason: ${reason}`);
                
                // Remove from room
                if (clientInfo.roomId) {
                    const room = rooms.get(clientInfo.roomId);
                    if (room) {
                        room.remove(ws);
                        console.log(`Room ${clientInfo.roomId} now has ${room.clientCount} clients`);
                        
                        // Notify others
                        broadcastToRoom(ws, room, {
                            type: 'peer-left',
                            peerId: clientInfo.peerId,
                            role: clientInfo.role
                        });
                        
                        // If host left, notify clients
                        if (clientInfo.role === 'Host' || clientInfo.role === 'host') {
                            broadcastToRoom(null, room, {
                                type: 'host-disconnected'
                            });
                        }
                        
                        if (room.isEmpty()) {
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

// Handle client registration (backward compatibility)
function handleRegister(ws, connectionId, data) {
    if (!data.peerId || !data.clientType || !data.roomId) {
        throw new Error('Missing required fields: peerId, clientType, roomId');
    }
    
    // Map old clientType to new role
    const role = data.clientType.toLowerCase() === 'quest' ? 'Host' : 'Client';
    
    handleJoinRoom(ws, connectionId, {
        type: 'join-room',
        roomId: data.roomId,
        role: role,
        peerId: data.peerId,
        maxConnections: data.maxConnections
    });
}

// Handle room joining with 1:N support
function handleJoinRoom(ws, connectionId, data) {
    if (!data.roomId || !data.role) {
        throw new Error('Missing required fields: roomId, role');
    }
    
    // Validate room ID format
    if (!/^[a-zA-Z0-9_-]+$/.test(data.roomId)) {
        throw new Error('Invalid room ID format');
    }
    
    const peerId = data.peerId || connectionId;
    
    // Check if this peerId already exists and clean up stale connection
    for (const [clientWs, clientInfo] of clients.entries()) {
        if (clientInfo.peerId === peerId && clientWs !== ws) {
            console.log(`Cleaning up existing connection for peerId ${peerId}`);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(1000, 'Replaced by new connection');
            }
            clients.delete(clientWs);
            
            // Remove from room if needed
            if (clientInfo.roomId) {
                const room = rooms.get(clientInfo.roomId);
                if (room) {
                    room.remove(clientWs);
                }
            }
        }
    }
    
    // Get or create room
    let room = rooms.get(data.roomId);
    if (!room) {
        room = new Room(data.roomId);
        if (data.maxConnections) {
            room.maxClients = Math.min(data.maxConnections, MAX_CLIENTS_PER_ROOM);
        }
        rooms.set(data.roomId, room);
    }
    
    // Add to room based on role
    if (data.role === 'Host' || data.role === 'host') {
        room.addHost(ws);
    } else {
        room.addClient(ws);
    }
    
    // Store client info
    const clientInfo = {
        ws: ws,
        connectionId: connectionId,
        peerId: peerId,
        role: data.role,
        roomId: data.roomId,
        authenticated: ws.authenticated || false
    };
    clients.set(ws, clientInfo);
    
    console.log(`Client joined: ${peerId} (${data.role}) in room ${data.roomId}`);
    console.log(`Room ${data.roomId} - Host: ${room.host ? 'Yes' : 'No'}, Clients: ${room.clientCount}`);
    
    // Send confirmation
    ws.send(JSON.stringify({
        type: 'joined-room',
        roomId: data.roomId,
        peerId: peerId,
        role: data.role,
        isHost: room.isHost(ws)
    }));
    
    // Notify others in room
    broadcastToRoom(ws, room, {
        type: 'peer-joined',
        peerId: peerId,
        role: data.role
    });
    
    // If client joined and host exists, notify host to create offer
    if (data.role === 'Client' && room.host) {
        const hostInfo = clients.get(room.host);
        if (hostInfo) {
            room.host.send(JSON.stringify({
                type: 'client-ready',
                peerId: peerId
            }));
        }
    }
}

// Handle WebRTC signaling with target peer support
function handleWebRTCSignaling(ws, data) {
    const sender = clients.get(ws);
    if (!sender || !sender.roomId) {
        throw new Error('Client not registered or missing room');
    }
    
    const room = rooms.get(sender.roomId);
    if (!room) {
        throw new Error('Room not found');
    }
    
    // Add sender info to message
    data.sourcePeerId = sender.peerId;
    
    // If message has a target, send only to that peer
    if (data.targetPeerId) {
        let targetWs = null;
        
        // Find target peer
        for (const [clientWs, clientInfo] of clients) {
            if (clientInfo.peerId === data.targetPeerId && clientInfo.roomId === sender.roomId) {
                targetWs = clientWs;
                break;
            }
        }
        
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify(data));
            console.log(`Sent ${data.type} from ${sender.peerId} to ${data.targetPeerId}`);
        } else {
            throw new Error(`Target peer ${data.targetPeerId} not found or disconnected`);
        }
    } else {
        // Broadcast to all others in room
        broadcastToRoom(ws, room, data);
    }
}

// Handle general room messages
function handleRoomMessage(ws, data) {
    const sender = clients.get(ws);
    if (!sender || !sender.roomId) {
        throw new Error('Client not registered or missing room');
    }
    
    const room = rooms.get(sender.roomId);
    if (!room) {
        throw new Error('Room not found');
    }
    
    // Add sender info
    data.sourcePeerId = sender.peerId;
    
    console.log(`Broadcasting ${data.type} from ${sender.role} to room ${sender.roomId}`);
    broadcastToRoom(ws, room, data);
}

// Broadcast to room members
function broadcastToRoom(senderWs, room, message) {
    try {
        const messageStr = JSON.stringify(message);
        let sent = 0;
        let failed = 0;
        
        room.allConnections.forEach((clientWs) => {
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
        
        console.log(`Broadcasted to ${sent} clients in room ${room.roomId}${failed > 0 ? ` (${failed} failed)` : ''}`);
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

server.listen(PORT, HOST, () => {
    console.log(`Signaling server running on ws://${HOST}:${PORT}`);
    console.log(`Authentication endpoint: http://${HOST}:${PORT}/auth`);
    console.log(`Authentication required: ${REQUIRE_AUTH}`);
    console.log(`Max clients per room: ${MAX_CLIENTS_PER_ROOM}`);
    console.log('Features: 1:N connections, room-based messaging, role management, heartbeat, error handling');
});
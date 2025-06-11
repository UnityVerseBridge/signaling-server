const rateLimit = require('express-rate-limit');

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                error: 'Too many requests',
                message,
                retryAfter: Math.round(windowMs / 1000)
            });
        }
    });
};

// Different rate limiters for different endpoints
const authLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 requests per window
    'Too many authentication attempts, please try again later'
);

const apiLimiter = createRateLimiter(
    1 * 60 * 1000, // 1 minute
    60, // 60 requests per minute
    'Too many API requests, please slow down'
);

// Message size limiter middleware
const messageSizeLimiter = (maxSize = 10 * 1024) => { // 10KB default
    return (req, res, next) => {
        let size = 0;
        
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxSize) {
                res.status(413).json({
                    error: 'Message too large',
                    maxSize: maxSize
                });
                req.connection.destroy();
            }
        });
        
        next();
    };
};

// Input validation helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    // Remove any HTML/script tags
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
};

// Validate message structure
const validateMessage = (message) => {
    const errors = [];
    
    // Check basic structure
    if (!message || typeof message !== 'object') {
        errors.push('Message must be an object');
    }
    
    // Check message type
    if (!message.type || typeof message.type !== 'string') {
        errors.push('Message type is required and must be a string');
    } else if (message.type.length > 50) {
        errors.push('Message type is too long (max 50 characters)');
    }
    
    // Validate specific message types
    if (message.type === 'register' || message.type === 'join-room') {
        if (!message.roomId || typeof message.roomId !== 'string') {
            errors.push('Room ID is required');
        } else if (!/^[a-zA-Z0-9_-]{1,50}$/.test(message.roomId)) {
            errors.push('Invalid room ID format (alphanumeric, underscore, hyphen only, max 50 chars)');
        }
        
        if (message.peerId && !/^[a-zA-Z0-9_-]{1,100}$/.test(message.peerId)) {
            errors.push('Invalid peer ID format');
        }
    }
    
    // Validate SDP messages
    if (message.type === 'offer' || message.type === 'answer') {
        if (!message.sdp || typeof message.sdp !== 'string') {
            errors.push('SDP is required for offer/answer');
        } else if (message.sdp.length > 100000) { // 100KB limit for SDP
            errors.push('SDP is too large');
        }
    }
    
    // Validate ICE candidates
    if (message.type === 'ice-candidate') {
        if (!message.candidate || typeof message.candidate !== 'string') {
            errors.push('Candidate is required');
        } else if (message.candidate.length > 1000) {
            errors.push('Candidate string is too long');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
};

// WebSocket connection rate limiter
class ConnectionRateLimiter {
    constructor(maxConnectionsPerIP = 10, windowMs = 60000) {
        this.connections = new Map();
        this.maxConnectionsPerIP = maxConnectionsPerIP;
        this.windowMs = windowMs;
        
        // Clean up old entries periodically
        setInterval(() => this.cleanup(), windowMs);
    }
    
    canConnect(ip) {
        const now = Date.now();
        const connections = this.connections.get(ip) || [];
        
        // Remove old connections
        const activeConnections = connections.filter(time => now - time < this.windowMs);
        
        if (activeConnections.length >= this.maxConnectionsPerIP) {
            return false;
        }
        
        activeConnections.push(now);
        this.connections.set(ip, activeConnections);
        return true;
    }
    
    cleanup() {
        const now = Date.now();
        for (const [ip, connections] of this.connections.entries()) {
            const activeConnections = connections.filter(time => now - time < this.windowMs);
            if (activeConnections.length === 0) {
                this.connections.delete(ip);
            } else {
                this.connections.set(ip, activeConnections);
            }
        }
    }
}

module.exports = {
    authLimiter,
    apiLimiter,
    messageSizeLimiter,
    sanitizeInput,
    validateMessage,
    ConnectionRateLimiter
};
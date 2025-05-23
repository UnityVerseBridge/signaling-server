const crypto = require('crypto');

// Simple token manager for demo purposes
// In production, use proper JWT with jsonwebtoken package
class TokenManager {
    constructor() {
        this.secret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
        this.tokens = new Map();
    }

    generateToken(clientId, clientType) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenData = {
            clientId,
            clientType,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        
        this.tokens.set(token, tokenData);
        return token;
    }

    validateToken(token) {
        const tokenData = this.tokens.get(token);
        if (!tokenData) return null;
        
        if (Date.now() > tokenData.expiresAt) {
            this.tokens.delete(token);
            return null;
        }
        
        return tokenData;
    }

    revokeToken(token) {
        this.tokens.delete(token);
    }
}

module.exports = new TokenManager();

const crypto = require('crypto');

// Enhanced token manager with cleanup and persistence support
// In production, use proper JWT with jsonwebtoken package and Redis/DB storage
class TokenManager {
    constructor() {
        this.secret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
        this.tokens = new Map();
        this.maxTokens = parseInt(process.env.MAX_TOKENS) || 10000;
        this.tokenTTL = parseInt(process.env.TOKEN_TTL) || 24 * 60 * 60 * 1000; // 24 hours
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000); // Every hour
    }

    generateToken(clientId, clientType) {
        // Limit token generation
        if (this.tokens.size >= this.maxTokens) {
            this.cleanup(); // Force cleanup
            if (this.tokens.size >= this.maxTokens) {
                throw new Error('Token limit reached');
            }
        }
        
        const token = crypto.randomBytes(32).toString('hex');
        const tokenData = {
            clientId: this.sanitizeId(clientId),
            clientType: this.sanitizeId(clientType),
            createdAt: Date.now(),
            expiresAt: Date.now() + this.tokenTTL,
            lastUsed: Date.now()
        };
        
        this.tokens.set(token, tokenData);
        return token;
    }

    validateToken(token) {
        if (!token || typeof token !== 'string' || token.length !== 64) {
            return null;
        }
        
        const tokenData = this.tokens.get(token);
        if (!tokenData) return null;
        
        if (Date.now() > tokenData.expiresAt) {
            this.tokens.delete(token);
            return null;
        }
        
        // Update last used time
        tokenData.lastUsed = Date.now();
        
        return tokenData;
    }

    revokeToken(token) {
        this.tokens.delete(token);
    }
    
    cleanup() {
        const now = Date.now();
        let removed = 0;
        
        for (const [token, data] of this.tokens.entries()) {
            if (now > data.expiresAt) {
                this.tokens.delete(token);
                removed++;
            }
        }
        
        if (removed > 0) {
            console.log(`[TokenManager] Cleaned up ${removed} expired tokens`);
        }
    }
    
    sanitizeId(id) {
        if (typeof id !== 'string') return '';
        return id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
    }
    
    getStats() {
        return {
            totalTokens: this.tokens.size,
            maxTokens: this.maxTokens,
            tokenTTL: this.tokenTTL
        };
    }
    
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.tokens.clear();
    }
}

module.exports = new TokenManager();

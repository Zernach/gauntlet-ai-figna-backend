import dotenv from 'dotenv';
import { generateSecureToken, hashValue } from '../utils/security';

dotenv.config();

/**
 * API Key Management
 * Handles secure storage and rotation of API keys
 */

interface APIKey {
    name: string;
    value: string;
    hash: string;
    createdAt: Date;
    lastRotated: Date;
    rotationIntervalDays: number;
}

class APIKeyManager {
    private keys: Map<string, APIKey> = new Map();

    constructor() {
        this.loadKeys();
    }

    /**
     * Load API keys from environment variables
     */
    private loadKeys(): void {
        // OpenAI API Key
        const openaiKey = process.env.GAUNTLET_OPEN_AI_API_KEY_1;
        if (openaiKey) {
            this.keys.set('openai', {
                name: 'OpenAI API Key',
                value: openaiKey,
                hash: hashValue(openaiKey),
                createdAt: new Date(),
                lastRotated: new Date(),
                rotationIntervalDays: 90,
            });
        }

        // Session Secret
        const sessionSecret = process.env.SESSION_SECRET || generateSecureToken(32);
        this.keys.set('session', {
            name: 'Session Secret',
            value: sessionSecret,
            hash: hashValue(sessionSecret),
            createdAt: new Date(),
            lastRotated: new Date(),
            rotationIntervalDays: 180,
        });

        // API Signing Secret
        const apiSigningSecret = process.env.API_SIGNING_SECRET || generateSecureToken(32);
        this.keys.set('api_signing', {
            name: 'API Signing Secret',
            value: apiSigningSecret,
            hash: hashValue(apiSigningSecret),
            createdAt: new Date(),
            lastRotated: new Date(),
            rotationIntervalDays: 90,
        });

    }

    /**
     * Get an API key by name
     */
    getKey(name: string): string | null {
        const key = this.keys.get(name);
        return key ? key.value : null;
    }

    /**
     * Check if a key exists
     */
    hasKey(name: string): boolean {
        return this.keys.has(name);
    }

    /**
     * Get key metadata (without exposing the actual key)
     */
    getKeyMetadata(name: string): Omit<APIKey, 'value'> | null {
        const key = this.keys.get(name);
        if (!key) return null;

        return {
            name: key.name,
            hash: key.hash,
            createdAt: key.createdAt,
            lastRotated: key.lastRotated,
            rotationIntervalDays: key.rotationIntervalDays,
        };
    }

    /**
     * Check if a key needs rotation
     */
    needsRotation(name: string): boolean {
        const key = this.keys.get(name);
        if (!key) return false;

        const daysSinceRotation = Math.floor(
            (Date.now() - key.lastRotated.getTime()) / (1000 * 60 * 60 * 24)
        );

        return daysSinceRotation >= key.rotationIntervalDays;
    }

    /**
     * List all keys that need rotation
     */
    getKeysNeedingRotation(): string[] {
        const needsRotation: string[] = [];

        for (const [name, key] of this.keys.entries()) {
            if (this.needsRotation(name)) {
                needsRotation.push(name);
            }
        }

        return needsRotation;
    }

    /**
     * Get all key names
     */
    getKeyNames(): string[] {
        return Array.from(this.keys.keys());
    }

    /**
     * Rotate a key (in production, this would update the environment and restart)
     */
    rotateKey(name: string, newValue: string): boolean {
        const key = this.keys.get(name);
        if (!key) return false;

        key.value = newValue;
        key.hash = hashValue(newValue);
        key.lastRotated = new Date();

        return true;
    }

    /**
     * Validate that all required keys are present
     */
    validateRequiredKeys(): { valid: boolean; missing: string[] } {
        const requiredKeys = ['session', 'api_signing'];
        const missing: string[] = [];

        for (const keyName of requiredKeys) {
            if (!this.hasKey(keyName)) {
                missing.push(keyName);
            }
        }

        return {
            valid: missing.length === 0,
            missing,
        };
    }

    /**
     * Get security status
     */
    getSecurityStatus(): {
        totalKeys: number;
        keysNeedingRotation: string[];
        missingRequiredKeys: string[];
    } {
        const validation = this.validateRequiredKeys();

        return {
            totalKeys: this.keys.size,
            keysNeedingRotation: this.getKeysNeedingRotation(),
            missingRequiredKeys: validation.missing,
        };
    }
}

// Export singleton instance
export const apiKeyManager = new APIKeyManager();

/**
 * Convenience functions
 */
export function getAPIKey(name: string): string | null {
    return apiKeyManager.getKey(name);
}

export function hasAPIKey(name: string): boolean {
    return apiKeyManager.hasKey(name);
}

export function getKeyMetadata(name: string): Omit<APIKey, 'value'> | null {
    return apiKeyManager.getKeyMetadata(name);
}

export function getSecurityStatus() {
    return apiKeyManager.getSecurityStatus();
}


// ==================== CONFIGURATION ====================
const config = {
    port: process.env.ESS_PORT ,
    env: process.env.NODE_ENV,
    mifosx: {
        baseUrl: process.env.MIFOSX_BASE_URL,
        tenantId: process.env.MIFOSX_TENANT_ID ,
        username: process.env.MIFOSX_USERNAME,
        password: process.env.MIFOSX_PASSWORD,
        timeout: 30000
    },
    security: {
        privateKeyPath: process.env.PRIVATE_KEY_PATH ,
        publicKeyPath: process.env.PUBLIC_KEY_PATH ,
        passphrase: process.env.KEY_PASSPHRASE,
        signatureAlgorithm: 'sha256WithRSAEncryption',
        disableSignatureValidation: process.env.DISABLE_SIGNATURE_VALIDATION === 'true' || process.env.NODE_ENV !== 'production'
    },
    rateLimits: {
        windowMs: 15 * 60 * 1000,
        max: 100
    },
    fspCode: process.env.FSP_CODE || 'FL7407',
    fspName: process.env.FSP_NAME || 'Your Financial Institution',
    essNotificationUrl: process.env.ESS_NOTIFICATION_URL || 'http://localhost:3001/api/ess/notification'
};
module.exports = {config};
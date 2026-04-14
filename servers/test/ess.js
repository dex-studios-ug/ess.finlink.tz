// server.js
// e-MKOPO FSP Bridge Server for MifosX
// Production-ready, finance-grade security hardening

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult, matchedData } = require('express-validator');
const winston = require('winston');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
require('dotenv').config();

// ==================== DATABASE SETUP ====================
let db;

async function initializeDatabase() {
    db = await open({
        filename: './db/ess_logs.db',
        driver: sqlite3.Database
    });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS ess_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            message_type TEXT NOT NULL,
            direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
            status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'RETRY')),
            request_payload TEXT,
            response_payload TEXT,
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            fsp_code TEXT,
            application_number TEXT,
            loan_number TEXT,
            client_name TEXT,
            client_id TEXT,
            response_code TEXT,
            processing_time_ms INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_message_id ON ess_logs(message_id);
        CREATE INDEX IF NOT EXISTS idx_message_type ON ess_logs(message_type);
        CREATE INDEX IF NOT EXISTS idx_direction ON ess_logs(direction);
        CREATE INDEX IF NOT EXISTS idx_status ON ess_logs(status);
        CREATE INDEX IF NOT EXISTS idx_created_at ON ess_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_application_number ON ess_logs(application_number);
        CREATE INDEX IF NOT EXISTS idx_loan_number ON ess_logs(loan_number);
    `);
    
    console.log('Database initialized: ess_logs.db');
}

// ==================== LOGGING HELPER FUNCTIONS ====================
async function logTransaction({
    messageId,
    messageType,
    direction,
    requestPayload,
    responsePayload = null,
    errorMessage = null,
    fspCode = null,
    applicationNumber = null,
    loanNumber = null,
    clientName = null,
    clientId = null,
    responseCode = null,
    processingTimeMs = null,
    status = 'PENDING'
}) {
    try {
        const result = await db.run(
            `INSERT INTO ess_logs (
                message_id, message_type, direction, status,
                request_payload, response_payload, error_message,
                fsp_code, application_number, loan_number,
                client_name, client_id, response_code,
                processing_time_ms, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                messageId, messageType, direction, status,
                requestPayload ? JSON.stringify(requestPayload) : null,
                responsePayload ? JSON.stringify(responsePayload) : null,
                errorMessage,
                fspCode,
                applicationNumber,
                loanNumber,
                clientName,
                clientId,
                responseCode,
                processingTimeMs
            ]
        );
        return result.lastID;
    } catch (error) {
        console.error('Failed to log transaction:', error);
        return null;
    }
}

async function updateLogStatus(logId, status, responsePayload = null, errorMessage = null, responseCode = null) {
    try {
        const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
        const params = [status];
        
        if (responsePayload) {
            updates.push('response_payload = ?');
            params.push(JSON.stringify(responsePayload));
        }
        if (errorMessage) {
            updates.push('error_message = ?');
            params.push(errorMessage);
        }
        if (responseCode) {
            updates.push('response_code = ?');
            params.push(responseCode);
        }
        
        params.push(logId);
        await db.run(`UPDATE ess_logs SET ${updates.join(', ')} WHERE id = ?`, params);
    } catch (error) {
        console.error('Failed to update log status:', error);
    }
}

async function extractIdentifiersFromPayload(payload, messageType) {
    const identifiers = {
        applicationNumber: null,
        loanNumber: null,
        clientName: null,
        clientId: null
    };
    
    const messageDetails = payload?.MessageDetails || payload || {};
    
    // Extract common fields based on message type
    if (messageDetails.ApplicationNumber) {
        identifiers.applicationNumber = messageDetails.ApplicationNumber;
    }
    if (messageDetails.LoanNumber) {
        identifiers.loanNumber = messageDetails.LoanNumber;
    }
    if (messageDetails.CheckNumber) {
        identifiers.clientId = messageDetails.CheckNumber;
    }
    if (messageDetails.FirstName && messageDetails.LastName) {
        identifiers.clientName = `${messageDetails.FirstName} ${messageDetails.LastName}`;
    }
    if (messageDetails.ClientId) {
        identifiers.clientId = messageDetails.ClientId;
    }
    
    return identifiers;
}

// ==================== LOGGING MIDDLEWARE ====================
async function logInboundTransaction(req, res, next) {
    const startTime = Date.now();
    let logId = null;
    
    // Capture original send methods
    const originalSend = res.send;
    let responseBody = null;
    
    res.send = function(body) {
        responseBody = body;
        return originalSend.call(this, body);
    };
    
    try {
        const rawBody = req.body;
        let parsedPayload = null;
        let messageType = null;
        let messageId = null;
        let fspCode = null;
        
        // Try to parse XML body
        if (typeof rawBody === 'string' && (rawBody.includes('<') || rawBody.includes('>'))) {
            try {
                const parsed = signatureService.parseXmlDocument(rawBody, true);
                if (parsed && parsed.data) {
                    parsedPayload = parsed.data;
                    messageType = parsedPayload.Header?.MessageType || parsedPayload.MessageType;
                    messageId = parsedPayload.Header?.MsgId || parsedPayload.MsgId;
                    fspCode = parsedPayload.Header?.FSPCode || parsedPayload.FSPCode;
                }
            } catch (e) {
                // Not XML or parsing failed
            }
        } else if (typeof rawBody === 'object') {
            parsedPayload = rawBody;
            messageType = rawBody.messageType || rawBody.MessageType;
            messageId = rawBody.messageId || rawBody.MsgId;
            fspCode = rawBody.fspCode || rawBody.FSPCode;
        }
        
        const identifiers = await extractIdentifiersFromPayload(parsedPayload, messageType);
        
        logId = await logTransaction({
            messageId: messageId || `MSG_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            messageType: messageType || 'UNKNOWN',
            direction: 'INBOUND',
            requestPayload: parsedPayload || rawBody,
            fspCode: fspCode || config.fspCode,
            applicationNumber: identifiers.applicationNumber,
            loanNumber: identifiers.loanNumber,
            clientName: identifiers.clientName,
            clientId: identifiers.clientId,
            status: 'PENDING'
        });
        
        // Store logId on request for later update
        req.transactionLogId = logId;
        req.transactionStartTime = startTime;
        req.transactionMessageType = messageType;
        
    } catch (error) {
        console.error('Logging middleware error:', error);
    }
    
    // Override res.json and res.send to capture response
    const originalJson = res.json;
    res.json = function(body) {
        responseBody = body;
        return originalJson.call(this, body);
    };
    
    // Handle response finish
    res.on('finish', async () => {
        const processingTime = Date.now() - startTime;
        let responsePayload = null;
        let responseCode = null;
        let status = 'SUCCESS';
        let errorMessage = null;
        
        try {
            // Parse response body
            if (responseBody) {
                if (typeof responseBody === 'string') {
                    try {
                        const parsed = signatureService.parseXmlDocument(responseBody, true);
                        if (parsed && parsed.data) {
                            responsePayload = parsed.data;
                            responseCode = parsed.data.MessageDetails?.ResponseCode || 
                                          parsed.data.ResponseCode || 
                                          (res.statusCode >= 200 && res.statusCode < 400 ? '8000' : '8011');
                        }
                    } catch (e) {
                        responsePayload = { raw: responseBody };
                    }
                } else {
                    responsePayload = responseBody;
                    responseCode = responseBody.responseCode || responseBody.ResponseCode || 
                                  (res.statusCode >= 200 && res.statusCode < 400 ? '8000' : '8011');
                }
            }
            
            if (res.statusCode >= 400) {
                status = 'FAILED';
                errorMessage = `HTTP ${res.statusCode}: ${responseBody?.message || responseBody?.error || 'Request failed'}`;
            }
            
            if (logId) {
                await updateLogStatus(logId, status, responsePayload, errorMessage, responseCode);
            }
        } catch (error) {
            console.error('Failed to update log on finish:', error);
        }
    });
    
    next();
}

async function logOutboundTransaction(messageType, messageDetails, notificationId, response) {
    const startTime = Date.now();
    let logId = null;
    
    try {
        const identifiers = await extractIdentifiersFromPayload(messageDetails, messageType);
        
        logId = await logTransaction({
            messageId: notificationId,
            messageType: messageType,
            direction: 'OUTBOUND',
            requestPayload: messageDetails,
            fspCode: config.fspCode,
            applicationNumber: identifiers.applicationNumber,
            loanNumber: identifiers.loanNumber,
            clientName: identifiers.clientName,
            clientId: identifiers.clientId,
            status: response?.success ? 'SUCCESS' : 'FAILED'
        });
        
        const processingTime = Date.now() - startTime;
        
        await updateLogStatus(
            logId, 
            response?.success ? 'SUCCESS' : 'FAILED',
            response,
            response?.error || null,
            response?.success ? '8000' : '8011'
        );
        
        // Update processing time
        await db.run('UPDATE ess_logs SET processing_time_ms = ? WHERE id = ?', [processingTime, logId]);
        
    } catch (error) {
        console.error('Failed to log outbound transaction:', error);
    }
    
    return logId;
}

// ==================== MESSAGE TYPE CONSTANTS ====================
const MSG = {
    // Product Catalog
    PRODUCT_DETAIL: 'PRODUCT_DETAIL',
    PRODUCT_DECOMMISSION: 'PRODUCT_DECOMMISSION',
    
    // New Loan
    LOAN_CHARGES_REQUEST: 'LOAN_CHARGES_REQUEST',
    LOAN_CHARGES_RESPONSE: 'LOAN_CHARGES_RESPONSE',
    LOAN_OFFER_REQUEST: 'LOAN_OFFER_REQUEST',
    LOAN_INITIAL_APPROVAL_NOTIFICATION: 'LOAN_INITIAL_APPROVAL_NOTIFICATION',
    LOAN_FINAL_APPROVAL_NOTIFICATION: 'LOAN_FINAL_APPROVAL_NOTIFICATION',
    LOAN_DISBURSEMENT_NOTIFICATION: 'LOAN_DISBURSEMENT_NOTIFICATION',
    LOAN_DISBURSEMENT_FAILURE_NOTIFICATION: 'LOAN_DISBURSEMENT_FAILURE_NOTIFICATION',
    LOAN_CANCELLATION_NOTIFICATION: 'LOAN_CANCELLATION_NOTIFICATION',
    
    // Top Up
    TOP_UP_PAY_OFF_BALANCE_REQUEST: 'TOP_UP_PAY_0FF_BALANCE_REQUEST',
    LOAN_TOP_UP_BALANCE_RESPONSE: 'LOAN_TOP_UP_BALANCE_RESPONSE',
    TOP_UP_OFFER_REQUEST: 'TOP_UP_OFFER_REQUEST',
    
    // Restructuring
    LOAN_RESTRUCTURE_BALANCE_REQUEST: 'LOAN_RESTRUCTURE_BALANCE_REQUEST',
    LOAN_RESTRUCTURE_BALANCE_RESPONSE: 'LOAN_RESTRUCTURE_BALANCE_RESPONSE',
    LOAN_RESTRUCTURE_REQUEST_FSP: 'LOAN_RESTRUCTURE_REQUEST_FSP',
    LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST: 'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST',
    LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE: 'LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE',
    LOAN_RESTRUCTURE_REQUEST: 'LOAN_RESTRUCTURE_REQUEST',
    LOAN_RESTRUCTURE_REJECTION: 'LOAN_RESTRUCTURE_REJECTION',
    LOAN_RESTRUCTURED_NOTIFICATION: 'LOAN_RESTRUCTURED_NOTIFICATION',
    LOAN_RESTRUCTURED_FAILURE_NOTIFICATION: 'LOAN_RESTRUCTURED_FAILURE_NOTIFICATION',
    
    // Takeover
    TAKEOVER_PAY_OFF_BALANCE_REQUEST: 'TAKEOVER_PAY_OFF_BALANCE_REQUEST',
    LOAN_TAKEOVER_BALANCE_RESPONSE: 'LOAN_TAKEOVER_BALANCE_RESPONSE',
    LOAN_TAKEOVER_OFFER_REQUEST: 'LOAN_TAKEOVER_OFFER_REQUEST',
    LOAN_TAKEOVER_APPROVAL_NOTIFICATION: 'LOAN_TAKEOVER_APPROVAL_NOTIFICATION',
    TAKEOVER_DISBURSEMENT_NOTIFICATION: 'TAKEOVER_DISBURSEMENT_NOTIFICATION',
    TAKEOVER_PAYMENT_NOTIFICATION: 'TAKEOVER_PAYMENT_NOTIFICATION',
    PAYMENT_ACKNOWLEDGMENT_NOTIFICATION: 'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION',
    
    // Repayments
    FSP_REPAYMENT_REQUEST: 'FSP_REPAYMENT_REQUEST',
    REPAYMENT_OFF_BALANCE_REQUEST_TO_FSP: 'REPAYMENT_0FF_BALANCE_REQUEST_TO_FSP',
    FULL_LOAN_REPAYMENT_REQUEST: 'FULL_LOAN_REPAYMENT_REQUEST',
    FULL_REPAYMENT_OFF_BALANCE_RESPONSE: 'FULL_REPAYMENT_0FF_BALANCE_RESPONSE',
    FULL_LOAN_REPAYMENT_NOTIFICATION: 'FULL_LOAN_REPAYMENT_NOTIFICATION',
    PARTIAL_LOAN_REPAYMENT_REQUEST: 'PARTIAL_LOAN_REPAYMENT_REQUEST',
    PARTIAL_REPAYMENT_OFF_BALANCE_RESPONSE: 'PARTIAL_REPAYMENT_0FF_BALANCE_RESPONSE',
    PARTIAL_LOAN_REPAYMENT_NOTIFICATION: 'PARTIAL_LOAN_REPAYMENT_NOTIFICATION',
    FSP_MONTHLY_DEDUCTIONS: 'FSP_MONTHLY_DEDUCTIONS',
    LOAN_LIQUIDATION_NOTIFICATION: 'LOAN_LIQUIDATION_NOTIFICATION',
    
    // Status
    LOAN_STATUS_REQUEST: 'LOAN_STATUS_REQUEST',
    LOAN_STATUS_RESPONSE: 'LOAN_STATUS_RESPONSE',
    
    // Defaults
    DEFAULTER_DETAILS_TO_EMPLOYER: 'DEFAULTER_DETAILS_TO_EMPLOYER',
    DEFAULTER_DETAILS_TO_FSP: 'DEFAULTER_DETAILS_TO_FSP',
    DEDUCTION_STOP_NOTIFICATION: 'DEDUCTION_STOP_NOTIFICATION',
    
    // Account & Branches
    ACCOUNT_VALIDATION: 'ACCOUNT_VALIDATION',
    ACCOUNT_VALIDATION_RESPONSE: 'ACCOUNT_VALIDATION_RESPONSE',
    FSP_BRANCHES: 'FSP_BRANCHES',
    RESPONSE: 'RESPONSE'
};

// ==================== CONFIGURATION ====================
const config = {
    port: process.env.ESS_PORT || 3002,
    env: process.env.NODE_ENV || 'development',
    mifosx: {
        baseUrl: process.env.MIFOSX_BASE_URL,
        tenantId: process.env.MIFOSX_TENANT_ID,
        username: process.env.MIFOSX_USERNAME,
        password: process.env.MIFOSX_PASSWORD,
        timeout: 30000
    },
    security: {
        privateKeyPath: process.env.PRIVATE_KEY_PATH,
        publicKeyPath: process.env.PUBLIC_KEY_PATH,
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
    essNotificationUrl: process.env.ESS_NOTIFICATION_URL || 'http://localhost:3001/notification'
};

// ==================== LOGGING SETUP ====================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return JSON.stringify({ timestamp, level, message, ...meta });
        })
    ),
    transports: [
        new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: './logs/combined.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

// ==================== MIFOSX CLIENT ====================
class MifosxClient {
    constructor() {
        this.baseUrl = config.mifosx.baseUrl;
        this.auth = Buffer.from(`${config.mifosx.username}:${config.mifosx.password}`).toString('base64');
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${this.auth}`,
            'Fineract-Platform-TenantId': config.mifosx.tenantId
        };
    }

    async request(method, endpoint, data = null) {
        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}${endpoint}`,
                headers: this.headers,
                data,
                timeout: config.mifosx.timeout
            });
            return { success: true, data: response.data };
        } catch (error) {
            logger.error('MifosX API error:', { endpoint, error: error.message });
            return { 
                success: false, 
                error: error.response?.data || error.message,
                status: error.response?.status
            };
        }
    }

    // Loan Management
    async createLoan(loanData) {
        return this.request('POST', '/loans', loanData);
    }

    async getLoan(loanId) {
        return this.request('GET', `/loans/${loanId}`);
    }

    async getLoanByExternalId(externalId) {
        return this.request('GET', `/loans?externalId=${externalId}`);
    }

    async approveLoan(loanId, approvalData) {
        return this.request('POST', `/loans/${loanId}?command=approve`, approvalData);
    }

    async disburseLoan(loanId, disbursementData) {
        return this.request('POST', `/loans/${loanId}?command=disburse`, disbursementData);
    }

    async rejectLoan(loanId, rejectionData) {
        return this.request('POST', `/loans/${loanId}?command=reject`, rejectionData);
    }

    async getLoanBalance(loanId) {
        return this.request('GET', `/loans/${loanId}?associations=transactions,repaymentSchedule`);
    }

    async makeRepayment(loanId, repaymentData) {
        return this.request('POST', `/loans/${loanId}/transactions?command=repayment`, repaymentData);
    }

    // Client Management
    async createClient(clientData) {
        return this.request('POST', '/clients', clientData);
    }

    async getClient(clientId) {
        return this.request('GET', `/clients/${clientId}`);
    }

    async getClientByExternalId(externalId) {
        return this.request('GET', `/clients?externalId=${externalId}`);
    }

    // Product Management
    async getLoanProducts() {
        return this.request('GET', '/loanproducts');
    }

    async getLoanProduct(productId) {
        return this.request('GET', `/loanproducts/${productId}`);
    }
}

// ==================== DIGITAL SIGNATURE SERVICE ====================
class DigitalSignatureService {
    constructor() {
        this.privateKey = null;
        this.publicKey = null;
        this.loadKeys();
    }

    loadKeys() {
        try {
            if (fs.existsSync(config.security.privateKeyPath)) {
                this.privateKey = fs.readFileSync(config.security.privateKeyPath, 'utf8');
            }
            if (fs.existsSync(config.security.publicKeyPath)) {
                this.publicKey = fs.readFileSync(config.security.publicKeyPath, 'utf8');
            }
        } catch (error) {
            logger.error('Failed to load cryptographic keys:', error);
        }
    }

    sign(data) {
        if (!this.privateKey) {
            logger.warn('Private key not available, using mock signature');
            return Buffer.from('MOCK_SIGNATURE_FOR_DEVELOPMENT').toString('base64');
        }
        
        const signer = crypto.createSign('RSA-SHA256');
        signer.update(typeof data === 'string' ? data : JSON.stringify(data));
        signer.end();
        return signer.sign({
            key: this.privateKey,
            passphrase: config.security.passphrase
        }, 'base64');
    }

    verify(data, signature, publicKey = null) {
        const key = publicKey || this.publicKey;
        if (!key) {
            logger.warn('Public key not available, skipping verification');
            return true;
        }
        
        try {
            const verifier = crypto.createVerify('RSA-SHA256');
            verifier.update(typeof data === 'string' ? data : JSON.stringify(data));
            verifier.end();
            return verifier.verify(key, signature, 'base64');
        } catch (error) {
            logger.error('Signature verification failed:', error);
            return false;
        }
    }

    generateXmlDocument(messageType, messageDetails) {
        const msgId = this.generateMsgId();
        const timestamp = new Date().toISOString();
        
        const data = {
            Header: {
                Sender: config.fspName,
                Receiver: 'ESS_UTUMISHI',
                FSPCode: config.fspCode,
                MsgId: msgId,
                MessageType: messageType,
                Timestamp: timestamp
            },
            MessageDetails: messageDetails
        };

        const xml = this.jsonToXml('Data', data);
        const signature = this.sign(xml);

        return `<Document>\n${xml}  <Signature>${signature}</Signature>\n</Document>`;
    }

    jsonToXml(rootTag, obj, indent = '') {
        const nextIndent = indent + '  ';

        const escapeXml = (value) => {
            return String(value).replace(/[<>&]/g, (c) => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    default: return c;
                }
            });
        };

        if (obj === null || obj === undefined) {
            return `${indent}<${rootTag}/>`;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => {
                if (rootTag) {
                    return `${indent}<${rootTag}>\n${this.jsonToXml(null, item, nextIndent)}${indent}</${rootTag}>\n`;
                }
                return this.jsonToXml(null, item, indent);
            }).join('');
        }

        if (typeof obj === 'object') {
            const inner = Object.entries(obj).map(([key, value]) => {
                if (value === null || value === undefined) {
                    return `${nextIndent}<${key}/>`;
                }
                if (typeof value === 'object') {
                    return `${nextIndent}<${key}>\n${this.jsonToXml(null, value, nextIndent + '  ')}${nextIndent}</${key}>\n`;
                }
                return `${nextIndent}<${key}>${escapeXml(value)}</${key}>\n`;
            }).join('');

            if (rootTag) {
                return `${indent}<${rootTag}>\n${inner}${indent}</${rootTag}>\n`;
            }
            return inner;
        }

        return `${indent}<${rootTag}>${escapeXml(obj)}</${rootTag}>\n`;
    }

    parseXmlDocument(xml, skipValidation = false) {
        const rawXml = typeof xml === 'string' ? xml : String(xml || '');
        const signatureMatch = rawXml.match(/<Signature>([\s\S]*?)<\/Signature>/);
        const signature = signatureMatch ? signatureMatch[1] : null;
        
        let dataMatch = rawXml.match(/<Data>([\s\S]*?)<\/Data>/);
        if (!dataMatch) {
            dataMatch = rawXml.match(/<Document>([\s\S]*?)<\/Document>/);
        }

        if (!dataMatch) {
            logger.warn('Failed to parse XML payload, returning invalid', { preview: rawXml.substring(0, 300) });
            return null;
        }
        
        const payload = dataMatch[1];
        const isValid = skipValidation || config.security.disableSignatureValidation ? true : this.verify(payload, signature);
        
        return {
            isValid,
            data: this.parseXmlToJson(payload),
            signature
        };
    }

    parseXmlToJson(xml) {
        const result = {};
        const regex = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let match;
        
        while ((match = regex.exec(xml)) !== null) {
            const [, tag, content] = match;
            if (content.includes('<')) {
                result[tag] = this.parseXmlToJson(content);
            } else {
                result[tag] = content;
            }
        }
        return result;
    }

    generateMsgId() {
        return `${config.fspCode}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateResponse(responseCode, description, messageType = 'RESPONSE') {
        return this.generateXmlDocument(messageType, {
            ResponseCode: responseCode,
            Description: description
        });
    }
}

// ==================== LOAN PROCESSING SERVICE ====================
class LoanProcessingService {
    constructor(mifosxClient, signatureService) {
        this.mifosx = mifosxClient;
        this.signature = signatureService;
        this.loanCache = new Map();
    }
    
    async processLoanCancellationRequest(data) {
        const { ApplicationNumber, Reason, FSPReferenceNumber, LoanNumber } = data;
        
        try {
            const cached = this.loanCache.get(ApplicationNumber);
            if (cached) {
                if (LoanNumber && cached.loanId) {
                    await this.mifosx.rejectLoan(cached.loanId, {
                        rejectedOnDate: new Date().toISOString().split('T')[0],
                        note: Reason || 'Loan cancelled by employee'
                    });
                }
                cached.status = 'CANCELLED';
                this.loanCache.set(ApplicationNumber, cached);
            }
            
            logger.info('Loan cancellation processed:', { ApplicationNumber, Reason });
            return this.signature.generateResponse('8000', 'Loan cancellation acknowledged');
        } catch (error) {
            logger.error('Loan cancellation error:', error);
            return this.signature.generateResponse('8011', 'Error processing cancellation');
        }
    }

    async processPayOffBalance(data) {
        const { CheckNumber, LoanNumber, FirstName, LastName, VoteCode, DeductionCode, PaymentOption } = data;
        
        try {
            const loan = await this.mifosx.getLoan(LoanNumber);
            if (!loan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            const loanData = loan.data;
            const totalPayoffAmount = loanData.summary?.totalOutstanding || 0;
            const endDate = loanData.timeline?.expectedMaturityDate || new Date().toISOString();
            const lastDeductionDate = loanData.timeline?.lastPaymentDate || new Date().toISOString();
            
            return this.signature.generateXmlDocument('LOAN_TOP_UP_BALANCE_RESPONSE', {
                LoanNumber: LoanNumber,
                TotalPayoffAmount: totalPayoffAmount,
                EndDate: endDate,
                LastDeductionDate: lastDeductionDate,
                PaymentReferenceNumber: `PAYOFF_${LoanNumber}_${Date.now()}`,
                FinalPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                OutstandingBalance: totalPayoffAmount,
                LastPayDate: lastDeductionDate,
                FSPReferenceNumber: `REF_${LoanNumber}_${Date.now()}`
            });
        } catch (error) {
            logger.error('Pay off balance error:', error);
            return this.signature.generateResponse('8011', 'Error processing payoff balance');
        }
    }

    async processLoanTopUp(data) {
        const {
            CheckNumber, FirstName, LastName, BankAccountNumber, VoteCode, NIN,
            RequestedAmount, Tenure, ProductCode, ApplicationNumber, MobileNumber,
            EmailAddress, LoanNumber, SettlementAmount
        } = data;
        
        try {
            let clientId;
            const existingClient = await this.mifosx.getClientByExternalId(CheckNumber);
            
            if (!existingClient.success) {
                const client = await this.mifosx.createClient({
                    externalId: CheckNumber,
                    firstname: FirstName,
                    lastname: LastName,
                    mobileNo: MobileNumber,
                    emailAddress: EmailAddress,
                    legalFormId: 1,
                    clientTypeId: 1,
                    activationDate: new Date().toISOString().split('T')[0]
                });
                if (!client.success) throw new Error('Failed to create client');
                clientId = client.data.clientId;
            } else {
                clientId = existingClient.data.id;
            }
            
            const originalLoan = await this.mifosx.getLoan(LoanNumber);
            if (!originalLoan.success) {
                return this.signature.generateResponse('8019', 'Original loan not found');
            }
            
            const loanApplication = {
                clientId: clientId,
                productId: ProductCode,
                principal: RequestedAmount,
                loanTermFrequency: Tenure,
                loanTermFrequencyType: 2,
                numberOfRepayments: Tenure,
                repaymentEvery: 1,
                repaymentFrequencyType: 2,
                interestRatePerPeriod: 10,
                amortizationType: 1,
                interestType: 0,
                interestCalculationPeriodType: 1,
                transactionProcessingStrategyId: 1,
                submittedOnDate: new Date().toISOString().split('T')[0],
                expectedDisbursementDate: new Date().toISOString().split('T')[0],
                externalId: ApplicationNumber
            };
            
            const loan = await this.mifosx.createLoan(loanApplication);
            if (!loan.success) throw new Error('Failed to create top-up loan');
            
            this.loanCache.set(ApplicationNumber, {
                loanId: loan.data.loanId,
                clientId: clientId,
                checkNumber: CheckNumber,
                status: 'TOPUP_PENDING',
                originalLoanNumber: LoanNumber,
                settlementAmount: SettlementAmount
            });
            
            if (this.notificationService) {
                setTimeout(() => {
                    this.notificationService.notifyLoanApproval(
                        ApplicationNumber,
                        loan.data.loanId,
                        'PENDING',
                        'Top-up loan created and awaiting approval',
                        0,
                        RequestedAmount
                    );
                }, 500);
            }
            
            return this.signature.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Reason: 'Pending employer approval',
                FSPReferenceNumber: loan.data.loanId.toString(),
                LoanNumber: loan.data.loanId.toString(),
                Approval: 'PENDING'
            });
        } catch (error) {
            logger.error('Top-up error:', error);
            return this.signature.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Reason: error.message,
                Approval: 'REJECTED'
            });
        }
    }

    async processLoanRestructureBalance(data) {
        const { CheckNumber, LoanNumber, FirstName, LastName, VoteCode } = data;
        
        try {
            const loan = await this.mifosx.getLoan(LoanNumber);
            if (!loan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            const loanData = loan.data;
            const outstandingBalance = loanData.summary?.totalOutstanding || 0;
            const principalBalance = loanData.summary?.principalOutstanding || 0;
            const installmentAmount = loanData.repaymentSchedule?.periods?.[0]?.totalDue || 0;
            const lastRepaymentDate = loanData.timeline?.lastPaymentDate || new Date().toISOString();
            const maturityDate = loanData.timeline?.expectedMaturityDate || new Date().toISOString();
            
            return this.signature.generateXmlDocument('LOAN_RESTRUCTURE_BALANCE_RESPONSE', {
                LoanNumber: LoanNumber,
                InstallmentAmount: installmentAmount,
                OutstandingBalance: outstandingBalance,
                PrincipalBalance: principalBalance,
                ValidityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                LastRepaymentDate: lastRepaymentDate,
                MaturityDate: maturityDate
            });
        } catch (error) {
            logger.error('Restructure balance error:', error);
            return this.signature.generateResponse('8011', 'Error fetching loan balance');
        }
    }

    async processLoanRestructureAffordability(data) {
        const { CheckNumber, RequestedAmount, Tenure, ProductCode, BasicSalary, NetSalary, LoanNumber } = data;
        
        try {
            const product = await this.mifosx.getLoanProduct(ProductCode);
            if (!product.success) {
                return this.signature.generateResponse('8018', 'Invalid product code');
            }
            
            const productData = product.data;
            const maxAmount = Math.min(productData.maxPrincipal, NetSalary * 12);
            const eligibleAmount = Math.min(RequestedAmount || maxAmount, maxAmount);
            
            const interestRate = productData.interestRatePerPeriod || 10;
            const processingFee = productData.processingFee || 2;
            const insurance = productData.insurance || 0.75;
            
            const totalInterest = (eligibleAmount * interestRate / 100) * (Tenure / 12);
            const totalProcessingFees = eligibleAmount * processingFee / 100;
            const totalInsuranceAmount = eligibleAmount * insurance / 100;
            const netLoanAmount = eligibleAmount - totalProcessingFees - totalInsuranceAmount;
            const monthlyReturn = (eligibleAmount + totalInterest) / Tenure;
            
            return this.signature.generateXmlDocument('LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE', {
                DesiredDeductibleAmount: monthlyReturn,
                TotalInsurance: totalInsuranceAmount,
                TotalProcessingFees: totalProcessingFees,
                TotalInterestRateAmount: totalInterest,
                OtherCharges: '0',
                NetLoanAmount: netLoanAmount,
                TotalAmountToPay: eligibleAmount + totalInterest,
                Tenure: Tenure,
                MonthlyReturnAmount: monthlyReturn
            });
        } catch (error) {
            logger.error('Restructure affordability error:', error);
            return this.signature.generateResponse('8011', 'Error processing affordability');
        }
    }

    async processLoanRestructureRequest(data) {
        const {
            CheckNumber, FirstName, LastName, ApplicationNumber, LoanNumber,
            DesiredDeductibleAmount, Tenure, ProductCode, LoanPurpose, FSPReferenceNumber
        } = data;
        
        try {
            const existingLoan = await this.mifosx.getLoan(LoanNumber);
            if (!existingLoan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            this.loanCache.set(ApplicationNumber, {
                originalLoanNumber: LoanNumber,
                checkNumber: CheckNumber,
                status: 'RESTRUCTURE_PENDING',
                newTenure: Tenure,
                newInstallment: DesiredDeductibleAmount,
                productCode: ProductCode
            });
            
            if (this.notificationService) {
                setTimeout(() => {
                    this.notificationService.notifyRestructuringApproval(
                        ApplicationNumber,
                        LoanNumber,
                        'PENDING',
                        'Restructure request received'
                    );
                }, 500);
            }
            
            return this.signature.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Reason: 'Restructure request pending approval',
                FSPReferenceNumber: FSPReferenceNumber || `REST_${LoanNumber}_${Date.now()}`,
                LoanNumber: LoanNumber,
                Approval: 'PENDING'
            });
        } catch (error) {
            logger.error('Restructure request error:', error);
            return this.signature.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Reason: error.message,
                Approval: 'REJECTED'
            });
        }
    }

    async processLoanRestructureRejection(data) {
        const { ApplicationNumber, Reason, FSPReferenceNumber, LoanNumber } = data;
        
        try {
            logger.info('Restructure rejection:', { ApplicationNumber, Reason, LoanNumber });
            
            const cached = this.loanCache.get(ApplicationNumber);
            if (cached) {
                cached.status = 'RESTRUCTURE_REJECTED';
                this.loanCache.set(ApplicationNumber, cached);
            }
            
            return this.signature.generateResponse('8000', 'Restructure rejection acknowledged');
        } catch (error) {
            logger.error('Restructure rejection error:', error);
            return this.signature.generateResponse('8011', 'Error processing rejection');
        }
    }

    async processFSPInitiatedRestructure(data) {
        const {
            ApplicationNumber, LoanNumber, OutstandingBalance, PrincipalBalance,
            InstallmentAmount, LastRepaymentDate, MaturityDate, ValidityDate,
            Reason, NewInstallmentAmount, NewInsuranceAmount, NewProcessingFee,
            NewInterestAmount, NewPrincipalAmount, NewTotalAmountPayable,
            OtherCharges, NewTenure, ProductCode, DeductionCode, FSPReferenceNumber
        } = data;
        
        try {
            const existingLoan = await this.mifosx.getLoan(LoanNumber);
            if (!existingLoan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            this.loanCache.set(ApplicationNumber, {
                originalLoanNumber: LoanNumber,
                status: 'FSP_RESTRUCTURE_PROPOSED',
                proposal: {
                    newInstallment: NewInstallmentAmount,
                    newTenure: NewTenure,
                    newPrincipal: NewPrincipalAmount,
                    reason: Reason
                }
            });
            
            if (this.notificationService) {
                await this.notificationService.sendNotification('LOAN_RESTRUCTURE_REQUEST_FSP', data);
            }
            
            return this.signature.generateResponse('8000', 'Restructure proposal received and validated');
        } catch (error) {
            logger.error('FSP restructure error:', error);
            return this.signature.generateResponse('8011', 'Error processing restructure proposal');
        }
    }

    async processFSPRepaymentRequest(data) {
        const { DeductionCode, VoteCode, VoteName, CheckNumber, FirstName, MiddleName, LastName, PayDate } = data;
        
        try {
            const loans = await this.mifosx.getLoanByExternalId(CheckNumber);
            if (!loans.success || !loans.data.length) {
                return this.signature.generateResponse('8019', 'No loans found for employee');
            }
            
            const loan = loans.data[0];
            const loanBalance = await this.mifosx.getLoanBalance(loan.id);
            
            return this.signature.generateXmlDocument('REPAYMENT_OFF_BALANCE_REQUEST_TO_FSP', {
                TotalPayOffAmount: loanBalance.data.summary?.totalOutstanding || 0,
                LoanNumber: loan.id,
                LastDeductionDate: PayDate || new Date().toISOString(),
                FSPBankAccount: process.env.FSP_BANK_ACCOUNT || '123456789',
                FSPBankAccountName: config.fspName,
                SWIFTCode: process.env.FSP_SWIFT_CODE || 'FSPBTZTZ',
                MNOChannels: process.env.FSP_MNO_CHANNEL || '0755000000',
                PaymentReferenceNumber: `REP_${loan.id}_${Date.now()}`,
                FinalPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                EndDate: loan.data.timeline?.expectedMaturityDate || new Date().toISOString()
            });
        } catch (error) {
            logger.error('FSP repayment request error:', error);
            return this.signature.generateResponse('8011', 'Error processing repayment request');
        }
    }

    async processFullEmployeeRepayment(data) {
        const { CheckNumber, LoanNumber, FirstName, LastName, VoteCode, DeductionAmount, PaymentOption } = data;
        
        try {
            const loan = await this.mifosx.getLoan(LoanNumber);
            if (!loan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            const totalPayoffAmount = loan.data.summary?.totalOutstanding || 0;
            const endDate = loan.data.timeline?.expectedMaturityDate || new Date().toISOString();
            const lastDeductionDate = loan.data.timeline?.lastPaymentDate || new Date().toISOString();
            
            return this.signature.generateXmlDocument('FULL_REPAYMENT_OFF_BALANCE_RESPONSE', {
                LoanNumber: LoanNumber,
                TotalPayoffAmount: totalPayoffAmount,
                FSPCode: config.fspCode,
                EndDate: endDate,
                LastDeductionDate: lastDeductionDate,
                FSPBankAccount: process.env.FSP_BANK_ACCOUNT || '123456789',
                FSPBankAccountName: config.fspName,
                SWIFTCode: process.env.FSP_SWIFT_CODE || 'FSPBTZTZ',
                MNOChannels: process.env.FSP_MNO_CHANNEL || '0755000000',
                PaymentReferenceNumber: `FULL_${LoanNumber}_${Date.now()}`,
                FinalPaymentDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            });
        } catch (error) {
            logger.error('Full repayment error:', error);
            return this.signature.generateResponse('8011', 'Error processing full repayment');
        }
    }

    async processPartialEmployeeRepayment(data) {
        const { CheckNumber, LoanNumber, FirstName, LastName, VoteCode, AmountToPay, Intention } = data;
        
        try {
            const loan = await this.mifosx.getLoan(LoanNumber);
            if (!loan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            const currentBalance = loan.data.summary?.totalOutstanding || 0;
            const expectedOutstanding = Math.max(0, currentBalance - AmountToPay);
            
            let expectedEndDate = loan.data.timeline?.expectedMaturityDate;
            if (Intention === 'reduce_tenure') {
                const monthlyPayment = loan.data.repaymentSchedule?.periods?.[0]?.totalDue || 0;
                const monthsRemaining = Math.ceil(expectedOutstanding / monthlyPayment);
                expectedEndDate = new Date();
                expectedEndDate.setMonth(expectedEndDate.getMonth() + monthsRemaining);
            }
            
            return this.signature.generateXmlDocument('PARTIAL_REPAYMENT_OFF_BALANCE_RESPONSE', {
                LoanNumber: LoanNumber,
                ExpectedOutstandingBalance: expectedOutstanding,
                PaymentAmount: AmountToPay,
                FSPCode: config.fspCode,
                ExpectedEndDate: expectedEndDate.toISOString(),
                LastDeductionDate: new Date().toISOString(),
                FSPBankAccount: process.env.FSP_BANK_ACCOUNT || '123456789',
                FSPBankAccountName: config.fspName,
                SWIFTCode: process.env.FSP_SWIFT_CODE || 'FSPBTZTZ',
                MNOChannels: process.env.FSP_MNO_CHANNEL || '0755000000',
                PaymentReferenceNumber: `PART_${LoanNumber}_${Date.now()}`,
                FinalPaymentDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            });
        } catch (error) {
            logger.error('Partial repayment error:', error);
            return this.signature.generateResponse('8011', 'Error processing partial repayment');
        }
    }

    async processMonthlyPayments(data) {
        const { MessageDetails, MessageSummary } = data;
        const deductionRecords = Array.isArray(MessageDetails.DeductionRecord) 
            ? MessageDetails.DeductionRecord 
            : [MessageDetails.DeductionRecord];
        
        const results = [];
        
        for (const record of deductionRecords) {
            try {
                const { LoanNumber, DeductionAmount, CheckDate, ApplicationNumber } = record;
                
                const repaymentResult = await this.mifosx.makeRepayment(LoanNumber, {
                    transactionDate: CheckDate,
                    transactionAmount: DeductionAmount,
                    paymentTypeId: 1,
                    note: 'Monthly salary deduction'
                });
                
                if (repaymentResult.success) {
                    results.push({
                        loanNumber: LoanNumber,
                        success: true,
                        message: 'Repayment recorded'
                    });
                    
                    const updatedLoan = await this.mifosx.getLoan(LoanNumber);
                    if (updatedLoan.success && updatedLoan.data.summary?.totalOutstanding === 0) {
                        if (this.notificationService) {
                            await this.notificationService.notifyLoanLiquidation(
                                ApplicationNumber,
                                LoanNumber,
                                0
                            );
                        }
                    }
                } else {
                    results.push({
                        loanNumber: LoanNumber,
                        success: false,
                        message: repaymentResult.error
                    });
                }
            } catch (error) {
                results.push({
                    loanNumber: record.LoanNumber,
                    success: false,
                    message: error.message
                });
            }
        }
        
        return this.signature.generateResponse('8000', `Processed ${results.length} monthly deductions`);
    }

    async getLoanStatus(data) {
        const { ApplicationNumber } = data;
        
        try {
            const cached = this.loanCache.get(ApplicationNumber);
            if (!cached) {
                return this.signature.generateResponse('8019', 'Application not found');
            }
            
            const loan = await this.mifosx.getLoan(cached.loanId);
            const statusDescription = loan.success 
                ? `Loan with application ${ApplicationNumber} is at ${loan.data.status?.value || 'Unknown'}, last action done at ${new Date().toISOString()}`
                : 'Loan status unavailable';
            
            return this.signature.generateXmlDocument('LOAN_STATUS_RESPONSE', {
                ResponseCode: '8000',
                Description: statusDescription
            });
        } catch (error) {
            logger.error('Loan status error:', error);
            return this.signature.generateResponse('8011', 'Error fetching loan status');
        }
    }

    async validateEssClientAccount(data) {
        const { AccountNumber, FirstName, MiddleName, LastName } = data;
        
        try {
            const client = await this.mifosx.getClientByExternalId(AccountNumber);
            const isValid = client.success && 
                client.data.firstname?.toLowerCase() === FirstName?.toLowerCase() &&
                client.data.lastname?.toLowerCase() === LastName?.toLowerCase();
            
            return this.signature.generateXmlDocument('ACCOUNT_VALIDATION_RESPONSE', {
                Valid: isValid,
                Reason: isValid ? '' : 'Account details do not match'
            });
        } catch (error) {
            return this.signature.generateXmlDocument('ACCOUNT_VALIDATION_RESPONSE', {
                Valid: false,
                Reason: 'Validation service unavailable'
            });
        }
    }

    async processDeductionStopNotification(data) {
        const { ApplicationNumber, LoanNumber, CheckNumber, DeductionCode, StopReason, StopDate, BalanceAmount, DeductionAmount } = data;
        
        try {
            logger.warn('Deduction stop notification:', { 
                ApplicationNumber, LoanNumber, CheckNumber, 
                StopReason, StopDate, BalanceAmount 
            });
            
            const cached = this.loanCache.get(ApplicationNumber);
            if (cached) {
                cached.status = 'SUSPENDED';
                cached.suspendReason = StopReason;
                cached.suspendDate = StopDate;
                this.loanCache.set(ApplicationNumber, cached);
                
                if (cached.loanId) {
                    logger.info('Loan suspended in cache:', cached.loanId);
                }
            }
            
            return this.signature.generateResponse('8000', 'Deduction stop acknowledged');
        } catch (error) {
            logger.error('Deduction stop error:', error);
            return this.signature.generateResponse('8011', 'Error processing deduction stop');
        }
    }

    async getFSPBranchesList() {
        const branches = [
            { DistrictCode: 'DAR01', BranchCode: 'DAR001', BranchName: 'Dar es Salaam Main Branch' },
            { DistrictCode: 'DAR01', BranchCode: 'DAR002', BranchName: 'Kariakoo Branch' },
            { DistrictCode: 'DAR01', BranchCode: 'DAR003', BranchName: 'Mbagala Branch' },
            { DistrictCode: 'ARU01', BranchCode: 'ARU001', BranchName: 'Arusha Main Branch' },
            { DistrictCode: 'ARU01', BranchCode: 'ARU002', BranchName: 'Njiro Branch' },
            { DistrictCode: 'MBE01', BranchCode: 'MBE001', BranchName: 'Mbeya Main Branch' },
            { DistrictCode: 'MBE01', BranchCode: 'MBE002', BranchName: 'Ilembo Branch' },
            { DistrictCode: 'MWA01', BranchCode: 'MWA001', BranchName: 'Mwanza Main Branch' },
            { DistrictCode: 'MWA01', BranchCode: 'MWA002', BranchName: 'Nyamagana Branch' },
            { DistrictCode: 'ZNZ01', BranchCode: 'ZNZ001', BranchName: 'Zanzibar Main Branch' },
            { DistrictCode: 'ZNZ01', BranchCode: 'ZNZ002', BranchName: 'Stone Town Branch' }
        ];
        
        const branchDetails = [];
        const districts = [...new Set(branches.map(b => b.DistrictCode))];
        
        for (const district of districts) {
            const districtBranches = branches.filter(b => b.DistrictCode === district);
            branchDetails.push({
                DistrictCode: district,
                Branch: districtBranches.map(b => ({
                    BranchCode: b.BranchCode,
                    BranchName: b.BranchName
                }))
            });
        }
        
        return this.signature.generateXmlDocument('FSP_BRANCHES', {
            BranchDetail: branchDetails
        });
    }

    async processLoanChargesRequest(data) {
        const { CheckNumber, RequestedAmount, Tenure, ProductCode, BasicSalary, NetSalary } = data;
        
        try {
            // Calculate loan eligibility based on MifosX product rules
            const product = await this.mifosx.getLoanProduct(ProductCode);
            if (!product.success) {
                return this.signature.generateResponse('8018', 'Invalid product code');
            }
            
            const productData = product.data;
            const maxAmount = Math.min(productData.maxPrincipal, NetSalary * 12);
            const eligibleAmount = Math.min(RequestedAmount || maxAmount, maxAmount);
            
            // Calculate charges
            const interestRate = productData.interestRatePerPeriod || 10;
            const processingFee = productData.processingFee || 2;
            const insurance = productData.insurance || 0.75;
            
            const totalInterest = (eligibleAmount * interestRate / 100) * (Tenure / 12);
            const totalProcessingFees = eligibleAmount * processingFee / 100;
            const totalInsuranceAmount = eligibleAmount * insurance / 100;
            const netLoanAmount = eligibleAmount - totalProcessingFees - totalInsuranceAmount;
            const monthlyReturn = (eligibleAmount + totalInterest) / Tenure;
            
            return this.signature.generateXmlDocument('LOAN_CHARGES_RESPONSE', {
                DesiredDeductibleAmount: monthlyReturn,
                TotalInsurance: totalInsuranceAmount,
                TotalProcessingFees: totalProcessingFees,
                TotalInterestRateAmount: totalInterest,
                OtherCharges: '0',
                NetLoanAmount: netLoanAmount,
                TotalAmountToPay: eligibleAmount + totalInterest,
                Tenure: Tenure,
                EligibleAmount: eligibleAmount,
                MonthlyReturnAmount: monthlyReturn
            });
        } catch (error) {
            logger.error('Error processing loan charges:', error);
            return this.signature.generateResponse('8011', 'Error processing request');
        }
    }

    async processLoanOfferRequest(data) {
        const {
            CheckNumber, FirstName, LastName, BankAccountNumber,
            VoteCode, NIN, RequestedAmount, Tenure, ProductCode,
            ApplicationNumber, MobileNumber, EmailAddress
        } = data;
        
        try {
            // Create or get client in MifosX
            let clientId;
            const existingClient = await this.mifosx.getClientByExternalId(CheckNumber);
            
            if (!existingClient.success) {
                const client = await this.mifosx.createClient({
                    externalId: CheckNumber,
                    firstname: FirstName,
                    lastname: LastName,
                    mobileNo: MobileNumber,
                    emailAddress: EmailAddress,
                    legalFormId: 1,
                    clientTypeId: 1
                });
                if (!client.success) throw new Error('Failed to create client');
                clientId = client.data.clientId;
            } else {
                clientId = existingClient.data.id;
            }
            
            // Create loan application
            const loanApplication = {
                clientId: clientId,
                productId: ProductCode,
                principal: RequestedAmount,
                loanTermFrequency: Tenure,
                loanTermFrequencyType: 2, // Months
                numberOfRepayments: Tenure,
                repaymentEvery: 1,
                repaymentFrequencyType: 2, // Months
                interestRatePerPeriod: 10,
                amortizationType: 1,
                interestType: 0,
                interestCalculationPeriodType: 1,
                transactionProcessingStrategyId: 1,
                submittedOnDate: new Date().toISOString().split('T')[0],
                expectedDisbursementDate: new Date().toISOString().split('T')[0],
                externalId: ApplicationNumber
            };
            
            const loan = await this.mifosx.createLoan(loanApplication);
            if (!loan.success) throw new Error('Failed to create loan application');
            
            // Store in cache for later reference
            this.loanCache.set(ApplicationNumber, {
                loanId: loan.data.loanId,
                clientId: clientId,
                checkNumber: CheckNumber,
                status: 'PENDING'
            });
            
            // Send async notification to ESS of initial approval
            if (this.notificationService) {
                setTimeout(() => {
                    this.notificationService.notifyLoanApproval(
                        ApplicationNumber,
                        loan.data.loanId,
                        'PENDING',
                        'Loan created and awaiting final approval',
                        0,
                        RequestedAmount
                    );
                }, 500);
            }
            
            return this.signature.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Reason: 'Pending FSP review',
                FSPReferenceNumber: loan.data.loanId.toString(),
                LoanNumber: loan.data.loanId.toString(),
                Approval: 'PENDING'
            });
        } catch (error) {
            logger.error('Error processing loan offer:', error);
            return this.signature.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Reason: error.message,
                Approval: 'REJECTED'
            });
        }
    }

    async processLoanApproval(data) {
        const { ApplicationNumber, Approval, Reason } = data;
        
        try {
            const cached = this.loanCache.get(ApplicationNumber);
            if (!cached) {
                return this.signature.generateResponse('8019', 'Invalid application number');
            }
            
            if (Approval === 'APPROVED') {
                const approvalResult = await this.mifosx.approveLoan(cached.loanId, {
                    approvedOnDate: new Date().toISOString().split('T')[0],
                    note: 'Employer approval received'
                });
                
                if (approvalResult.success) {
                    cached.status = 'APPROVED';
                    this.loanCache.set(ApplicationNumber, cached);
                }
            } else {
                await this.mifosx.rejectLoan(cached.loanId, {
                    rejectedOnDate: new Date().toISOString().split('T')[0],
                    note: Reason || 'Loan rejected by employer'
                });
                cached.status = 'REJECTED';
                this.loanCache.set(ApplicationNumber, cached);
            }
            
            return this.signature.generateResponse('8000', 'Approval status received');
        } catch (error) {
            logger.error('Error processing loan approval:', error);
            return this.signature.generateResponse('8011', 'Error processing approval');
        }
    }

    async processDisbursement(applicationNumber) {
        try {
            const cached = this.loanCache.get(applicationNumber);
            if (!cached || cached.status !== 'APPROVED') {
                return this.signature.generateXmlDocument('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', {
                    ApplicationNumber: applicationNumber,
                    Reason: 'Loan not approved for disbursement'
                });
            }
            
            const disbursementResult = await this.mifosx.disburseLoan(cached.loanId, {
                actualDisbursementDate: new Date().toISOString().split('T')[0],
                transactionAmount: 0, // Full principal
                note: 'Loan disbursement from e-MKOPO'
            });
            
            if (disbursementResult.success) {
                cached.status = 'DISBURSED';
                this.loanCache.set(applicationNumber, cached);
                
                return this.signature.generateXmlDocument('LOAN_DISBURSEMENT_NOTIFICATION', {
                    ApplicationNumber: applicationNumber,
                    FSPReferenceNumber: cached.loanId.toString(),
                    LoanNumber: cached.loanId.toString(),
                    TotalAmountToPay: '0',
                    DisbursementDate: new Date().toISOString()
                });
            } else {
                throw new Error('Disbursement failed');
            }
        } catch (error) {
            logger.error('Disbursement error:', error);
            return this.signature.generateXmlDocument('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', {
                ApplicationNumber: applicationNumber,
                Reason: error.message
            });
        }
    }

    async processMonthlyDeductions(deductions) {
        const results = [];
        
        for (const record of deductions) {
            try {
                const { LoanNumber, DeductionAmount, CheckDate } = record;
                const loanId = LoanNumber;
                
                const repaymentResult = await this.mifosx.makeRepayment(loanId, {
                    transactionDate: CheckDate,
                    transactionAmount: DeductionAmount,
                    paymentTypeId: 1,
                    note: 'Monthly salary deduction'
                });
                
                results.push({
                    loanNumber: LoanNumber,
                    success: repaymentResult.success,
                    message: repaymentResult.success ? 'Repayment recorded' : repaymentResult.error
                });
            } catch (error) {
                results.push({
                    loanNumber: record.LoanNumber,
                    success: false,
                    message: error.message
                });
            }
        }
        
        return this.signature.generateResponse('8000', `Processed ${results.length} deductions`);
    }

    async processLoanBalanceRequest(loanNumber) {
        try {
            const loan = await this.mifosx.getLoan(loanNumber);
            if (!loan.success) {
                return this.signature.generateResponse('8019', 'Loan not found');
            }
            
            const loanData = loan.data;
            const outstandingBalance = loanData.summary?.totalOutstanding || 0;
            const principalBalance = loanData.summary?.principalOutstanding || 0;
            const installmentAmount = loanData.repaymentSchedule?.periods?.[0]?.totalDue || 0;
            
            return this.signature.generateXmlDocument('LOAN_RESTRUCTURE_BALANCE_RESPONSE', {
                LoanNumber: loanNumber,
                InstallmentAmount: installmentAmount,
                OutstandingBalance: outstandingBalance,
                PrincipalBalance: principalBalance,
                ValidityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                LastRepaymentDate: loanData.timeline?.actualDisbursementDate || new Date().toISOString(),
                MaturityDate: loanData.timeline?.expectedMaturityDate || new Date().toISOString()
            });
        } catch (error) {
            logger.error('Balance request error:', error);
            return this.signature.generateResponse('8011', 'Error fetching loan balance');
        }
    }

    async processAccountValidation(accountNumber, firstName, lastName) {
        try {
            // Validate account with MifosX or bank integration
            const client = await this.mifosx.getClientByExternalId(accountNumber);
            const isValid = client.success && 
                client.data.firstname?.toLowerCase() === firstName?.toLowerCase();
            
            return this.signature.generateXmlDocument('ACCOUNT_VALIDATION_RESPONSE', {
                Valid: isValid,
                Reason: isValid ? '' : 'Account number does not match name'
            });
        } catch (error) {
            return this.signature.generateXmlDocument('ACCOUNT_VALIDATION_RESPONSE', {
                Valid: false,
                Reason: 'Account validation service unavailable'
            });
        }
    }

    async getFSPBranches() {
        // Static branches - would come from database in production
        const branches = [
            { DistrictCode: 'DAR01', BranchCode: 'DAR001', BranchName: 'Dar es Salaam Main Branch' },
            { DistrictCode: 'DAR01', BranchCode: 'DAR002', BranchName: 'Kariakoo Branch' },
            { DistrictCode: 'ARU01', BranchCode: 'ARU001', BranchName: 'Arusha Main Branch' },
            { DistrictCode: 'MBE01', BranchCode: 'MBE001', BranchName: 'Mbeya Branch' },
            { DistrictCode: 'MWA01', BranchCode: 'MWA001', BranchName: 'Mwanza Branch' }
        ];
        
        const branchDetails = [];
        const districts = [...new Set(branches.map(b => b.DistrictCode))];
        
        for (const district of districts) {
            const districtBranches = branches.filter(b => b.DistrictCode === district);
            branchDetails.push({
                DistrictCode: district,
                Branch: districtBranches.map(b => ({
                    BranchCode: b.BranchCode,
                    BranchName: b.BranchName
                }))
            });
        }
        
        return this.signature.generateXmlDocument('FSP_BRANCHES', {
            BranchDetail: branchDetails
        });
    }

    async processDefaulterNotification(data) {
        const { CheckNumber, LoanNumber, EmployeeStatus } = data;
        
        logger.warn('Defaulter notification received:', { CheckNumber, LoanNumber, EmployeeStatus });
        
        // This would trigger collections workflow in production
        return this.signature.generateResponse('8000', 'Defaulter notification acknowledged');
    }

    async processDeductionStop(data) {
        const { ApplicationNumber, LoanNumber, StopReason, StopDate } = data;
        
        logger.warn('Deduction stop notification:', { ApplicationNumber, LoanNumber, StopReason, StopDate });
        
        // Update loan status in MifosX
        const cached = this.loanCache.get(ApplicationNumber);
        if (cached) {
            cached.status = 'SUSPENDED';
            this.loanCache.set(ApplicationNumber, cached);
        }
        
        return this.signature.generateResponse('8000', 'Deduction stop acknowledged');
    }

    async processTakeoverBalance(data) {
        const { CheckNumber, LoanNumber, FirstName, LastName, VoteCode } = data;
        
        try {
            // Query FSP1's MifosX for existing loan balance
            const loan = await this.mifosx.getLoan(LoanNumber);
            if (!loan.success) {
                return this.signature.generateResponse('8019', `Loan ${LoanNumber} not found`);
            }
            
            const loanData = loan.data;
            const outstanding = loanData.summary?.totalOutstanding || 0;
            const nextPaymentAmount = loanData.repaymentSchedule?.periods?.[0]?.totalDue || 0;
            const nextPaymentDate = loanData.repaymentSchedule?.periods?.[0]?.dueDate || new Date().toISOString();
            
            logger.info('Takeover balance query:', { CheckNumber, LoanNumber, outstanding });
            
            return this.signature.generateXmlDocument('LOAN_TAKEOVER_BALANCE_RESPONSE', {
                LoanNumber: LoanNumber,
                CheckNumber: CheckNumber,
                OutstandingBalance: outstanding,
                NextPaymentAmount: nextPaymentAmount,
                NextPaymentDate: nextPaymentDate,
                ValidityDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                PaymentReferenceNumber: `PKO_${LoanNumber}_${Date.now()}`
            });
        } catch (error) {
            logger.error('Takeover balance error:', error);
            return this.signature.generateResponse('8011', 'Error retrieving takeover balance');
        }
    }

    async processTakeoverOffer(data) {
        const { CheckNumber, FirstName, LastName, LoanNumber, FSPCode, ProductCode, RequestedAmount, ApplicationNumber } = data;
        
        try {
            // Create new loan in FSP2 using existing client
            const existingClient = await this.mifosx.getClientByExternalId(CheckNumber);
            
            let clientId;
            if (!existingClient.success) {
                const newClient = await this.mifosx.createClient({
                    firstname: FirstName,
                    lastname: LastName,
                    externalId: CheckNumber,
                    activationDate: new Date().toISOString().split('T')[0]
                });
                clientId = newClient.data.clientId;
            } else {
                clientId = existingClient.data[0].id;
            }
            
            // Create takeover loan in FSP2
            const takeoverLoan = {
                clientId: clientId,
                productId: ProductCode,
                principal: RequestedAmount,
                loanTermFrequency: 36,
                loanTermFrequencyType: 2,
                numberOfRepayments: 36,
                repaymentEvery: 1,
                repaymentFrequencyType: 2,
                interestRatePerPeriod: 8,
                amortizationType: 1,
                interestType: 0,
                interestCalculationPeriodType: 1,
                transactionProcessingStrategyId: 1,
                submittedOnDate: new Date().toISOString().split('T')[0],
                expectedDisbursementDate: new Date().toISOString().split('T')[0],
                externalId: ApplicationNumber
            };
            
            const loan = await this.mifosx.createLoan(takeoverLoan);
            if (!loan.success) {
                return this.signature.generateXmlDocument('LOAN_TAKEOVER_APPROVAL_NOTIFICATION', {
                    ApplicationNumber: ApplicationNumber,
                    Approval: 'REJECTED',
                    Reason: 'Failed to create takeover loan'
                });
            }
            
            // Cache the takeover loan details
            this.loanCache.set(ApplicationNumber, {
                loanId: loan.data.loanId,
                clientId: clientId,
                checkNumber: CheckNumber,
                status: 'TAKEOVER_PENDING',
                originalLoanNumber: LoanNumber,
                fsp2Code: FSPCode
            });
            
            // Send async approval notification
            if (this.notificationService) {
                setTimeout(() => {
                    this.notificationService.notifyTakeoverApproval(
                        ApplicationNumber,
                        loan.data.loanId,
                        'PENDING',
                        'Takeover loan created and awaiting final approval'
                    );
                }, 500);
            }
            
            return this.signature.generateXmlDocument('LOAN_TAKEOVER_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                FSPReferenceNumber: loan.data.loanId.toString(),
                LoanNumber: loan.data.loanId.toString(),
                Approval: 'PENDING',
                Reason: 'Takeover loan created'
            });
        } catch (error) {
            logger.error('Takeover offer error:', error);
            return this.signature.generateXmlDocument('LOAN_TAKEOVER_APPROVAL_NOTIFICATION', {
                ApplicationNumber: ApplicationNumber,
                Approval: 'REJECTED',
                Reason: error.message
            });
        }
    }

    async processTakeoverPayment(data) {
        const { CheckNumber, LoanNumber, PaymentAmount, PaymentDate, FSP1Code } = data;
        
        try {
            logger.info('Takeover payment received:', { CheckNumber, LoanNumber, PaymentAmount });
            
            // Record payment in FSP1's MifosX
            const repayment = await this.mifosx.makeRepayment(LoanNumber, {
                transactionDate: PaymentDate || new Date().toISOString().split('T')[0],
                transactionAmount: PaymentAmount
            });
            
            if (!repayment.success) {
                return this.signature.generateResponse('8011', 'Payment recording failed');
            }
            
            // Send async payment acknowledgment
            if (this.notificationService) {
                setTimeout(() => {
                    this.notificationService.notifyPaymentAcknowledgment(
                        `PAYMENT_${LoanNumber}`,
                        LoanNumber,
                        PaymentAmount,
                        PaymentDate || new Date().toISOString()
                    );
                }, 500);
            }
            
            return this.signature.generateResponse('8000', `Payment of ${PaymentAmount} recorded for loan ${LoanNumber}`);
        } catch (error) {
            logger.error('Takeover payment error:', error);
            return this.signature.generateResponse('8011', 'Error recording payment');
        }
    }
}

// ==================== NOTIFICATION SERVICE ====================
class NotificationService {
    constructor(signatureService, essUrl) {
        this.signature = signatureService;
        this.essUrl = essUrl;
        this.retryAttempts = 3;
        this.retryDelayMs = 1000;
    }
    
    async sendNotificationRaw(xmlPayload, messageType, notificationId = null) {
        const msgId = notificationId || this.signature.generateMsgId();
        let response = null;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const axiosResponse = await axios.post(this.essUrl, xmlPayload, {
                    headers: {
                        'Content-Type': 'application/xml',
                        'X-Message-Type': messageType,
                        'X-Message-ID': msgId,
                        'X-FSP-Code': config.fspCode
                    },
                    timeout: 10000
                });
                
                response = { success: true, messageId: msgId, statusCode: axiosResponse.status, data: axiosResponse.data };
                
                logger.info(`Notification sent successfully: ${messageType}`, {
                    messageId: msgId,
                    attempt,
                    statusCode: axiosResponse.status
                });
                
                // Log outbound transaction
                await logOutboundTransaction(messageType, { raw: xmlPayload }, msgId, response);
                
                return response;
            } catch (error) {
                logger.warn(`Notification send failed (attempt ${attempt}/${this.retryAttempts}): ${messageType}`, {
                    messageId: msgId,
                    error: error.message,
                    nextRetryIn: attempt < this.retryAttempts ? this.retryDelayMs : 'no retry'
                });
                
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
                } else {
                    response = { success: false, messageId: msgId, error: error.message };
                    logger.error(`Failed to send notification after ${this.retryAttempts} attempts: ${messageType}`, {
                        messageId: msgId,
                        error: error.message
                    });
                    
                    // Log failed outbound transaction
                    await logOutboundTransaction(messageType, { raw: xmlPayload }, msgId, response);
                    
                    return response;
                }
            }
        }
    }
    
    async sendNotification(messageType, messageDetails, notificationId = null) {
        const msgId = notificationId || this.signature.generateMsgId();
        const xmlPayload = this.signature.generateXmlDocument(messageType, messageDetails);
        
        // Log outbound transaction start
        await logOutboundTransaction(messageType, messageDetails, msgId, { success: false, status: 'PENDING' });
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await axios.post(this.essUrl, xmlPayload, {
                    headers: {
                        'Content-Type': 'application/xml',
                        'X-Message-Type': messageType,
                        'X-Message-ID': msgId,
                        'X-FSP-Code': config.fspCode
                    },
                    timeout: 10000
                });
                
                logger.info(`Notification sent successfully: ${messageType}`, {
                    messageId: msgId,
                    attempt,
                    statusCode: response.status
                });
                
                const result = { success: true, messageId: msgId, statusCode: response.status };
                
                // Update outbound transaction log
                await logOutboundTransaction(messageType, messageDetails, msgId, result);
                
                return result;
            } catch (error) {
                logger.warn(`Notification send failed (attempt ${attempt}/${this.retryAttempts}): ${messageType}`, {
                    messageId: msgId,
                    error: error.message,
                    nextRetryIn: attempt < this.retryAttempts ? this.retryDelayMs : 'no retry'
                });
                
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
                } else {
                    const result = { success: false, messageId: msgId, error: error.message };
                    logger.error(`Failed to send notification after ${this.retryAttempts} attempts: ${messageType}`, {
                        messageId: msgId,
                        error: error.message
                    });
                    
                    // Update failed outbound transaction log
                    await logOutboundTransaction(messageType, messageDetails, msgId, result);
                    
                    return result;
                }
            }
        }
    }

    async notifyLoanApproval(applicationNumber, loanId, approval, reason = 'Ok', otherCharges = 0, totalAmountToPay = 0) {
        return this.sendNotification('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            FSPReferenceNumber: loanId.toString(),
            LoanNumber: loanId.toString(),
            Approval: approval,
            Reason: reason,
            OtherCharges: otherCharges,
            TotalAmountToPay: totalAmountToPay
        });
    }

    async notifyDisbursement(applicationNumber, loanId, totalAmountToPay, disbursementDate) {
        return this.sendNotification('LOAN_DISBURSEMENT_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            FSPReferenceNumber: loanId.toString(),
            LoanNumber: loanId.toString(),
            TotalAmountToPay: totalAmountToPay,
            DisbursementDate: disbursementDate
        });
    }

    async notifyDisbursementFailure(applicationNumber, reason) {
        return this.sendNotification('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            Reason: reason
        });
    }

    async notifyRestructuringApproval(applicationNumber, loanId, approval, reason = 'Ok') {
        return this.sendNotification('LOAN_RESTRUCTURED_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            FSPReferenceNumber: loanId.toString(),
            LoanNumber: loanId.toString(),
            Approval: approval,
            Reason: reason
        });
    }

    async notifyRestructuringFailure(applicationNumber, reason) {
        return this.sendNotification('LOAN_RESTRUCTURED_FAILURE_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            Reason: reason
        });
    }

    async notifyTakeoverApproval(applicationNumber, loanId, approval, reason = 'Ok') {
        return this.sendNotification('LOAN_TAKEOVER_APPROVAL_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            FSPReferenceNumber: loanId.toString(),
            LoanNumber: loanId.toString(),
            Approval: approval,
            Reason: reason
        });
    }

    async notifyPaymentAcknowledgment(applicationNumber, loanId, paymentAmount, paymentDate) {
        return this.sendNotification('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            FSPReferenceNumber: loanId.toString(),
            LoanNumber: loanId.toString(),
            PaymentAmount: paymentAmount,
            PaymentDate: paymentDate
        });
    }

    async notifyLoanLiquidation(applicationNumber, loanId, outstandingBalance) {
        return this.sendNotification('LOAN_LIQUIDATION_NOTIFICATION', {
            ApplicationNumber: applicationNumber,
            FSPReferenceNumber: loanId.toString(),
            LoanNumber: loanId.toString(),
            OutstandingBalance: outstandingBalance,
            LiquidationDate: new Date().toISOString()
        });
    }
}

// ==================== EXPRESS SERVER SETUP ====================
const app = express.Router();
const mifosxClient = new MifosxClient();
const signatureService = new DigitalSignatureService();
const notificationService = new NotificationService(signatureService, config.essNotificationUrl);
const loanService = new LoanProcessingService(mifosxClient, signatureService);
loanService.notificationService = notificationService;



// Transaction logging middleware for inbound requests
app.use('/', logInboundTransaction);

// ==================== PRODUCT API ENDPOINTS ====================

app.post('/products/commission', async (req, res) => {
    try {
        const {productIds}=req.body;
        const products = await mifosxClient.getLoanProducts();
        if (!products.success) {
            return res.status(500).json({ error: 'Failed to fetch products' });
        }
        
        const catalog = products.data.filter((p)=>productIds.includes(p.id)).map(product => ({
            FSPCode: config.fspCode,
            FSPName: config.fspName,
            ProductCode: product.id,
            ProductName: product.name,
            MinimumTenure: product.minPrincipal ? 1 : 3,
            MaximumTenure: product.maxPrincipal ? 36 : 24,
            InterestRate: product.interestRatePerPeriod || 10,
            ProcessingFee: product.processingFee || 2,
            Insurance: product.insurance || 0.75,
            MinAmount: product.minPrincipal || 100000,
            MaxAmount: product.maxPrincipal || 5000000,
            RepaymentType: product.repaymentStrategyType?.value || 'Flat',
            TermsAndCondition: [
                { TermsConditionNumber: 'TC001', Description: 'Monthly deductions via salary', TCEffectiveDate: new Date().toISOString() }
            ],
            ProductDescription: product.description || product.name,
            ForExecutive: false,
            DeductionCode: `${config.fspCode}_DED`,
            InsuranceType: 'DISTRIBUTED',
            ShariaFacility: false
        }));
        
        await notificationService.sendNotification('PRODUCT_DETAIL', catalog);
        
        res.json({
            success: true,
            productsCommissioned: catalog
        });
    } catch (error) {
        logger.error('Product catalog error:', error);
        res.status(500).json({ 'error': error.message });
    }
});

// Product Decommission
app.post('/products/decommission', async (req, res) => {
    try {
        const {productIds}=req.body;
        const products = productIds.map(p=>({ProductCode:p}));
        await notificationService.sendNotification('PRODUCT_DECOMMISSION', products);
        res.json({
            success: true,
            productsDecommissioned: products
        });
    } catch(error) {
        logger.error('Decommission error ',error);
        res.status(500).json({ 'error': error.message });
    }
});

//MAIN ENTRY POINT MESSAGE BASED
app.post('/', async (req, res) => {
    try {
        const parsed = signatureService.parseXmlDocument(req.body);
        if (!parsed || !parsed.isValid) {
            const errorResponse = signatureService.generateResponse('8009', 'Invalid signature');
            res.type('application/xml').send(errorResponse);
            return;
        }
        
        let response = null;
        const messageType = parsed.data.Header?.MessageType || parsed.data.MessageType;
        const messageDetails = parsed.data.MessageDetails || parsed.data;
        
        switch (messageType) {
            case MSG.PRODUCT_DETAIL:
                response = signatureService.generateResponse('8000', 'Product details received');
                break;
            case MSG.PRODUCT_DECOMMISSION:
                response = signatureService.generateResponse('8000', 'Product decommission received');
                break;
            case MSG.LOAN_CHARGES_REQUEST:
                response = await loanService.processLoanChargesRequest(messageDetails);
                break;
            case MSG.LOAN_OFFER_REQUEST:
                response = await loanService.processLoanOfferRequest(messageDetails);
                break;
            case MSG.LOAN_FINAL_APPROVAL_NOTIFICATION:
                response = await loanService.processLoanApproval(messageDetails);
                break;
            case MSG.LOAN_CANCELLATION_NOTIFICATION:
                response = await loanService.processLoanCancellationRequest(messageDetails);
                break;
            case MSG.TOP_UP_PAY_OFF_BALANCE_REQUEST:
                response = await loanService.processPayOffBalance(messageDetails);
                break;
            case MSG.TOP_UP_OFFER_REQUEST:
                response = await loanService.processLoanTopUp(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_BALANCE_REQUEST:
                response = await loanService.processLoanRestructureBalance(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST:
                response = await loanService.processLoanRestructureAffordability(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_REQUEST:
                response = await loanService.processLoanRestructureRequest(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_REJECTION:
                response = await loanService.processLoanRestructureRejection(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_REQUEST_FSP:
                response = await loanService.processFSPInitiatedRestructure(messageDetails);
                break;
            case MSG.TAKEOVER_PAY_OFF_BALANCE_REQUEST:
                response = await loanService.processTakeoverBalance(messageDetails);
                break;
            case MSG.LOAN_TAKEOVER_OFFER_REQUEST:
                response = await loanService.processTakeoverOffer(messageDetails);
                break;
            case MSG.TAKEOVER_PAYMENT_NOTIFICATION:
                response = await loanService.processTakeoverPayment(messageDetails);
                break;
            case MSG.FSP_REPAYMENT_REQUEST:
                response = await loanService.processFSPRepaymentRequest(messageDetails);
                break;
            case MSG.FULL_LOAN_REPAYMENT_REQUEST:
                response = await loanService.processFullEmployeeRepayment(messageDetails);
                break;
            case MSG.PARTIAL_LOAN_REPAYMENT_REQUEST:
                response = await loanService.processPartialEmployeeRepayment(messageDetails);
                break;
            case MSG.FSP_MONTHLY_DEDUCTIONS:
                response = await loanService.processMonthlyPayments(parsed.data);
                break;
            case MSG.LOAN_STATUS_REQUEST:
                response = await loanService.getLoanStatus(messageDetails);
                break;
            case MSG.DEFAULTER_DETAILS_TO_FSP:
                response = signatureService.generateResponse('8000', 'Defaulter details received');
                break;
            case MSG.DEDUCTION_STOP_NOTIFICATION:
                response = await loanService.processDeductionStopNotification(messageDetails);
                break;
            case MSG.ACCOUNT_VALIDATION:
                response = await loanService.validateEssClientAccount(messageDetails);
                break;
            case MSG.FSP_BRANCHES:
                response = await loanService.getFSPBranchesList();
                break;
            default:
                logger.warn('Unknown message type from ESS:', messageType);
                response = signatureService.generateResponse('8000', 'Message received but not processed');
        }
        
        if (response) {
            res.type('application/xml').send(response);
        } else {
            throw new Error('No response generated');
        }
    } catch (error) {
        logger.error('FSP TO ESS RESPONSE ERROR: ', error);
        res.type('application/xml').send(signatureService.generateResponse('8011', 'API Error: ' + error.message));
    }
});

// ==================== PROACTIVE NOTIFICATIONS (FSP to ESS) ====================

app.post('/notification/loan-initial-approval', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason,
            FSPReferenceNumber,
            LoanNumber,
            TotalAmountToPay,
            OtherCharges,
            Approval
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Ok',
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            OtherCharges: OtherCharges || '0',
            Approval: Approval || 'APPROVED'
        });
        
        res.json({
            success: true,
            message: 'Loan initial approval notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_INITIAL_APPROVAL_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/loan-disbursement', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            FSPReferenceNumber,
            LoanNumber,
            TotalAmountToPay,
            DisbursementDate
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_DISBURSEMENT_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            DisbursementDate: DisbursementDate || new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Loan disbursement notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_DISBURSEMENT_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/loan-disbursement-failure', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Technical error occurred'
        });
        
        res.json({
            success: true,
            message: 'Loan disbursement failure notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/restructure-affordability-response', async (req, res) => {
    try {
        const {
            DesiredDeductibleAmount,
            TotalInsurance,
            TotalProcessingFees,
            TotalInterestRateAmount,
            OtherCharges,
            NetLoanAmount,
            TotalAmountToPay,
            Tenure,
            EligibleAmount,
            MonthlyReturnAmount
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE', {
            DesiredDeductibleAmount: DesiredDeductibleAmount,
            TotalInsurance: TotalInsurance,
            TotalProcessingFees: TotalProcessingFees,
            TotalInterestRateAmount: TotalInterestRateAmount,
            OtherCharges: OtherCharges || '0',
            NetLoanAmount: NetLoanAmount,
            TotalAmountToPay: TotalAmountToPay,
            Tenure: Tenure,
            EligibleAmount: EligibleAmount,
            MonthlyReturnAmount: MonthlyReturnAmount
        });
        
        res.json({
            success: true,
            message: 'Restructure affordability response sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/loan-restructured', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            FSPReferenceNumber,
            LoanNumber,
            TotalAmountToPay,
            DisbursementDate
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_RESTRUCTURED_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            DisbursementDate: DisbursementDate || new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: 'Loan restructured notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_RESTRUCTURED_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/loan-restructured-failure', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_RESTRUCTURED_FAILURE_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Restructuring failed'
        });
        
        res.json({
            success: true,
            message: 'Loan restructured failure notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_RESTRUCTURED_FAILURE_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/takeover-balance-response', async (req, res) => {
    try {
        const {
            LoanNumber,
            TotalPayoffAmount,
            FSPCode,
            DeductionEndDate,
            LastDeductionDate,
            FSPBankAccount,
            FSPBankAccountName,
            SWIFTCode,
            MNOChannels,
            PaymentReferenceNumber,
            FinalPaymentDate,
            OutstandingBalance,
            FSPReferenceNumber
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_TAKEOVER_BALANCE_RESPONSE', {
            LoanNumber: LoanNumber,
            TotalPayoffAmount: TotalPayoffAmount,
            FSPCode: FSPCode,
            DeductionEndDate: DeductionEndDate,
            LastDeductionDate: LastDeductionDate,
            FSPBankAccount: FSPBankAccount,
            FSPBankAccountName: FSPBankAccountName,
            SWIFTCode: SWIFTCode,
            MNOChannels: MNOChannels,
            PaymentReferenceNumber: PaymentReferenceNumber,
            FinalPaymentDate: FinalPaymentDate,
            OutstandingBalance: OutstandingBalance,
            FSPReferenceNumber: FSPReferenceNumber
        });
        
        res.json({
            success: true,
            message: 'Loan takeover balance response sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_TAKEOVER_BALANCE_RESPONSE error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/takeover-approval', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason,
            FSPReferenceNumber,
            OtherCharges,
            Approval,
            LoanNumber
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_TAKEOVER_APPROVAL_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Ok',
            FSPReferenceNumber: FSPReferenceNumber,
            OtherCharges: OtherCharges || '0',
            Approval: Approval || 'APPROVED',
            LoanNumber: LoanNumber
        });
        
        res.json({
            success: true,
            message: 'Loan takeover approval notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_TAKEOVER_APPROVAL_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/takeover-disbursement', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            FSPReferenceNumber,
            LoanNumber,
            TotalAmountToPay,
            DisbursementDate,
            Reason,
            PaymentAdvice,
            PaymentAdviceAttachment
        } = req.body;

        const response = await notificationService.sendNotification('TAKEOVER_DISBURSEMENT_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            DisbursementDate: DisbursementDate || new Date().toISOString(),
            Reason: Reason || 'Takeover disbursement completed',
            PaymentAdvice: PaymentAdvice || 'MT103',
            PaymentAdviceAttachment: PaymentAdviceAttachment || ''
        });
        
        res.json({
            success: true,
            message: 'Takeover disbursement notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('TAKEOVER_DISBURSEMENT_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/payment-acknowledgment', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Remarks,
            FSPReferenceNumber,
            PaymentStatus,
            LoanNumber
        } = req.body;

        const response = await notificationService.sendNotification('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Remarks: Remarks || 'Payment processed',
            FSPReferenceNumber: FSPReferenceNumber,
            PaymentStatus: PaymentStatus || 'SETTLED',
            LoanNumber: LoanNumber
        });
        
        res.json({
            success: true,
            message: 'Payment acknowledgment notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/full-repayment', async (req, res) => {
    try {
        const {
            CheckNumber,
            ApplicationNumber,
            LoanNumber,
            PaymentReference,
            DeductionCode,
            PaymentDescription,
            PaymentDate,
            PaymentAmount,
            LoanBalance
        } = req.body;

        const response = await notificationService.sendNotification('FULL_LOAN_REPAYMENT_NOTIFICATION', {
            CheckNumber: CheckNumber,
            ApplicationNumber: ApplicationNumber,
            LoanNumber: LoanNumber,
            PaymentReference: PaymentReference,
            DeductionCode: DeductionCode,
            PaymentDescription: PaymentDescription || 'Full loan repayment',
            PaymentDate: PaymentDate || new Date().toISOString(),
            PaymentAmount: PaymentAmount,
            LoanBalance: LoanBalance || '0'
        });
        
        res.json({
            success: true,
            message: 'Full loan repayment notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('FULL_LOAN_REPAYMENT_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/loan-liquidation', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            LoanNumber,
            Remarks
        } = req.body;

        const response = await notificationService.sendNotification('LOAN_LIQUIDATION_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            LoanNumber: LoanNumber,
            Remarks: Remarks || 'Loan fully paid and closed'
        });
        
        res.json({
            success: true,
            message: 'Loan liquidation notification sent to ESS',
            essResponse: response
        });
    } catch (error) {
        logger.error('LOAN_LIQUIDATION_NOTIFICATION error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/notification/defaulter-to-employer', async (req, res) => {
    try {
        const {
            CheckNumber,
            LoanNumber,
            FirstName,
            MiddleName,
            LastName,
            VoteCode,
            VoteName,
            InstallationAmount,
            DeductionCode,
            DeductionName,
            OutstandingBalance,
            LastPayDate,
            FSPCode
        } = req.body;

        const response = await notificationService.sendNotification('DEFAULTER_DETAILS_TO_EMPLOYER', {
            CheckNumber: CheckNumber,
            LoanNumber: LoanNumber,
            FirstName: FirstName,
            MiddleName: MiddleName,
            LastName: LastName,
            VoteCode: VoteCode,
            VoteName: VoteName,
            InstallationAmount: InstallationAmount,
            DeductionCode: DeductionCode,
            DeductionName: DeductionName,
            OutstandingBalance: OutstandingBalance,
            LastPayDate: LastPayDate || new Date().toISOString(),
            FSPCode: FSPCode
        });
        
        res.json({
            success: true,
            message: 'Defaulter details sent to employer',
            essResponse: response
        });
    } catch (error) {
        logger.error('DEFAULTER_DETAILS_TO_EMPLOYER error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== LOG QUERY ENDPOINTS ====================

// GET /logs - Get paginated ESS logs
app.get('/logs', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, messageType, direction, status, dateFrom, dateTo } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM ess_logs WHERE 1=1';
        const params = [];
        
        if (search) {
            query += ' AND (message_id LIKE ? OR application_number LIKE ? OR loan_number LIKE ? OR client_name LIKE ? OR client_id LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }
        if (messageType) {
            query += ' AND message_type = ?';
            params.push(messageType);
        }
        if (direction) {
            query += ' AND direction = ?';
            params.push(direction);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (dateFrom) {
            query += ' AND DATE(created_at) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND DATE(created_at) <= ?';
            params.push(dateTo);
        }
        
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const countResult = await db.get(countQuery, params);
        const total = countResult.total;
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const logs = await db.all(query, params);
        
        res.json({
            data: logs,
            total: total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        logger.error('Error fetching logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /logs/:id - Get single log entry
app.get('/logs/:id', async (req, res) => {
    try {
        const log = await db.get('SELECT * FROM ess_logs WHERE id = ?', [req.params.id]);
        if (!log) {
            return res.status(404).json({ error: 'Log not found' });
        }
        res.json(log);
    } catch (error) {
        logger.error('Error fetching log:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /stats - Get statistics
app.get('/stats', async (req, res) => {
    try {
        const stats = await db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
                SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound,
                AVG(processing_time_ms) as avg_processing_time_ms
            FROM ess_logs
        `);
        res.json(stats);
    } catch (error) {
        logger.error('Error fetching stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /stats/daily - Get daily statistics
app.get('/stats/daily', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const stats = await db.all(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
                SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound
            FROM ess_logs
            WHERE created_at >= DATE('now', '-' || ? || ' days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `, [days]);
        res.json(stats);
    } catch (error) {
        logger.error('Error fetching daily stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /stats/by-message-type - Get stats by message type
app.get('/stats/by-message-type', async (req, res) => {
    try {
        const stats = await db.all(`
            SELECT 
                message_type,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
                SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound,
                AVG(processing_time_ms) as avg_processing_time_ms
            FROM ess_logs
            GROUP BY message_type
            ORDER BY total DESC
        `);
        res.json(stats);
    } catch (error) {
        logger.error('Error fetching message type stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /logs/:id/resend - Resend message to ESS
app.post('/logs/:id/resend', async (req, res) => {
    try {
        const log = await db.get('SELECT * FROM ess_logs WHERE id = ?', [req.params.id]);
        if (!log) {
            return res.status(404).json({ error: 'Log not found' });
        }
        
        if (log.direction !== 'OUTBOUND') {
            return res.status(400).json({ error: 'Only outbound messages can be resent' });
        }
        
        // Parse the original request payload
        let messageDetails = log.request_payload;
        if (typeof messageDetails === 'string') {
            messageDetails = JSON.parse(messageDetails);
        }
        
        // Resend the message
        const result = await notificationService.sendNotification(
            log.message_type,
            messageDetails.raw ? JSON.parse(messageDetails.raw) : messageDetails,
            log.message_id
        );
        
        if (result.success) {
            await db.run(
                'UPDATE ess_logs SET status = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['SUCCESS', req.params.id]
            );
            res.json({ success: true, message: 'Message resent successfully', result });
        } else {
            await db.run(
                'UPDATE ess_logs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                ['FAILED', result.error, req.params.id]
            );
            res.json({ success: false, error: result.error });
        }
    } catch (error) {
        logger.error('Error resending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /logs/:id - Delete log
app.delete('/logs/:id', async (req, res) => {
    try {
        const result = await db.run('DELETE FROM ess_logs WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Log not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('Error deleting log:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /logs/bulk-delete - Bulk delete logs
app.post('/logs/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !ids.length) {
            return res.status(400).json({ error: 'No IDs provided' });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        const result = await db.run(`DELETE FROM ess_logs WHERE id IN (${placeholders})`, ids);
        res.json({ success: true, deletedCount: result.changes });
    } catch (error) {
        logger.error('Error bulk deleting logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /export - Export to CSV
app.get('/export', async (req, res) => {
    try {
        const { search, messageType, direction, status, dateFrom, dateTo, format = 'csv' } = req.query;
        let query = 'SELECT * FROM ess_logs WHERE 1=1';
        const params = [];
        
        if (search) {
            query += ' AND (message_id LIKE ? OR application_number LIKE ? OR loan_number LIKE ? OR client_name LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        if (messageType) {
            query += ' AND message_type = ?';
            params.push(messageType);
        }
        if (direction) {
            query += ' AND direction = ?';
            params.push(direction);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (dateFrom) {
            query += ' AND DATE(created_at) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND DATE(created_at) <= ?';
            params.push(dateTo);
        }
        
        query += ' ORDER BY created_at DESC';
        const logs = await db.all(query, params);
        
        if (format === 'json') {
            res.json(logs);
            return;
        }
        
        // Convert to CSV
        if (!logs || logs.length === 0) {
            return res.send('');
        }
        
        const headers = Object.keys(logs[0]);
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        for (const row of logs) {
            const values = headers.map(header => {
                let val = row[header];
                if (val === null || val === undefined) val = '';
                if (typeof val === 'object') val = JSON.stringify(val);
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        }
        
        const csv = csvRows.join('\n');
        
        res.header('Content-Type', 'text/csv');
        res.attachment(`ess_logs_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        logger.error('Error exporting logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.post('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        fspCode: config.fspCode,
        environment: config.env
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).type('application/xml').send(signatureService.generateResponse('8011', 'Internal server error'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).type('application/xml').send(signatureService.generateResponse('8005', 'Endpoint not found'));
});
// ==================== LOAN API ENDPOINTS ====================

// Get active loans
app.get('/loans/active', async (req, res) => {
    try {
        // Get all active loans from MifosX
        const loans = await mifosxClient.request('GET', '/loans?status=active');
        
        if (!loans.success) {
            return res.status(500).json({ error: 'Failed to fetch loans' });
        }
        
        const formattedLoans = loans.data.map(loan => ({
            id: loan.id,
            loanNumber: loan.accountNo,
            applicationNumber: loan.externalId,
            clientName: loan.clientName,
            clientId: loan.clientId,
            productCode: loan.loanProductId,
            productName: loan.loanProductName,
            principal: loan.principal,
            outstandingBalance: loan.summary?.totalOutstanding || 0,
            status: loan.status?.code || 'ACTIVE',
            disbursementDate: loan.timeline?.actualDisbursementDate,
            maturityDate: loan.timeline?.expectedMaturityDate,
            interestRate: loan.interestRatePerPeriod,
            nextPaymentDate: loan.repaymentSchedule?.periods?.[0]?.dueDate,
            nextPaymentAmount: loan.repaymentSchedule?.periods?.[0]?.totalDue
        }));
        
        res.json(formattedLoans);
    } catch (error) {
        logger.error('Error fetching active loans:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get loan details
app.get('/loans/:id/details', async (req, res) => {
    try {
        const loan = await mifosxClient.getLoan(req.params.id);
        
        if (!loan.success) {
            return res.status(404).json({ error: 'Loan not found' });
        }
        
        res.json({
            id: loan.data.id,
            accountNo: loan.data.accountNo,
            externalId: loan.data.externalId,
            clientId: loan.data.clientId,
            clientName: loan.data.clientName,
            productId: loan.data.loanProductId,
            productName: loan.data.loanProductName,
            principal: loan.data.principal,
            interestRatePerPeriod: loan.data.interestRatePerPeriod,
            termFrequency: loan.data.termFrequency,
            numberOfRepayments: loan.data.numberOfRepayments,
            status: loan.data.status?.value,
            outstandingBalance: loan.data.summary?.totalOutstanding,
            principalOutstanding: loan.data.summary?.principalOutstanding,
            totalPaid: loan.data.summary?.totalRepayment,
            disbursementDate: loan.data.timeline?.actualDisbursementDate,
            maturityDate: loan.data.timeline?.expectedMaturityDate,
            repaymentSchedule: loan.data.repaymentSchedule?.periods?.map(p => ({
                period: p.period,
                dueDate: p.dueDate,
                totalDue: p.totalDue,
                principalDue: p.principalDue,
                interestDue: p.interestDue,
                balance: p.principalLoanBalanceOutstanding,
                paid: p.obligationsMet
            }))
        });
    } catch (error) {
        logger.error('Error fetching loan details:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get loan balance
app.get('/loans/:id/balance', async (req, res) => {
    try {
        const loan = await mifosxClient.getLoanBalance(req.params.id);
        
        if (!loan.success) {
            return res.status(404).json({ error: 'Loan not found' });
        }
        
        res.json({
            outstandingBalance: loan.data.summary?.totalOutstanding || 0,
            principalBalance: loan.data.summary?.principalOutstanding || 0,
            nextPaymentAmount: loan.data.repaymentSchedule?.periods?.[0]?.totalDue || 0,
            nextPaymentDate: loan.data.repaymentSchedule?.periods?.[0]?.dueDate
        });
    } catch (error) {
        logger.error('Error fetching loan balance:', error);
        res.status(500).json({ error: error.message });
    }
});

// Process repayment
app.post('/loans/repayment', async (req, res) => {
    try {
        const { loanId, amount, paymentDate, paymentMethod, notes, clientId, clientName } = req.body;
        
        const repaymentData = {
            transactionDate: paymentDate || new Date().toISOString().split('T')[0],
            transactionAmount: amount,
            paymentTypeId: getPaymentTypeId(paymentMethod),
            note: notes || `Repayment via ${paymentMethod}`
        };
        
        const result = await mifosxClient.makeRepayment(loanId, repaymentData);
        
        if (!result.success) {
            return res.status(500).json({ success: false, message: result.error });
        }
        
        // Log the transaction
        await logTransaction({
            messageId: `REPAY_${loanId}_${Date.now()}`,
            messageType: 'FSP_REPAYMENT_REQUEST',
            direction: 'INBOUND',
            requestPayload: repaymentData,
            status: 'SUCCESS',
            loanNumber: loanId,
            clientName: clientName,
            clientId: clientId
        });
        
        res.json({ success: true, transactionId: result.data.resourceId });
    } catch (error) {
        logger.error('Repayment error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Process restructure request
app.post('/loans/restructure', async (req, res) => {
    try {
        const { loanId, newTenure, newInstallmentAmount, reason, clientId, clientName } = req.body;
        
        // Send restructure request to ESS
        const restructureData = {
            LoanNumber: loanId,
            CheckNumber: clientId,
            FirstName: clientName?.split(' ')[0] || '',
            LastName: clientName?.split(' ')[1] || '',
            ApplicationNumber: `REST_${loanId}_${Date.now()}`,
            DesiredDeductibleAmount: newInstallmentAmount,
            Tenure: newTenure,
            Reason: reason
        };
        
        const result = await notificationService.sendNotification('LOAN_RESTRUCTURE_REQUEST', restructureData);
        
        res.json({ success: true, message: 'Restructure request sent to ESS', reference: result.messageId });
    } catch (error) {
        logger.error('Restructure error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Process top-up
app.post('/loans/topup', async (req, res) => {
    try {
        const { existingLoanId, requestedAmount, productCode, settlementAmount, clientId, clientName, applicationNumber } = req.body;
        
        const topupData = {
            CheckNumber: clientId,
            FirstName: clientName?.split(' ')[0] || '',
            LastName: clientName?.split(' ')[1] || '',
            RequestedAmount: requestedAmount,
            ProductCode: productCode,
            ApplicationNumber: applicationNumber,
            LoanNumber: existingLoanId,
            SettlementAmount: settlementAmount
        };
        
        const result = await loanService.processLoanTopUp(topupData);
        
        res.json({ success: true, message: 'Top-up request sent', response: result });
    } catch (error) {
        logger.error('Top-up error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Initiate takeover
app.post('/loans/takeover', async (req, res) => {
    try {
        const { loanId, loanNumber, clientId, clientName, applicationNumber } = req.body;
        
        const takeoverData = {
            CheckNumber: clientId,
            FirstName: clientName?.split(' ')[0] || '',
            LastName: clientName?.split(' ')[1] || '',
            LoanNumber: loanNumber,
            ApplicationNumber: applicationNumber
        };
        
        const result = await loanService.processTakeoverBalance(takeoverData);
        
        res.json({ success: true, message: 'Takeover initiated', response: result });
    } catch (error) {
        logger.error('Takeover error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cancel loan
app.post('/loans/:id/cancel', async (req, res) => {
    try {
        const loanId = req.params.id;
        
        const result = await mifosxClient.rejectLoan(loanId, {
            rejectedOnDate: new Date().toISOString().split('T')[0],
            note: 'Loan cancelled via ESS portal'
        });
        
        res.json({ success: result.success, message: result.success ? 'Loan cancelled' : result.error });
    } catch (error) {
        logger.error('Cancel loan error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get loan transactions
app.get('/loans/:id/transactions', async (req, res) => {
    try {
        const loan = await mifosxClient.getLoanBalance(req.params.id);
        
        if (!loan.success) {
            return res.status(404).json({ error: 'Loan not found' });
        }
        
        const transactions = loan.data.transactions?.map(t => ({
            id: t.id,
            date: t.date,
            type: t.type?.value,
            amount: t.amount,
            principalPortion: t.principalPortion,
            interestPortion: t.interestPortion,
            feePortion: t.feePortion
        })) || [];
        
        res.json(transactions);
    } catch (error) {
        logger.error('Error fetching transactions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Download loan statement
app.get('/loans/:id/statement', async (req, res) => {
    try {
        const loan = await mifosxClient.getLoan(req.params.id);
        
        if (!loan.success) {
            return res.status(404).json({ error: 'Loan not found' });
        }
        
        // Generate PDF statement (simplified - returns JSON for now)
        const statement = {
            loanNumber: loan.data.accountNo,
            clientName: loan.data.clientName,
            principal: loan.data.principal,
            disbursementDate: loan.data.timeline?.actualDisbursementDate,
            maturityDate: loan.data.timeline?.expectedMaturityDate,
            outstandingBalance: loan.data.summary?.totalOutstanding,
            transactions: loan.data.transactions
        };
        
        res.json(statement);
    } catch (error) {
        logger.error('Error generating statement:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function
function getPaymentTypeId(method) {
    const types = {
        'SALARY_DEDUCTION': 1,
        'BANK_TRANSFER': 2,
        'MNO': 3,
        'CASH': 4
    };
    return types[method] || 1;
}
initializeDatabase();
// Initialize database and start server
async function startServer() {
    await initializeDatabase();
    
    const PORT = config.port;
    const server = app.listen(PORT, () => {
        logger.info(`e-MKOPO FSP Bridge Server running on port ${PORT}`);
        logger.info(`FSP Code: ${config.fspCode}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`MifosX API: ${config.mifosx.baseUrl}`);
        logger.info(`ESS Notification URL: ${config.essNotificationUrl}`);
        if (config.security.disableSignatureValidation) {
            logger.warn('⚠️  SIGNATURE VALIDATION DISABLED - For development/testing only!');
        }
        console.log(`Server is running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health (POST)`);
        console.log(`Log viewer: http://localhost:${PORT}/logs`);
    }).on('error', (err) => {
        console.error('Server failed to start:', err);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        server.close(async () => {
            if (db) await db.close();
            logger.info('Server closed');
            process.exit(0);
        });
    });

    process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception:', error);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection:', { reason, promise });
    });
}

// Start the server
//startServer();

module.exports = { ess_router:app, }//mifosxClient, signatureService, loanService, db, logTransaction, updateLogStatus };
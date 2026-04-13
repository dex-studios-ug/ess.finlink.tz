const express = require('express');
const axios = require('axios');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const atm_router = express.Router();

// Create HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// MifosX configuration
const MIFOS_BASE_URL = process.env.MIFOS_BASE_URL || "https://localhost/fineract-provider/api/v1";
const MIFOS_TENANT = process.env.MIFOS_TENANT || "default";
const MIFOS_ADMIN_AUTH = process.env.MIFOS_ADMIN_AUTH || "TGVvbjpLYWl0ZXNp";
const PRESHARED_ATM_API_KEY = process.env.ATM_API_KEY || "s";

// ==================== MIFOS CLIENT ====================
class MifosClient {
    static async getSavingsAccountByPan(db, pan) {
        try {
            // Get savings account ID from PAN mapping
            const row = await db.get(
                'SELECT savings_account_id, account_name FROM atm_pan_mappings WHERE pan = ? AND is_active = 1',
                [pan]
            );
            
            if (!row) {
                console.error(`No PAN mapping found for: ${pan}`);
                return null;
            }
            
            const savingsId = row.savings_account_id;
            const accountName = row.account_name;
            
            // Fetch account from MifosX
            const response = await axios.get(
                `${MIFOS_BASE_URL}/savingsaccounts/${savingsId}`,
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_ADMIN_AUTH}`
                    },
                    httpsAgent: httpsAgent
                }
            );
            
            if (response.status === 200) {
                const accountData = response.data;
                return {
                    savings_id: savingsId,
                    account_no: savingsId,
                    account_name: accountName,
                    account_balance: parseFloat(accountData.accountBalance || 0),
                    available_balance: parseFloat(accountData.availableBalance || 0),
                    status: accountData.status?.value || "UNKNOWN",
                    product_name: accountData.productName || ""
                };
            } else {
                console.error(`MifosX API error: ${response.status}`);
                return null;
            }
        } catch (error) {
            console.error(`Error fetching account from MifosX: ${error.message}`);
            return null;
        }
    }
    
    static async authorizeWithdrawal(db, pan, amount) {
        const account = await this.getSavingsAccountByPan(db, pan);
        
        if (!account) {
            return { authorized: false, message: "Account not found", availableBalance: 0, ledgerBalance: 0 };
        }
        
        if (account.status !== "Active") {
            return { 
                authorized: false, 
                message: "Account inactive", 
                availableBalance: account.available_balance, 
                ledgerBalance: account.account_balance 
            };
        }
        
        if (account.available_balance < amount) {
            return { 
                authorized: false, 
                message: "Insufficient funds", 
                availableBalance: account.available_balance, 
                ledgerBalance: account.account_balance 
            };
        }
        
        // Check if it's AMANA account
        if (!account.product_name.toUpperCase().includes("AMANA")) {
            return { 
                authorized: false, 
                message: "Not an AMANA account", 
                availableBalance: account.available_balance, 
                ledgerBalance: account.account_balance 
            };
        }
        
        return { 
            authorized: true, 
            message: "Success", 
            availableBalance: account.available_balance - amount, 
            ledgerBalance: account.account_balance - amount,
            account: account
        };
    }
    
    static async logWithdrawal(savingsId, amount, reference) {
        try {
            const response = await axios.post(
                `${MIFOS_BASE_URL}/savingsaccounts/${savingsId}/transactions?command=withdrawal`,
                {
                    transactionDate: new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
                    voucherNumber: reference,
                    transactionAmount: amount,
                    paymentTypeId: 4,
                    locale: "en",
                    dateFormat: "dd MMMM yyyy",
                    paymentDescription: `ATM Withdrawal - ${reference}`
                },
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_ADMIN_AUTH}`,
                        "Content-Type": "application/json"
                    },
                    httpsAgent: httpsAgent
                }
            );
            
            if (response.status === 200) {
                return { success: true, fineractId: response.data.resourceId };
            } else {
                console.error(`Withdrawal failed in MifosX: ${response.status}`);
                return { success: false, fineractId: null };
            }
        } catch (error) {
            console.error(`Error logging withdrawal in MifosX: ${error.message}`);
            return { success: false, fineractId: null };
        }
    }
    
    static async logReversal(savingsId, fineractId, reference) {
        try {
            const response = await axios.post(
                `${MIFOS_BASE_URL}/savingsaccounts/${savingsId}/transactions/${fineractId}?command=undo`,
                {
                    transactionDate: new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
                    transactionAmount: 0,
                    locale: "en",
                    dateFormat: "dd MMMM yyyy"
                },
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_ADMIN_AUTH}`,
                        "Content-Type": "application/json"
                    },
                    httpsAgent: httpsAgent
                }
            );
            
            if (response.status === 200) {
                console.log(`Reversal successful for ${reference}`);
                return { success: true, fineractId: response.data.resourceId };
            } else {
                console.error(`Reversal failed in MifosX: ${response.status}`);
                return { success: false, fineractId: null };
            }
        } catch (error) {
            console.error(`Error logging reversal in MifosX: ${error.message}`);
            return { success: false, fineractId: null };
        }
    }
}

// ==================== MIDDLEWARE ====================

// CORS middleware
atm_router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).json({ success: true, message: "CORS preflight" });
    }
    next();
});

// Verify terminal API key middleware
function verifyTerminalApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== PRESHARED_ATM_API_KEY) {
        return res.status(401).json({
            error: "Invalid API key",
            message: "Unauthorized"
        });
    }
    next();
}

// JSON middleware
atm_router.use(express.json());

// ==================== LOGGING HELPER ====================
async function logATMTransaction(db, data) {
    try {
        const result = await db.run(
            `INSERT INTO atm_logs (
                reference, pan, account_no, terminal, transaction_type, amount, charge,
                currency, settlement_account, response_code, response_message,
                available_balance_after, ledger_balance_after, fineract_id,
                savings_id, request_payload, response_payload, error_message,
                response_time, ip_address, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.reference, data.pan, data.account_no, data.terminal,
                data.transaction_type, data.amount, data.charge || 0,
                data.currency || 'TZS', data.settlement_account,
                data.response_code, data.response_message,
                data.available_balance_after, data.ledger_balance_after,
                data.fineract_id || -1, data.savings_id,
                data.request_payload ? JSON.stringify(data.request_payload) : null,
                data.response_payload ? JSON.stringify(data.response_payload) : null,
                data.error_message, data.response_time, data.ip_address,
                data.status || 'PROCESSING'
            ]
        );
        return result.lastID;
    } catch (error) {
        console.error('Error logging transaction:', error);
        throw error;
    }
}

async function updateATMTransaction(db, reference, data) {
    try {
        const updates = [];
        const values = [];
        
        if (data.response_code !== undefined) {
            updates.push('response_code = ?');
            values.push(data.response_code);
        }
        if (data.response_message !== undefined) {
            updates.push('response_message = ?');
            values.push(data.response_message);
        }
        if (data.fineract_id !== undefined) {
            updates.push('fineract_id = ?');
            values.push(data.fineract_id);
        }
        if (data.status !== undefined) {
            updates.push('status = ?');
            values.push(data.status);
        }
        if (data.is_reversed !== undefined) {
            updates.push('is_reversed = ?');
            values.push(data.is_reversed ? 1 : 0);
        }
        if (data.reversal_reference !== undefined) {
            updates.push('reversal_reference = ?');
            values.push(data.reversal_reference);
        }
        if (data.reversal_fineract_id !== undefined) {
            updates.push('reversal_fineract_id = ?');
            values.push(data.reversal_fineract_id);
        }
        if (data.error_message !== undefined) {
            updates.push('error_message = ?');
            values.push(data.error_message);
        }
        
        if (updates.length === 0) return;
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(reference);
        
        await db.run(
            `UPDATE atm_logs SET ${updates.join(', ')} WHERE reference = ?`,
            values
        );
    } catch (error) {
        console.error('Error updating transaction:', error);
        throw error;
    }
}

// ==================== INITIALIZE DATABASE TABLES ====================
async function initTables(db) {
    try {
        // Create atm_logs table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS atm_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT UNIQUE NOT NULL,
                pan TEXT NOT NULL,
                account_no TEXT NOT NULL,
                terminal TEXT,
                transaction_type TEXT NOT NULL,
                amount INTEGER,
                charge INTEGER,
                currency TEXT DEFAULT 'TZS',
                settlement_account TEXT,
                response_code TEXT NOT NULL,
                response_message TEXT,
                available_balance_after INTEGER,
                ledger_balance_after INTEGER,
                fineract_id INTEGER DEFAULT -1,
                reversal_fineract_id INTEGER DEFAULT -1,
                savings_id INTEGER,
                is_reversed INTEGER DEFAULT 0,
                reversal_reference TEXT,
                request_payload TEXT,
                response_payload TEXT,
                error_message TEXT,
                response_time INTEGER,
                ip_address TEXT,
                status TEXT DEFAULT 'PROCESSING',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for atm_logs
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_atm_logs_reference ON atm_logs(reference);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_pan ON atm_logs(pan);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_account_no ON atm_logs(account_no);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_transaction_type ON atm_logs(transaction_type);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_response_code ON atm_logs(response_code);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_created_at ON atm_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_status ON atm_logs(status);
            CREATE INDEX IF NOT EXISTS idx_atm_logs_is_reversed ON atm_logs(is_reversed)
        `);

        // Create atm_pan_mappings table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS atm_pan_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pan TEXT NOT NULL UNIQUE,
                savings_account_id INTEGER NOT NULL,
                account_name TEXT,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for atm_pan_mappings
        await db.exec(`
            CREATE INDEX IF NOT EXISTS idx_atm_pan_mappings_pan ON atm_pan_mappings(pan);
            CREATE INDEX IF NOT EXISTS idx_atm_pan_mappings_savings_account_id ON atm_pan_mappings(savings_account_id);
            CREATE INDEX IF NOT EXISTS idx_atm_pan_mappings_is_active ON atm_pan_mappings(is_active)
        `);

        console.log('Database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing database tables:', error);
        throw error;
    }
}

// ==================== ATM TRANSACTION ENDPOINTS ====================

// ATM Withdrawal
atm_router.post('/api/atm/withdraw', verifyTerminalApiKey, async (req, res) => {
    const startTime = Date.now();
    const request = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const db = req.app.locals.db;
    
    console.log(`Withdrawal request: ${request.reference} - ${request.amount}`);
    
    try {
        // Check for duplicate transaction
        const existing = await db.get(
            'SELECT id, status FROM atm_logs WHERE reference = ?',
            [request.reference]
        );
        
        if (existing) {
            await logATMTransaction(db, {
                ...request,
                transaction_type: 'WITHDRAWAL',
                response_code: "99",
                response_message: "Duplicate transaction",
                request_payload: request,
                response_time: Date.now() - startTime,
                ip_address: ipAddress,
                status: 'FAILED'
            });
            
            return res.json({
                reference: request.reference,
                responseCode: "99",
                message: "Duplicate transaction"
            });
        }
        
        // Authorize with MifosX
        const authorization = await MifosClient.authorizeWithdrawal(
            db,
            request.pan, 
            parseFloat(request.amount)
        );
        
        if (!authorization.authorized) {
            await logATMTransaction(db, {
                ...request,
                transaction_type: 'WITHDRAWAL',
                response_code: "99",
                response_message: authorization.message,
                request_payload: request,
                response_time: Date.now() - startTime,
                ip_address: ipAddress,
                status: 'FAILED'
            });
            
            return res.json({
                reference: request.reference,
                responseCode: "99",
                message: authorization.message
            });
        }
        
        // Get account details for savings_id
        const account = authorization.account;
        if (!account) {
            await logATMTransaction(db, {
                ...request,
                transaction_type: 'WITHDRAWAL',
                response_code: "99",
                response_message: "Account details not found",
                request_payload: request,
                response_time: Date.now() - startTime,
                ip_address: ipAddress,
                status: 'FAILED'
            });
            
            return res.json({
                reference: request.reference,
                responseCode: "99",
                message: "Account details not found"
            });
        }
        
        // Log withdrawal in MifosX
        const withdrawalResult = await MifosClient.logWithdrawal(
            account.savings_id, 
            parseFloat(request.amount), 
            request.reference
        );
        
        const responseData = {
            reference: request.reference,
            responseCode: withdrawalResult.success ? "0" : "99",
            message: withdrawalResult.success ? "Success" : "Transaction processing failed",
            availableBalance: authorization.availableBalance,
            ledgerBalance: authorization.ledgerBalance
        };
        
        // Record transaction in database
        await logATMTransaction(db, {
            ...request,
            transaction_type: 'WITHDRAWAL',
            amount: request.amount,
            charge: request.charge || 0,
            settlement_account: request.settlementAccount,
            response_code: withdrawalResult.success ? "0" : "99",
            response_message: withdrawalResult.success ? "Success" : "Failed to log in MifosX",
            available_balance_after: authorization.availableBalance,
            ledger_balance_after: authorization.ledgerBalance,
            fineract_id: withdrawalResult.fineractId || -1,
            savings_id: account.savings_id,
            request_payload: request,
            response_payload: responseData,
            response_time: Date.now() - startTime,
            ip_address: ipAddress,
            status: withdrawalResult.success ? 'SUCCESS' : 'FAILED'
        });
        
        res.json(responseData);
        
    } catch (error) {
        console.error(`Error processing withdrawal: ${error.message}`);
        
        await logATMTransaction(db, {
            ...req.body,
            transaction_type: 'WITHDRAWAL',
            response_code: "96",
            response_message: "System error",
            request_payload: req.body,
            error_message: error.message,
            response_time: Date.now() - startTime,
            ip_address: ipAddress,
            status: 'FAILED'
        });
        
        res.status(500).json({
            reference: req.body.reference,
            responseCode: "96",
            message: "System error"
        });
    }
});

// ATM Balance Inquiry
atm_router.post('/api/atm/balance', verifyTerminalApiKey, async (req, res) => {
    const startTime = Date.now();
    const request = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const db = req.app.locals.db;
    
    console.log(`Balance inquiry: ${request.reference}`);
    
    try {
        // Get account details from MifosX
        const account = await MifosClient.getSavingsAccountByPan(db, request.pan);
        
        if (!account) {
            await logATMTransaction(db, {
                ...request,
                transaction_type: 'BALANCE_INQUIRY',
                response_code: "99",
                response_message: "Account not found",
                request_payload: request,
                response_time: Date.now() - startTime,
                ip_address: ipAddress,
                status: 'FAILED'
            });
            
            return res.json({
                reference: request.reference,
                responseCode: "99",
                message: "Account not found"
            });
        }
        
        const responseData = {
            reference: request.reference,
            responseCode: "0",
            message: "Success",
            availableBalance: account.available_balance,
            ledgerBalance: account.account_balance
        };
        
        // Record inquiry
        await logATMTransaction(db, {
            ...request,
            transaction_type: 'BALANCE_INQUIRY',
            response_code: "0",
            response_message: "Success",
            available_balance_after: account.available_balance,
            ledger_balance_after: account.account_balance,
            savings_id: account.savings_id,
            request_payload: request,
            response_payload: responseData,
            response_time: Date.now() - startTime,
            ip_address: ipAddress,
            status: 'SUCCESS'
        });
        
        res.json(responseData);
        
    } catch (error) {
        console.error(`Error processing balance inquiry: ${error.message}`);
        
        await logATMTransaction(db, {
            ...req.body,
            transaction_type: 'BALANCE_INQUIRY',
            response_code: "96",
            response_message: "System error",
            request_payload: req.body,
            error_message: error.message,
            response_time: Date.now() - startTime,
            ip_address: ipAddress,
            status: 'FAILED'
        });
        
        res.status(500).json({
            reference: req.body.reference,
            responseCode: "96",
            message: "System error"
        });
    }
});

// ==================== LOGS MANAGEMENT ENDPOINTS ====================

// Get all logs with pagination and filters
atm_router.post('/logs', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        const {
            page = 1,
            limit = 20,
            search,
            transaction_type,
            response_code,
            status,
            is_reversed,
            date_from,
            date_to,
            pan,
            account_no,
            reference
        } = req.body;
        
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM atm_logs WHERE 1=1';
        const params = [];
        
        if (search) {
            query += ' AND (reference LIKE ? OR pan LIKE ? OR account_no LIKE ? OR response_message LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        if (reference) {
            query += ' AND reference = ?';
            params.push(reference);
        }
        if (transaction_type) {
            query += ' AND transaction_type = ?';
            params.push(transaction_type);
        }
        if (response_code) {
            query += ' AND response_code = ?';
            params.push(response_code);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (is_reversed !== undefined && is_reversed !== '') {
            query += ' AND is_reversed = ?';
            params.push(is_reversed === 'true' || is_reversed === true ? 1 : 0);
        }
        if (pan) {
            query += ' AND pan = ?';
            params.push(pan);
        }
        if (account_no) {
            query += ' AND account_no = ?';
            params.push(account_no);
        }
        if (date_from) {
            query += ' AND DATE(created_at) >= ?';
            params.push(date_from);
        }
        if (date_to) {
            query += ' AND DATE(created_at) <= ?';
            params.push(date_to);
        }
        
        // Get total count
        const countQuery = query.replace('*', 'COUNT(*) as total');
        const countResult = await db.get(countQuery, params);
        const total = countResult ? countResult.total : 0;
        
        // Get paginated results
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const rows = await db.all(query, params);
        
        res.json({
            success: true,
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error(`Error fetching logs: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single log by ID
atm_router.get('/logs/:id', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        
        const row = await db.get(
            'SELECT * FROM atm_logs WHERE id = ?',
            [id]
        );
        
        if (!row) {
            return res.status(404).json({ success: false, error: "Log not found" });
        }
        
        res.json({ success: true, data: row });
    } catch (error) {
        console.error(`Error fetching log: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get log by reference
atm_router.get('/logs/reference/:reference', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { reference } = req.params;
        
        const row = await db.get(
            'SELECT * FROM atm_logs WHERE reference = ?',
            [reference]
        );
        
        if (!row) {
            return res.status(404).json({ success: false, error: "Log not found" });
        }
        
        res.json({ success: true, data: row });
    } catch (error) {
        console.error(`Error fetching log: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get statistics
atm_router.post('/logs/stats', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { date_from, date_to } = req.body;
        
        let dateFilter = '';
        const params = [];
        
        if (date_from && date_to) {
            dateFilter = ' AND DATE(created_at) BETWEEN ? AND ?';
            params.push(date_from, date_to);
        } else if (date_from) {
            dateFilter = ' AND DATE(created_at) >= ?';
            params.push(date_from);
        } else if (date_to) {
            dateFilter = ' AND DATE(created_at) <= ?';
            params.push(date_to);
        }
        
        const total = await db.get(
            `SELECT COUNT(*) as total FROM atm_logs WHERE 1=1 ${dateFilter}`,
            params
        );
        
        const successful = await db.get(
            `SELECT COUNT(*) as successful FROM atm_logs WHERE response_code = '0' ${dateFilter}`,
            params
        );
        
        const failed = await db.get(
            `SELECT COUNT(*) as failed FROM atm_logs WHERE response_code != '0' ${dateFilter}`,
            params
        );
        
        const withdrawals = await db.get(
            `SELECT COUNT(*) as withdrawals, SUM(amount) as total_amount 
             FROM atm_logs WHERE transaction_type = 'WITHDRAWAL' AND response_code = '0' ${dateFilter}`,
            params
        );
        
        const balanceInquiries = await db.get(
            `SELECT COUNT(*) as balance_inquiries FROM atm_logs WHERE transaction_type = 'BALANCE_INQUIRY' ${dateFilter}`,
            params
        );
        
        const reversed = await db.get(
            `SELECT COUNT(*) as reversed FROM atm_logs WHERE is_reversed = 1 ${dateFilter}`,
            params
        );
        
        const byStatus = await db.all(
            `SELECT status, COUNT(*) as count FROM atm_logs WHERE 1=1 ${dateFilter} GROUP BY status`,
            params
        );
        
        const today = await db.get(
            'SELECT COUNT(*) as today FROM atm_logs WHERE DATE(created_at) = DATE("now")'
        );
        
        res.json({
            success: true,
            data: {
                total: total?.total || 0,
                successful: successful?.successful || 0,
                failed: failed?.failed || 0,
                withdrawals: withdrawals?.withdrawals || 0,
                totalAmount: withdrawals?.total_amount || 0,
                balanceInquiries: balanceInquiries?.balance_inquiries || 0,
                reversed: reversed?.reversed || 0,
                today: today?.today || 0,
                byStatus: byStatus || []
            }
        });
    } catch (error) {
        console.error(`Error getting stats: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reverse transaction
atm_router.post('/logs/reverse', verifyTerminalApiKey, async (req, res) => {
    const { reference, reason } = req.body;
    const db = req.app.locals.db;
    
    try {
        if (!reference) {
            return res.status(400).json({ success: false, error: "Reference is required" });
        }
        
        // Get transaction
        const transaction = await db.get(
            'SELECT * FROM atm_logs WHERE reference = ? AND is_reversed = 0',
            [reference]
        );
        
        if (!transaction) {
            return res.status(404).json({ success: false, error: "Transaction not found or already reversed" });
        }
        
        // Reverse in MifosX
        const reversalResult = await MifosClient.logReversal(
            transaction.savings_id,
            transaction.fineract_id,
            reference
        );
        
        if (reversalResult.success) {
            const reversalReference = `REV_${reference}_${Date.now()}`;
            await db.run(
                `UPDATE atm_logs 
                 SET is_reversed = 1, 
                     reversal_reference = ?,
                     reversal_fineract_id = ?,
                     status = 'REVERSED',
                     response_message = response_message || ' - Reversed: ' || ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE reference = ?`,
                [reversalReference, reversalResult.fineractId, reason || 'No reason provided', reference]
            );
            
            res.json({
                success: true,
                message: "Transaction reversed successfully",
                reversalReference: reversalReference
            });
        } else {
            res.status(500).json({ success: false, error: "Failed to reverse transaction in MifosX" });
        }
    } catch (error) {
        console.error(`Error reversing transaction: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete log
atm_router.delete('/logs/:id', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        
        const result = await db.run(
            'DELETE FROM atm_logs WHERE id = ?',
            [id]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: "Log not found" });
        }
        
        res.json({ success: true, message: "Log deleted successfully" });
    } catch (error) {
        console.error(`Error deleting log: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk delete logs
atm_router.post('/logs/bulk-delete', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: "Invalid ids array" });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        const result = await db.run(
            `DELETE FROM atm_logs WHERE id IN (${placeholders})`,
            ids
        );
        
        res.json({ 
            success: true, 
            message: `${result.changes} logs deleted successfully` 
        });
    } catch (error) {
        console.error(`Error bulk deleting logs: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export logs to CSV
atm_router.post('/logs/export', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const {
            search,
            transaction_type,
            response_code,
            status,
            date_from,
            date_to
        } = req.body;
        
        let query = 'SELECT * FROM atm_logs WHERE 1=1';
        const params = [];
        
        if (search) {
            query += ' AND (reference LIKE ? OR pan LIKE ? OR account_no LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }
        if (transaction_type) {
            query += ' AND transaction_type = ?';
            params.push(transaction_type);
        }
        if (response_code) {
            query += ' AND response_code = ?';
            params.push(response_code);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (date_from) {
            query += ' AND DATE(created_at) >= ?';
            params.push(date_from);
        }
        if (date_to) {
            query += ' AND DATE(created_at) <= ?';
            params.push(date_to);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const rows = await db.all(query, params);
        
        // Convert to CSV
        let csv = 'ID,Reference,PAN,Account No,Terminal,Transaction Type,Amount,Charge,Currency,Settlement Account,Response Code,Response Message,Available Balance,Ledger Balance,Fineract ID,Is Reversed,Status,Created At\n';
        
        for (const row of rows) {
            csv += `${row.id},${row.reference},${row.pan},${row.account_no},${row.terminal || ''},${row.transaction_type},${row.amount || 0},${row.charge || 0},${row.currency},${row.settlement_account || ''},${row.response_code},${(row.response_message || '').replace(/,/g, ';')},${row.available_balance_after || 0},${row.ledger_balance_after || 0},${row.fineract_id},${row.is_reversed ? 'Yes' : 'No'},${row.status},${row.created_at}\n`;
        }
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=atm_logs_${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error(`Error exporting logs: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
atm_router.get('/health', async (req, res) => {
    try {
        const db = req.app.locals.db;
        // Check database connection
        await db.get('SELECT 1');
        
        res.json({
            status: "healthy",
            service: "ATM-MifosX Integration",
            timestamp: new Date().toISOString(),
            database: "connected"
        });
    } catch (error) {
        res.status(500).json({
            status: "unhealthy",
            service: "ATM-MifosX Integration",
            error: error.message
        });
    }
});

// PAN Mapping Management
atm_router.post('/pan-mappings', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { pan, savings_account_id, account_name } = req.body;
        
        if (!pan || !savings_account_id) {
            return res.status(400).json({ success: false, error: "PAN and savings_account_id are required" });
        }
        
        // Check if exists
        const existing = await db.get(
            'SELECT id FROM atm_pan_mappings WHERE pan = ?',
            [pan]
        );
        
        if (existing) {
            await db.run(
                'UPDATE atm_pan_mappings SET savings_account_id = ?, account_name = ?, updated_at = CURRENT_TIMESTAMP WHERE pan = ?',
                [savings_account_id, account_name || null, pan]
            );
        } else {
            await db.run(
                'INSERT INTO atm_pan_mappings (pan, savings_account_id, account_name) VALUES (?, ?, ?)',
                [pan, savings_account_id, account_name || null]
            );
        }
        
        res.json({ success: true, message: "PAN mapping saved successfully" });
    } catch (error) {
        console.error(`Error saving PAN mapping: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

atm_router.get('/pan-mappings', verifyTerminalApiKey, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const rows = await db.all(
            'SELECT * FROM atm_pan_mappings ORDER BY created_at DESC'
        );
        
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(`Error fetching PAN mappings: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Initialize tables middleware (run once on startup)
atm_router.use(async (req, res, next) => {
    if (!req.app.locals.tablesInitialized) {
        try {
            const db = req.app.locals.db;
            await initTables(db);
            req.app.locals.tablesInitialized = true;
        } catch (error) {
            console.error('Failed to initialize tables:', error);
        }
    }
    next();
});

module.exports = { atm_router };
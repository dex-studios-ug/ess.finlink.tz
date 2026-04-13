const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Import OTP router
const { otp_router } = require('./otp'); // Adjust path as needed



// Fineract configuration
const MIFOSADMIN = "Basic YXR1OnBhc3N3b3Jk";
const FINERACT_API_BASE = "https://localhost/fineract-provider/api/v1";

// ClickPesa configuration
const CLICKPESA_API_KEY = "SKyn2i5AHM1oqswKL8vS9gFdSJgwS61t0rVb5M2cH4";
const CLICKPESA_CLIENT_ID = "IDhPGYfPFq4kPGZXtuqPCunjn7zmoL98";
const TOKEN_URL = "https://api.clickpesa.com/third-parties/generate-token";

let tokenData = {
    access_token: null,
    expires_at: null
};

let banksList = [];
let withdrawAttempts = new Map();
let withdrawTotals = new Map();
let currentDay = new Date().toDateString();

// Helper functions
function normalizeMobileNumber(rawNumber) {
    const digits = rawNumber.replace(/\D/g, '');
    if (digits.startsWith("0")) {
        return "255" + digits.substring(1);
    } else if (digits.startsWith("255")) {
        return digits;
    } else if (digits.startsWith("7") && digits.length === 9) {
        return "255" + digits;
    } else {
        throw new Error(`Unrecognized format: ${rawNumber}`);
    }
}

function extractMobileNumber(text) {
    const pattern = /(?:\+?255|0)?\d{9}/;
    const match = text.match(pattern);
    return match ? match[0] : null;
}

async function getValidToken() {
    const now = new Date();
    if (tokenData.access_token && new Date(tokenData.expires_at) > now) {
        return tokenData.access_token;
    }

    try {
        const response = await axios.post(TOKEN_URL, {}, {
            headers: {
                "api-key": CLICKPESA_API_KEY,
                "client-id": CLICKPESA_CLIENT_ID
            },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        tokenData.access_token = response.data.token;
        tokenData.expires_at = new Date(now.getTime() + 3600000);
        return tokenData.access_token;
    } catch (error) {
        throw new Error("Failed to authenticate with ClickPesa");
    }
}

function validateWithdrawLimits(clientId, amount) {
    const today = new Date().toDateString();
    if (currentDay !== today) {
        withdrawAttempts.clear();
        withdrawTotals.clear();
        currentDay = today;
    }

    const totalWithdrawn = withdrawTotals.get(clientId) || 0;
    const attempts = withdrawAttempts.get(clientId) || 0;

    if (totalWithdrawn + amount > 1000000) {
        throw new Error("maximum daily withdrawable amount exceeded");
    }
    if (attempts + 1 > 5) {
        throw new Error("maximum daily withdraw attempts exceeded");
    }
}

// Fineract reconciliation functions
async function logFineractDeposit(tx,db){
    try {
        const response = await axios.post(
            `${FINERACT_API_BASE}/savingsaccounts/${tx.savingsId}/transactions?command=deposit`,
            {
                transactionDate: new Date(tx.createdDate).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
                voucherNumber: tx.orderReference,
                transactionAmount: tx.amount,
                paymentTypeId: 4,
                locale: "en",
                dateFormat: "dd MMMM yyyy",
                paymentDescription: tx.remark || ""
            },
            {
                headers: {
                    "Authorization": MIFOSADMIN,
                    "Fineract-Platform-TenantId": "default",
                    "Content-Type": "application/json"
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        if (response.status === 200) {
            await db.run(
                "UPDATE CPTransaction SET fineract_id = ? WHERE id = ?",
                [response.data.resourceId, tx.id]
            );
            console.log('Transaction deposited in fineract');
            return true;
        }
    } catch (error) {
        console.error('Failed to log deposit in fineract:', error.message);
        throw new Error("Could not log transaction into fineract");
    }
}

async function logFineractWithdraw(tx,db){
    try {
        const response = await axios.post(
            `${FINERACT_API_BASE}/savingsaccounts/${tx.savingsId}/transactions?command=withdrawal`,
            {
                transactionDate: new Date(tx.createdDate).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
                voucherNumber: tx.orderReference,
                transactionAmount: tx.amount,
                paymentTypeId: 4,
                locale: "en",
                dateFormat: "dd MMMM yyyy",
                paymentDescription: tx.remark || ""
            },
            {
                headers: {
                    "Authorization": MIFOSADMIN,
                    "Fineract-Platform-TenantId": "default",
                    "Content-Type": "application/json"
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        if (response.status === 200) {
            await db.run(
                "UPDATE CPTransaction SET fineract_id = ? WHERE id = ?",
                [response.data.resourceId, tx.id]
            );
            console.log('Transaction withdrawn in fineract');
            return true;
        }
    } catch (error) {
        console.error('Failed to log withdraw in fineract:', error.message);
        throw new Error("Could not log transaction into fineract");
    }
}

async function logFineractReversal(tx,db){
    if (tx.fineract_id === -1) return;

    try {
        const response = await axios.post(
            `${FINERACT_API_BASE}/savingsaccounts/${tx.savingsId}/transactions/${tx.fineract_id}?command=undo`,
            {
                transactionDate: new Date(tx.createdDate).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
                transactionAmount: 0,
                locale: "en",
                dateFormat: "dd MMMM yyyy"
            },
            {
                headers: {
                    "Authorization": MIFOSADMIN,
                    "Fineract-Platform-TenantId": "default",
                    "Content-Type": "application/json"
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        if (response.status === 200) {
            await db.run(
                "UPDATE CPTransaction SET is_reversed = 1 WHERE id = ?",
                [tx.id]
            );
            console.log('Transaction reversed in fineract');
            return true;
        }
    } catch (error) {
        console.error('Failed to log reversal in fineract:', error.message);
        throw new Error("Could not log reversal transaction into fineract");
    }
}

// Authentication middleware
function authenticate() {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ detail: "Authorization header missing" });
        }
        next();
    };
}




// Routes
router.get("/bankslist", async (req, res) => { const db = req.app.locals.db;
    try {
        if (banksList.length > 0) {
            return res.json(banksList);
        }
        const token = await getValidToken();
        const response = await axios.get("https://api.clickpesa.com/third-parties/list/banks", {
            headers: { "Authorization": token, "Content-Type": "application/json" },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        if (response.status === 200) {
            banksList = response.data;
            return res.json(banksList);
        }
        return res.json({});
    } catch (error) {
        return res.status(500).json({ detail: error.message });
    }
});

// Client search by external ID
router.get("/clientsbyextid", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const { externalId } = req.query;
        
        if (!externalId) {
            return res.status(400).json({ detail: "externalId parameter required" });
        }

       
        
        const response = await axios.get(
            `${FINERACT_API_BASE}/clients`,
            {
                params: { externalId: `%${externalId}%` },
                headers: {
                    "Authorization": MIFOSADMIN,
                    "Fineract-Platform-TenantId": "default",
                    "Content-Type": "application/json"
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );
        
        if (response.status === 200 && response.data.pageItems) {
            return res.json({ pageItems: response.data.pageItems });
        }
        
        return res.json({ pageItems: [] });
    } catch (error) {
        console.error('Error searching clients:', error.message);
        return res.json({ pageItems: [] });
    }
});

// Get client contacts using OTP mobile number
router.get("/clientcontacts", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const { clientId, userId } = req.query;
        
        if (!clientId) {
            return res.status(400).json({ detail: "clientId parameter required" });
        }

        // First try to get mobile from OTP system
        let mobileNo = null;
        if (userId) {
            const userMobile = await db.get(
                'SELECT mobile_no FROM user_mobile_no WHERE user_id = ?',
                [userId]
            );
            if (userMobile && userMobile.mobile_no) {
                mobileNo = userMobile.mobile_no;
            }
        }
        
        // If not found in OTP system, fetch from Fineract
        if (!mobileNo) {
            const response = await axios.get(
                `${FINERACT_API_BASE}/clients/${clientId}?fields=mobileNo,accountNo`,
                {
                    headers: {
                        "Authorization": MIFOSADMIN,
                        "Fineract-Platform-TenantId": "default"
                    },
                    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
                }
            );
            
            const accounts = response.data || {};
            if (accounts.mobileNo) {
                mobileNo = accounts.mobileNo;
            }
        }
        
        const result = {};
        
        if (mobileNo) {
            const raw = extractMobileNumber(mobileNo);
            if (raw) {
                result.phoneNo = normalizeMobileNumber(raw);
            } else {
                return res.status(417).json({ detail: "No valid number found." });
            }
        } else {
            return res.status(417).json({ detail: "No valid number found." });
        }
        
        return res.json(result);
    } catch (error) {
        console.error('Error fetching client contacts:', error.message);
        return res.status(417).json({ detail: "Client has no registered mobile Number" });
    }
});

// Create guarantor OTP using OTP router
router.get("/creategcode", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const { gclientId, type, userId } = req.query;
        
        if (!gclientId) {
            return res.status(400).json({ detail: "gclientId parameter required" });
        }
        
        // Get client contact info
        let phoneNo = null;
        
        // First check OTP system for mobile number
        if (userId) {
            const userMobile = await db.get(
                'SELECT mobile_no FROM user_mobile_no WHERE user_id = ?',
                [userId]
            );
            if (userMobile && userMobile.mobile_no) {
                phoneNo = userMobile.mobile_no;
            }
        }
        
        // If not found, fetch from Fineract
        if (!phoneNo) {
            const contactResponse = await axios.get(
                `${FINERACT_API_BASE}/clients/${gclientId}?fields=mobileNo`,
                {
                    headers: {
                        "Authorization": MIFOSADMIN,
                        "Fineract-Platform-TenantId": "default"
                    },
                    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
                }
            );
            
            const clientData = contactResponse.data || {};
            if (clientData.mobileNo) {
                phoneNo = clientData.mobileNo;
            }
        }
        
        if (!phoneNo) {
            return res.status(417).json({ detail: "Could not find Guarantor's Phone Number" });
        }
        
        const raw = extractMobileNumber(phoneNo);
        if (!raw) {
            return res.status(417).json({ detail: "Could not find Guarantor's Phone Number" });
        }
        
        const formattedPhone = normalizeMobileNumber(raw);
        
        // Store the phone number in OTP system if userId provided
        if (userId) {
            const existing = await db.get(
                'SELECT id FROM user_mobile_no WHERE user_id = ?',
                [userId]
            );
            if (existing) {
                await db.run(
                    'UPDATE user_mobile_no SET mobile_no = ? WHERE user_id = ?',
                    [formattedPhone, userId]
                );
            } else {
                await db.run(
                    'INSERT INTO user_mobile_no (user_id, mobile_no) VALUES (?, ?)',
                    [userId, formattedPhone]
                );
            }
        }
        
        // Use OTP router to send OTP
        const otpResponse = await axios.get(
            `http://localhost:${process.env.PORT || 3000}/api/otp/sendotp?phone=${encodeURIComponent(formattedPhone)}`,
            {
                headers: req.headers
            }
        );
        
        if (otpResponse.data && otpResponse.data.status === 'S') {
            let authMessage = null;
            if (type === 'guarantor') {
                authMessage = "Dear customer, please share this code with the requester to guarantee their loan.";
            } else if (type === 'withdraw') {
                authMessage = "Dear customer, please use this code to authorize your withdrawal.";
            }
            
            return res.json({
                success: true,
                verification_id: otpResponse.data.verification_id,
                message: authMessage,
                phone: formattedPhone
            });
        }
        
        return res.status(500).json({ detail: "Failed to send OTP" });
    } catch (error) {
        console.error('Error creating OTP:', error.message);
        return res.status(417).json({ detail: error.message });
    }
});

// Verify guarantor OTP using OTP router
router.get("/verifygcode", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const { code, vid, userId } = req.query;
        
        if (!code || !vid) {
            return res.status(400).json({ detail: "code and vid parameters required" });
        }
        
        // Use OTP router to verify OTP
        const verifyResponse = await axios.get(
            `http://localhost:${process.env.PORT || 3000}/api/otp/verifyotp?code=${code}&vid=${vid}`,
            {
                headers: req.headers
            }
        );
        
        if (verifyResponse.data && verifyResponse.data.status === 'S') {
            return res.json({ 
                success: true, 
                message: "OTP verified successfully" 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                detail: "Invalid OTP code" 
            });
        }
    } catch (error) {
        console.error('Error verifying OTP:', error.message);
        return res.status(400).json({ detail: error.message });
    }
});

// Create guarantor
router.post("/createguarantor", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const payload = req.body;
        const { loanId } = payload;
        
        if (!loanId) {
            return res.status(400).json({ detail: "loanId is required" });
        }
        
        delete payload.loanId;
        
        const response = await axios.post(
            `${FINERACT_API_BASE}/loans/${loanId}/guarantors`,
            payload,
            {
                headers: {
                    "Authorization": MIFOSADMIN,
                    "Fineract-Platform-TenantId": "default",
                    "Content-Type": "application/json"
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );
        
        if (response.status !== 200) {
            return res.status(417).json({ detail: "Failed to create Guarantor in System." });
        }
        
        return res.json(response.data);
    } catch (error) {
        console.error('Error creating guarantor:', error.message);
        return res.status(417).json({ detail: "Failed to create Guarantor in System." });
    }
});

// Deposit endpoint with OTP verification
router.post("/deposit", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const withdraw = req.body;
        withdraw.type = "DEPOSIT";
        withdraw.orderReference = uuidv4().replace(/[^a-zA-Z0-9]/g, '');

        if (!withdraw.clientId) {
            return res.status(417).json({ detail: "ClientID not found." });
        }
        if (!withdraw.savingsId) {
            return res.status(417).json({ detail: "SavingsId not found." });
        }

        // Get mobile number from OTP system if userId provided
        if (withdraw.userId) {
            const userMobile = await db.get(
                'SELECT mobile_no FROM user_mobile_no WHERE user_id = ?',
                [withdraw.userId]
            );
            if (userMobile && userMobile.mobile_no) {
                withdraw.phoneNo = userMobile.mobile_no;
            }
        }

        let raw = extractMobileNumber(withdraw.phoneNo || '');
        if (raw) {
            withdraw.phoneNo = normalizeMobileNumber(raw);
        } else {
            withdraw.phoneNo = null;
        }

        if (!withdraw.phoneNo) {
            return res.status(417).json({ detail: "Invalid phoneNo" });
        }

        // Check for pending transaction
        const pending = await db.get(
            "SELECT * FROM CPTransaction WHERE clientId = ? AND status = 'PENDING'",
            [withdraw.clientId]
        );
        if (pending) {
            return res.status(417).json({ detail: "Client has a PENDING transaction. Try again later." });
        }

        const token = await getValidToken();
        const headers = { "Authorization": token, "Content-Type": "application/json" };
        
        const payoutPayload = {
            amount: withdraw.amount,
            phoneNumber: withdraw.phoneNo,
            currency: withdraw.currency,
            orderReference: withdraw.orderReference
        };

        // Preview deposit
        const previewResp = await axios.post(
            "https://api.clickpesa.com/third-parties/payments/preview-ussd-push-request",
            payoutPayload,
            { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );

        if (previewResp.status !== 200) {
            return res.status(previewResp.status).json({ detail: "Deposit preview failed" });
        }

        // Initiate deposit
        const createResp = await axios.post(
            "https://api.clickpesa.com/third-parties/payments/initiate-ussd-push-request",
            payoutPayload,
            { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
        );

        if (createResp.status === 200) {
            const result = await db.run(
                `INSERT INTO CPTransaction (
                    clientId, savingsId, amount, phoneNo, currency, method, 
                    bankName, bic, accountNo, type, remark, orderReference, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    withdraw.clientId, withdraw.savingsId, withdraw.amount, withdraw.phoneNo,
                    withdraw.currency, withdraw.method || '', withdraw.bankName || '',
                    withdraw.bic || '', withdraw.accountNo || '', withdraw.type,
                    withdraw.remark || '', withdraw.orderReference, 'PROCESSING'
                ]
            );
            
            const tx = await db.get("SELECT * FROM CPTransaction WHERE id = ?", [result.lastID]);
            return res.json(tx,db);
        }

        return res.json({ status: 'error', message: "Transaction failed" });
    } catch (error) {
        console.error('Deposit error:', error.message);
        return res.status(500).json({ detail: error.message });
    }
});

// Withdraw endpoint with OTP verification
router.post("/withdraw", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const withdraw = req.body;
        withdraw.type = "WITHDRAW";

        if (!withdraw.clientId) {
            return res.status(417).json({ detail: "ClientID not found." });
        }

        validateWithdrawLimits(withdraw.clientId, withdraw.amount || 0);
        withdraw.orderReference = uuidv4().replace(/[^a-zA-Z0-9]/g, '');

        // Check for pending transaction
        const pending = await db.get(
            "SELECT * FROM CPTransaction WHERE clientId = ? AND status = 'PENDING'",
            [withdraw.clientId]
        );
        if (pending) {
            return res.status(417).json({ detail: "Client has a PENDING transaction. Try again later." });
        }

        // Check account balance from fineract
        const accountResponse = await axios.get(
            `${FINERACT_API_BASE}/self/clients/${withdraw.clientId}/accounts`,
            {
                headers: {
                    "Fineract-Platform-TenantId": "default",
                    "Authorization": req.headers.authorization
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        if (accountResponse.status !== 200) {
            return res.status(417).json({ detail: "Error fetching account details" });
        }

        const accounts = accountResponse.data;
        const validAccount = accounts.savingsAccounts?.find(a => 
            a.accountBalance >= withdraw.amount && a.productName === "AMANA WALLET"
        );

        if (!validAccount) {
            return res.status(417).json({ detail: "Not enough money on your account. Create a 'click pesa' account" });
        }

        withdraw.savingsId = validAccount.id;

        // Get client mobile number from OTP system or Fineract
        let mobileNo = null;
        if (withdraw.userId) {
            const userMobile = await db.get(
                'SELECT mobile_no FROM user_mobile_no WHERE user_id = ?',
                [withdraw.userId]
            );
            if (userMobile && userMobile.mobile_no) {
                mobileNo = userMobile.mobile_no;
            }
        }

        if (!mobileNo) {
            const clientResponse = await axios.get(
                `${FINERACT_API_BASE}/self/clients/${withdraw.clientId}?fields=mobileNo`,
                {
                    headers: {
                        "Fineract-Platform-TenantId": "default",
                        "Authorization": req.headers.authorization
                    },
                    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
                }
            );

            if (clientResponse.status !== 200 || !clientResponse.data.mobileNo) {
                return res.status(417).json({ detail: "Client has no registered mobile Number" });
            }
            mobileNo = clientResponse.data.mobileNo;
        }

        const raw = extractMobileNumber(mobileNo);
        if (!raw) {
            return res.status(417).json({ detail: "No valid number found." });
        }
        withdraw.phoneNo = normalizeMobileNumber(raw);

        const token = await getValidToken();
        const headers = { "Authorization": token, "Content-Type": "application/json" };
        
        let payoutPayload = {
            amount: withdraw.amount,
            currency: withdraw.currency,
            orderReference: withdraw.orderReference
        };

        let isBank = withdraw.method === "Bank";
        let initSuccess = false;

        if (isBank) {
            payoutPayload.bic = withdraw.bic;
            payoutPayload.accountNumber = withdraw.accountNo;
            payoutPayload.transferType = 'ACH';
            
            const previewResp = await axios.post(
                "https://api.clickpesa.com/third-parties/payouts/preview-bank-payout",
                payoutPayload,
                { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
            );
            
            if (previewResp.status === 200) {
                const createResp = await axios.post(
                    "https://api.clickpesa.com/third-parties/payouts/create-bank-payout",
                    payoutPayload,
                    { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
                );
                initSuccess = createResp.status === 200;
            }
        } else {
            payoutPayload.phoneNumber = withdraw.phoneNo;
            
            const previewResp = await axios.post(
                "https://api.clickpesa.com/third-parties/payouts/preview-mobile-money-payout",
                payoutPayload,
                { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
            );
            
            if (previewResp.status === 200) {
                const createResp = await axios.post(
                    "https://api.clickpesa.com/third-parties/payouts/create-mobile-money-payout",
                    payoutPayload,
                    { headers, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
                );
                initSuccess = createResp.status === 200;
            }
        }

        if (initSuccess) {
            withdrawAttempts.set(withdraw.clientId, (withdrawAttempts.get(withdraw.clientId) || 0) + 1);
            withdrawTotals.set(withdraw.clientId, (withdrawTotals.get(withdraw.clientId) || 0) + withdraw.amount);
            
            const result = await db.run(
                `INSERT INTO CPTransaction (
                    clientId, savingsId, amount, phoneNo, currency, method, 
                    bankName, bic, accountNo, type, remark, orderReference, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    withdraw.clientId, withdraw.savingsId, withdraw.amount, withdraw.phoneNo,
                    withdraw.currency, withdraw.method || '', withdraw.bankName || '',
                    withdraw.bic || '', withdraw.accountNo || '', withdraw.type,
                    withdraw.remark || '', withdraw.orderReference, 'PROCESSING'
                ]
            );
            
            const tx = await db.get("SELECT * FROM CPTransaction WHERE id = ?", [result.lastID]);
            return res.json({
                status: "success",
                message: "Transaction created and payout initiated",
                result: tx
            });
        }

        return res.json({
            status: 'error',
            message: "Transaction failed",
            result: null
        });
    } catch (error) {
        console.error('Withdraw error:', error.message);
        return res.status(500).json({ detail: error.message });
    }
});

// Webhook endpoint
router.post("/webhook", async (req, res) => { const db = req.app.locals.db;
    const data = req.body;
    const allowedHost = "clickpesa.com";
    
    if (req.hostname !== allowedHost) {
        return res.status(403).json({ detail: "Forbidden: Not from allowed host" });
    }

    try {
        const tx = await db.get(
            "SELECT * FROM CPTransaction WHERE orderReference = ?",
            [data.orderReference]
        );

        if (tx && data.status && data.status !== "PENDING" && tx.status !== data.status) {
            await db.run(
                "UPDATE CPTransaction SET status = ?, updatedDate = CURRENT_TIMESTAMP WHERE id = ?",
                [data.status, tx.id]
            );
            
            if (["SETTLED", "SUCCESS", "AUTHORIZED"].includes(data.status)) {
                if (tx.type === "WITHDRAW") {
                    await logFineractWithdraw(tx,db);
                } else if (tx.type === "DEPOSIT") {
                    await logFineractDeposit(tx,db);
                }
            } else if (["REVERSED", "REFUNDED", "FAILED"].includes(data.status)) {
                await logFineractReversal(tx,db);
            }
        }
        
        return res.json({});
    } catch (error) {
        console.error('Webhook error:', error.message);
        return res.json({});
    }
});

// Get user mobile number endpoint
router.get("/getusermobile", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({ detail: "userId parameter required" });
        }
        
        const userMobile = await db.get(
            'SELECT mobile_no FROM user_mobile_no WHERE user_id = ?',
            [userId]
        );
        
        if (userMobile && userMobile.mobile_no) {
            return res.json({
                success: true,
                userId: userId,
                mobileNo: userMobile.mobile_no
            });
        } else {
            return res.status(404).json({
                success: false,
                detail: "Mobile number not found for user"
            });
        }
    } catch (error) {
        console.error('Error getting user mobile:', error.message);
        return res.status(500).json({ detail: error.message });
    }
});

// Set user mobile number endpoint
router.post("/setusermobile", authenticate(), async (req, res) => { const db = req.app.locals.db;
    try {
        const { userId, mobileNo } = req.body;
        
        if (!userId || !mobileNo) {
            return res.status(400).json({ detail: "userId and mobileNo are required" });
        }
        
        const formattedMobile = normalizeMobileNumber(extractMobileNumber(mobileNo) || mobileNo);
        
        const existing = await db.get(
            'SELECT id FROM user_mobile_no WHERE user_id = ?',
            [userId]
        );
        
        if (existing) {
            await db.run(
                'UPDATE user_mobile_no SET mobile_no = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
                [formattedMobile, userId]
            );
        } else {
            await db.run(
                'INSERT INTO user_mobile_no (user_id, mobile_no) VALUES (?, ?)',
                [userId, formattedMobile]
            );
        }
        
        return res.json({
            success: true,
            userId: userId,
            mobileNo: formattedMobile
        });
    } catch (error) {
        console.error('Error setting user mobile:', error.message);
        return res.status(500).json({ detail: error.message });
    }
});

// Background watcher function
async function watchTransactionStatus() {
    while (true) {
        try {
            const pendingTransactions = await db.all(
                "SELECT * FROM CPTransaction WHERE status IN ('PENDING', 'PROCESSING')"
            );

            if (pendingTransactions.length > 0) {
                const token = await getValidToken();
                
                for (const tx of pendingTransactions) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    try {
                        const endpoint = tx.type === 'WITHDRAW' ? 'payouts' : 'payments';
                        const response = await axios.get(
                            `https://api.clickpesa.com/third-parties/${endpoint}/${tx.orderReference}`,
                            { 
                                headers: { "Authorization": token, "Content-Type": "application/json" },
                                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
                            }
                        );

                        if (response.status === 200) {
                            const status = response.data[0]?.status;
                            if (status && status !== "PENDING" && status !== "PROCESSING" && tx.status !== status) {
                                await db.run(
                                    "UPDATE CPTransaction SET status = ?, updatedDate = CURRENT_TIMESTAMP WHERE id = ?",
                                    [status, tx.id]
                                );
                                
                                if (["SETTLED", "SUCCESS", "AUTHORIZED"].includes(status)) {
                                    if (tx.type === "WITHDRAW") {
                                        await logFineractWithdraw(tx,db);
                                    } else if (tx.type === "DEPOSIT") {
                                        await logFineractDeposit(tx,db);
                                    }
                                } else if (["REVERSED", "REFUNDED", "FAILED"].includes(status)) {
                                    await logFineractReversal(tx,db);
                                }
                                
                                console.log(`Transaction ${tx.orderReference} updated to ${status}`);
                            }
                        } else if (response.status === 400) {
                            const message = response.data.message || "Error";
                            await db.run(
                                "UPDATE CPTransaction SET status = 'ERROR', remark = ?, updatedDate = CURRENT_TIMESTAMP WHERE id = ?",
                                [message, tx.id]
                            );
                        }
                    } catch (error) {
                        console.log(`Failed to fetch status for ${tx.orderReference}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.log(`[watch_transaction_status] Error: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

//  and start watcher

   // watchTransactionStatus();


module.exports = {selfservice_router:router};
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
    static async getSavingsAccountByPan( pan) {
        try {
            // Get savings account ID from PAN mapping
              const row = await axios.get(
                `${MIFOS_BASE_URL}/runreports/get_savings_acc_by_pan?R_pan=`+pan,
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_ADMIN_AUTH}`
                    },
                    httpsAgent: httpsAgent
                }
            );
            
            if (!row||!row.data||!row.data.length) {
                console.error(`No PAN mapping found for: ${pan}`);
                return null;
            }
            
            const savingsId = row.data[0].savings_account_id;
            const accountName = null;
            
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
        const account = await this.getSavingsAccountByPan( pan);
        
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
    
    if (0 && !apiKey || apiKey !== PRESHARED_ATM_API_KEY) {
        return res.status(401).json({
            error: "Invalid API key",
            message: "Unauthorized"
        });
    }
    next();
}


// ==================== ATM TRANSACTION ENDPOINTS ====================

// ATM Withdrawal
atm_router.post('/api/atm/withdraw', verifyTerminalApiKey, async (req, res) => {
    const request = req.body;
    console.log(`Withdrawal request: ${request.reference} - ${request.amount}`);
    
    try {
       
            //check duplicate transaction
            var isduplicate =false;
            if(isduplicate)return res.json({
                reference: request.reference,
                responseCode: "99",
                message: "Duplicate transaction"
            });
        
        
        // Authorize with MifosX
        const authorization = await MifosClient.authorizeWithdrawal(
            db,
            request.pan, 
            parseFloat(request.amount)
        );
        
        if (!authorization.authorized) { 
            return res.json({
                reference: request.reference,
                responseCode: "99",
                message: authorization.message
            });
        }
        
        // Get account details for savings_id
        const account = authorization.account;
        if (!account) {
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
        
       
        
        res.json(responseData);
        
    } catch (error) {
        console.error(`Error processing withdrawal: ${error.message}`);
        
        res.status(500).json({
            reference: req.body.reference,
            responseCode: "96",
            message: "System error"
        });
    }
});

// ATM Balance Inquiry
atm_router.post('/api/atm/balance', verifyTerminalApiKey, async (req, res) => {
    
    const request = req.body;
    
    
    console.log(`Balance inquiry: ${request.reference}`);
    
    try {
        // Get account details from MifosX
        const account = await MifosClient.getSavingsAccountByPan(db, request.pan);
        
        if (!account) {
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
        res.json(responseData);
        
    } catch (error) {
        console.error(`Error processing balance inquiry: ${error.message}`);
        
        res.status(500).json({
            reference: req.body.reference,
            responseCode: "96",
            message: "System error"
        });
    }
});



module.exports = { atm_router };
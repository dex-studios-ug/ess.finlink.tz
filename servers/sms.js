

const express = require('express');
const router = express.Router();

/**
 * GET /sms
 * Equivalent to: /dexstudios/messages
 * Query params:
 *  - limit
 *  - status (Pending | Delivered)
 */

router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.db;

        let { limit, status } = req.query;

        limit = parseInt(limit) || 25;

        let query = `
            SELECT id, receiver, message, status, created_at
            FROM sms_logs
        `;

        const params = [];

        if (status) {
            query += ` WHERE status = ?`;
            params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const [rows] = await db.get(query, params);

        return res.json(rows || []);
    } catch (error) {
        console.error('SMS FETCH ERROR:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch SMS logs'
        });
    }
});


/**
 * GET /sms/volume
 * KPI + volume tracking (used in stats modal)
 */
router.get('/addvolume', async (req, res) => {
    try {
        const {volume} = req.query;
        const db = req.app.locals.db;
        req.app.locals.sms_volume+=parseInt(volume||0);
        await db.run('update settings set sms_volume = ? where id = 1',[volume]);
        
        res.json({
            status:'success',
            sms_volume:req.app.locals.sms_volume
        })
    }catch(err){
        res.status(500).json({
            status:'failure',
            message:err
        })

    }});

router.get('/volume', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const sms_volume = req.app.locals.sms_volume;

        // Total remaining volume (you can adapt source table)
        const volumeRow = await db.get(`
            SELECT sms_volume FROM settings LIMIT 1
        `);

        // Sent today
        const sentTodayRow = await db.get(`
            SELECT COUNT(*) as count
            FROM sms_logs
            WHERE status = 'Delivered'
            AND DATE(created_at) = DATE()
        `);

        // Delivery rate
        const totalRow = await db.get(`
            SELECT COUNT(*) as total FROM sms_logs
        `);

        const deliveredRow = await db.get(`
            SELECT COUNT(*) as delivered
            FROM sms_logs
            WHERE status = 'Delivered'
        `);

        const total = totalRow.total || 0;
        const delivered = deliveredRow.delivered || 0;

        const deliveryRate = total > 0
            ? ((delivered / total) * 100).toFixed(2)
            : 0;
            if(sms_volume < (volumeRow?.sms_volume||0)){
                await db.run('update settings set sms_volume = ? where id = 1',[sms_volume])
            }

        return res.json({
            sms_volume:sms_volume || volumeRow?.sms_volume || 0,
            sent_today: sentTodayRow.count || 0,
            deliverrate: deliveryRate
        });

    } catch (error) {
        console.error('SMS KPI ERROR:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load SMS KPIs'
        });
    }
});

const axios = require('axios');
const https = require('https');
const { type } = require('os');
const { text } = require('stream/consumers');


// Configuration
const MIFOS_BASE_URL = "https://localhost/fineract-provider/api/v1";
const MIFOS_TENANT = "default";
const MIFOS_AUTH_TOKEN = "bWlmb3M6cGFzc3dvcmQ="; // Base64 encoded username:password
const SMS_API_URL = "https://api.tanzaniasms.com/api/SendSMS";
const SMS_API_KEY = "MjrkD1gP6h";
const SMS_API_PASS = "API66934032826";
const SMS_SENDER_ID = "TPSSACCOS";
const SMS_PARAMS = {
    api_id: SMS_API_KEY,
    api_password: SMS_API_PASS,
    sms_type: "T",
    encoding: "T",
    sender_id: SMS_SENDER_ID,
    uid:null,
    textmessage:null,
    phonenumber:null,
    callback_url:"https://ess-backend.onrender.com/api/sms/callback"
};
/* <Parameter name="sprintSmsApiPass" value="MjrkD1gP6h"
         override="false"/>
         <Parameter name="sprintSmsApiKey" value="API66934032826"
         override="false"/>
         Sprint_SMS_API_3.0
7
1.2 Calling The API
1.2.1 Method-1: Using Get Request
Example:
http://YOUR_API_URL/api/SendSMS?api_id=API4623444906&api_password=password@123
&sms_type=P&encoding=T&sender_id=ASMSC&phonenumber=91999020323&textmessage=te
st&uid=xyz&callback_url=https://xyz.com
*/
// Create HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

// SMS Templates for different events
class SMSTemplates {
    // Loan Templates
    static loanRepayment(clientName, loanAccountNo, amount = 0, balance = 0, date = "") {
        return `Dear ${clientName},

Your loan repayment of TZS ${amount} for account ${loanAccountNo} has been received successfully.

New outstanding balance: TZS ${balance}
Date: ${date}

Thank you for your payment.`.trim();
    }

    static loanDisbursement(clientName, loanAccountNo, amount, date = "") {
        return `Dear ${clientName},

Your loan of TZS ${amount} for account ${loanAccountNo} has been disbursed successfully.

The funds have been transferred to your account.
Date: ${date}

Please ensure timely repayments.`.trim();
    }

    static loanApproval(clientName, loanAccountNo, amount) {
        return `Dear ${clientName},

Congratulations! Your loan application ${loanAccountNo} for TZS ${amount} has been approved.

The loan will be disbursed shortly. You will receive another SMS once funds are transferred.`.trim();
    }

    static loanRejection(clientName, loanAccountNo) {
        return `Dear ${clientName},

We regret to inform you that your loan application ${loanAccountNo} has not been approved at this time.

Please contact our branch for more information.`.trim();
    }

    // Savings Templates
    static savingsDeposit(clientName, savingsAccountNo, amount = 0, balance = 0, date = "") {
        return `Dear ${clientName},

Your deposit of TZS ${amount} to savings account ${savingsAccountNo} has been processed successfully.

New balance: TZS ${balance}
Date: ${date}

Thank you for saving with us.`.trim();
    }

    static savingsWithdrawal(clientName, savingsAccountNo, amount = 0, balance = 0, date = "") {
        return `Dear ${clientName},

Your withdrawal of TZS ${amount} from savings account ${savingsAccountNo} has been processed successfully.

Remaining balance: TZS ${balance}
Date: ${date}

Thank you for banking with us.`.trim();
    }

    static savingsActivation(clientName, savingsAccountNo) {
        return `Dear ${clientName},

Your savings account ${savingsAccountNo} has been activated successfully.

You can now start making deposits and withdrawals.
Welcome to our banking family!`.trim();
    }

    static accountCreation(clientName, accountNo, accountType) {
        return `Dear ${clientName},

Your ${accountType} account ${accountNo} has been created successfully.

Welcome to our banking services. Your account is now active.`.trim();
    }

    static accountClosure(clientName, accountNo, accountType) {
        return `Dear ${clientName},

Your ${accountType} account ${accountNo} has been closed successfully.

We thank you for banking with us. Please visit any branch if you need assistance.`.trim();
    }
}

// Mifos Client for API calls
class MifosClient {
    static async getClientInfo(clientId) {
        try {
            const response = await axios.get(
                `${MIFOS_BASE_URL}/clients/${clientId}`,
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_AUTH_TOKEN}`
                    },
                    httpsAgent: httpsAgent
                }
            );

            if (response.status === 200) {
                const clientData = response.data;
                return {
                    id: clientId,
                    accountNo: clientData.accountNo,
                    fullName: clientData.displayName,
                    firstName: clientData.firstname,
                    lastName: clientData.lastname,
                    mobileNo: clientData.mobileNo,
                    email: clientData.emailAddress,
                    status: clientData.status?.value || "UNKNOWN"
                };
            }
            return null;
        } catch (error) {
            console.error(`Error getting client info: ${error.message}`);
            return null;
        }
    }

    static async getLoanInfo(loanId) {
        try {
            const response = await axios.get(
                `${MIFOS_BASE_URL}/loans/${loanId}`,
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_AUTH_TOKEN}`
                    },
                    httpsAgent: httpsAgent
                }
            );

            if (response.status === 200) {
                const loanData = response.data;
                return {
                    id: loanId,
                    accountNo: loanData.accountNo,
                    productName: loanData.productName,
                    loanAmount: loanData.principal,
                    outstandingBalance: loanData.summary?.totalOutstanding || 0,
                    status: loanData.status?.value || "UNKNOWN"
                };
            }
            return null;
        } catch (error) {
            console.error(`Error getting loan info: ${error.message}`);
            return null;
        }
    }

    static async getSavingsInfo(savingsId) {
        try {
            const response = await axios.get(
                `${MIFOS_BASE_URL}/savingsaccounts/${savingsId}`,
                {
                    headers: {
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": `Basic ${MIFOS_AUTH_TOKEN}`
                    },
                    httpsAgent: httpsAgent
                }
            );

            if (response.status === 200) {
                const savingsData = response.data;
                return {
                    id: savingsId,
                    accountNo: savingsData.accountNo,
                    productName: savingsData.productName,
                    accountBalance: savingsData.accountBalance,
                    availableBalance: savingsData.availableBalance,
                    status: savingsData.status?.value || "UNKNOWN"
                };
            }
            return null;
        } catch (error) {
            console.error(`Error getting savings info: ${error.message}`);
            return null;
        }
    }
}

// SMS Client for sending messages
class SMSClient {
    static async sendSms(phoneNumber, message,locals) {
        try {
            locals.sms_volume --;
            // Remove any non-digit characters except +
            let cleanedPhone = phoneNumber.replace(/[^\d+]/g, '');
            
            // If no country code, assume Tanzania (+255)
            if (!cleanedPhone.startsWith('255') ) {
                if (cleanedPhone.startsWith('0')) {
                    cleanedPhone = '255' + cleanedPhone.substring(1);
                } else {
                    cleanedPhone = '255' + cleanedPhone;
                }
            }
            
            // Add + prefix if not present
            if (!cleanedPhone.startsWith('+')) {
              //  cleanedPhone = '+' + cleanedPhone;
            }

            console.log('Not implemented sprint sms api so we are returning sms.js line 354')
            return  {
                    success: true,
                    message: "SMS sent successfully",
                    recipient: cleanedPhone
                };;
                
                const prms ={...SMS_PARAMS,'phonenumber':cleanedPhone,'textmessage':message}

            // Send SMS via API
            const response = await axios.get(
                SMS_API_URL,
                {
                    params:prms,
                    httpsAgent: httpsAgent,
                    timeout: 30000
                }
            );
            console.info(`SMS sent to ${cleanedPhone}: ${message}`);

            if (response.status === 200 || response.status === 201) {
                console.log(`SMS sent successfully to ${cleanedPhone}`);
                return {
                    success: true,
                    message: "SMS sent successfully",
                    recipient: cleanedPhone
                };
            } else {
                console.error(`SMS API error: ${response.status} - ${JSON.stringify(response.data)}`);
                return {
                    success: false,
                    message: `SMS API error: ${response.status}`,
                    recipient: cleanedPhone
                };
            }

        } catch (error) {
            console.error(`Error sending SMS: ${error.message}`);
            return {
                success: false,
                message: error.message,
                recipient: phoneNumber
            };
        }
    }
}

// Helper function to prepare SMS data
async function prepareSmsData(entity, action, payload, clientInfo) {
    const entityUpper = entity.toUpperCase();
    const actionUpper = action.toUpperCase();
    const clientName = clientInfo.fullName || "Customer";
    
    // Default transaction date
    const transactionDate = payload.transactionDate || new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const smsData = {
        message: "",
        transactionDetails: {},
        type: `${entityUpper}_${actionUpper}`,
        entity: entityUpper,
        action: actionUpper
    };

    try {
        // Process Loan events
        if (entityUpper === "LOAN") {
            const loanId = payload.loanId || payload.resourceId;
            const loanInfo = loanId ? await MifosClient.getLoanInfo(loanId) : null;

            if (actionUpper === "REPAYMENT") {
                const amount = payload.amount || payload.transactionAmount || 0;
                const balance = loanInfo?.outstandingBalance || 0;
                const accountNo = loanInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.loanRepayment(
                    clientName, accountNo, amount, balance, transactionDate
                );
                smsData.transactionDetails = {
                    transaction_type: "LOAN_REPAYMENT",
                    account_number: accountNo,
                    amount: amount,
                    balance: balance,
                    date: transactionDate
                };
            } 
            else if (actionUpper === "DISBURSAL") {
                const amount = payload.amount || 0;
                const accountNo = loanInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.loanDisbursement(
                    clientName, accountNo, amount, transactionDate
                );
                smsData.transactionDetails = {
                    transaction_type: "LOAN_DISBURSEMENT",
                    account_number: accountNo,
                    amount: amount,
                    date: transactionDate
                };
            }
            else if (actionUpper === "APPROVAL") {
                const accountNo = loanInfo?.accountNo || "N/A";
                const amount = loanInfo?.loanAmount || 0;

                smsData.message = SMSTemplates.loanApproval(
                    clientName, accountNo, amount
                );
                smsData.transactionDetails = {
                    transaction_type: "LOAN_APPROVAL",
                    account_number: accountNo,
                    amount: amount
                };
            }
            else if (actionUpper === "REJECTION") {
                const accountNo = loanInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.loanRejection(
                    clientName, accountNo
                );
                smsData.transactionDetails = {
                    transaction_type: "LOAN_REJECTION",
                    account_number: accountNo
                };
            }
        }
        // Process Savings events
        else if (entityUpper === "SAVINGS") {
            const savingsId = payload.savingsId || payload.resourceId;
            const savingsInfo = savingsId ? await MifosClient.getSavingsInfo(savingsId) : null;

            if (actionUpper === "DEPOSIT") {
                const amount = payload.amount || payload.transactionAmount || 0;
                const balance = savingsInfo?.accountBalance || 0;
                const accountNo = savingsInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.savingsDeposit(
                    clientName, accountNo, amount, balance, transactionDate
                );
                smsData.transactionDetails = {
                    transaction_type: "SAVINGS_DEPOSIT",
                    account_number: accountNo,
                    amount: amount,
                    balance: balance,
                    date: transactionDate
                };
            }
            else if (actionUpper === "WITHDRAWAL") {
                const amount = payload.amount || payload.transactionAmount || 0;
                const balance = savingsInfo?.accountBalance || 0;
                const accountNo = savingsInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.savingsWithdrawal(
                    clientName, accountNo, amount, balance, transactionDate
                );
                smsData.transactionDetails = {
                    transaction_type: "SAVINGS_WITHDRAWAL",
                    account_number: accountNo,
                    amount: amount,
                    balance: balance,
                    date: transactionDate
                };
            }
            else if (actionUpper === "ACTIVATION") {
                const accountNo = savingsInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.savingsActivation(
                    clientName, accountNo
                );
                smsData.transactionDetails = {
                    transaction_type: "SAVINGS_ACTIVATION",
                    account_number: accountNo
                };
            }
            else if (actionUpper === "CREATION") {
                const accountNo = savingsInfo?.accountNo || "N/A";

                smsData.message = SMSTemplates.accountCreation(
                    clientName, accountNo, "savings"
                );
                smsData.transactionDetails = {
                    transaction_type: "ACCOUNT_CREATION",
                    account_number: accountNo,
                    account_type: "savings"
                };
            }
        }
        // Process Client events
        else if (entityUpper === "CLIENT") {
            if (actionUpper === "CREATION") {
                const accountNo = clientInfo.accountNo || "N/A";

                smsData.message = SMSTemplates.accountCreation(
                    clientName, accountNo, "client"
                );
                smsData.transactionDetails = {
                    transaction_type: "CLIENT_CREATION",
                    account_number: accountNo,
                    account_type: "client"
                };
            }
        }

        return smsData.message ? smsData : null;
    } catch (error) {
        console.error(`Error preparing SMS data: ${error.message}`);
        return null;
    }
}

// Main webhook endpoint
router.post('/callback',async (req ,res,next)=>{
    const db = req.app.locals.db;
    const uid=req.body.uid;
    try{
        if(uid&&(uid=parseInt(uid))){
            await db.run('update sms_logs set status = ? where id = ?',[req.body.DLRStatus||'Unknown',uid])
        }
        res.json({});
    }
    catch(err){
res.json({})
    }
});
router.post("/webhook", async (req, res) => {
    const timestamp = new Date().toISOString();
    const payload = req.body;
    
    // Get headers
    const tenantId = req.headers['fineract-platform-tenantid'] || req.headers['x-fineract-platform-tenantid'];
    const entity = req.headers['x-fineract-entity'];
    const action = req.headers['x-fineract-action'];

    // Log the incoming request
    console.log(`Webhook received - Tenant: ${tenantId}, Entity: ${entity}, Action: ${action}`);
    console.log(`Payload: ${JSON.stringify(payload)}`);

    try {
        // Validate required fields
        if (!payload.clientId) {
            return res.status(400).json({
                status: "error",
                message: "clientId is required in payload",
                timestamp: timestamp
            });
        }

        // Get client information
        const clientInfo = await MifosClient.getClientInfo(payload.clientId);
        
        if (!clientInfo) {
            return res.status(404).json({
                status: "error",
                message: `Client with ID ${payload.clientId} not found`,
                timestamp: timestamp
            });
        }

        // Prepare response
        const result = {
            status: "processing",
            client_id: payload.clientId,
            client_name: clientInfo.fullName,
            tenant: tenantId,
            entity: entity,
            action: action,
            timestamp: timestamp,
            sms_sent: false
        };

        // Process based on entity and action
        if (entity && action) {
            // Merge changes into payload if present
            if (payload.changes) {
                Object.assign(payload, payload.changes);
            }
            
            // Set amount from various possible fields
            if (!payload.amount) {
                payload.amount = payload.transactionAmount || 0;
            }

            // Prepare SMS data
            const smsData = await prepareSmsData(entity, action, payload, clientInfo)||{};
            let db = req.app.locals.db;
            if (smsData) {
                // Send SMS if phone number exists
                const phoneNumber  ='0753783823';//clientInfo.mobileNo;
                if(!smsData.message){
                    console.error('No SMS message generated for this event');
                    smsData.message = `Dear ${clientInfo.fullName}, an event of type ${smsData.type} occurred, but no message template is defined for this event.`;
                }
                if (phoneNumber) {
                    db.run(`INSERT INTO sms_logs (receiver, message, status,type,entity,action,client_id,client_name) VALUES (?, ?, ?,?,?,?,?,?)`, 
                        [phoneNumber, smsData.message, 'Pending',smsData.type,smsData.entity,smsData.action,result.client_id,result.client_name], 
                        function(err) {
                            if (err) {
                                console.error(`Error inserting SMS log: ${err.message}`);
                            }
                        });

                    const smsResponse = await SMSClient.sendSms(phoneNumber, smsData.message,req.app.locals);
                    result.sms_sent = smsResponse.success;
                    result.sms_response = smsResponse;
                    result.sms_message = smsData.message;
                } else {
                    result.sms_sent = false;
                    result.sms_response = { error: "No phone number found for client" };
                }
                
                // Add transaction details
                Object.assign(result, smsData.transactionDetails);
            }
        }

        return res.json(result);
        
    } catch (error) {
        console.error(`Error processing webhook: ${error.message}`);
        return res.status(500).json({
            status: "error",
            message: error.message,
            timestamp: timestamp
        });
    }
});

// Test endpoints
router.get("/test/client/:clientId", async (req, res) => {
    const { clientId } = req.params;
    
    const clientInfo = await MifosClient.getClientInfo(parseInt(clientId));
    
    if (clientInfo) {
        // Test SMS
        const phone = clientInfo.mobileNo;
        if (phone) {
            const message = `Test message for ${clientInfo.fullName}`;
            const smsResponse = await SMSClient.sendSms(phone, message,req.app.locals);
            return res.json({
                client_info: clientInfo,
                sms_test: smsResponse
            });
        } else {
            return res.json({
                client_info: clientInfo,
                sms_test: { error: "No phone number" }
            });
        }
    } else {
        return res.status(404).json({ error: "Client not found" });
    }
});

router.post("/test/webhook", async (req, res) => {
    const testPayload = {
        officeId: 187,
        clientId: 7,
        savingsId: 382,
        resourceId: 241,
        amount: 50000.00,
        transactionDate: new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' })
    };
    
    // Mock request to the webhook handler
    const mockReq = {
        body: testPayload,
        headers: {
            'fineract-platform-tenantid': 'demo',
            'x-fineract-entity': 'LOAN',
            'x-fineract-action': 'REPAYMENT'
        }
    };
    
    const mockRes = {
        json: (data) => data,
        status: (code) => ({ json: (data) => ({ ...data, statusCode: code }) })
    };
    
    const result = await new Promise((resolve) => {
        const response = {};
        mockRes.json = (data) => resolve(data);
        mockRes.status = (code) => ({
            json: (data) => resolve({ ...data, statusCode: code })
        });
        
        router.handle(mockReq, mockRes);
    });
    
    return res.json(result);
});
// Add to your existing router or create a new one

// GET /api/sms/logs - Get paginated SMS logs
router.get('/logs', async (req, res) => {
    const db= req.app.locals.db;
    try {
        const { page = 1, limit = 20, search, status, type, entity, dateFrom, dateTo } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM sms_logs WHERE 1=1';
        const params = [];
        
        if (search) {
            query += ' AND (receiver LIKE ? OR message LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }
        if (entity) {
            query += ' AND entity = ?';
            params.push(entity);
        }
        if (dateFrom) {
            query += ' AND DATE(created_at) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND DATE(created_at) <= ?';
            params.push(dateTo);
        }
        
        const countQuery = query.replace('*', 'COUNT(*) as total');
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
        res.status(500).json({ error: error.message });
    }
});

// POST /api/sms/resend/:id - Resend SMS
router.post('/resend/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const log = await db.get('SELECT * FROM sms_logs WHERE id = ?', [req.params.id]);
        if (!log) {
            return res.status(404).json({ error: 'SMS log not found' });
        }
        
        // Resend SMS logic here
        const smsResult = await SMSClient.sendSms(log.receiver, log.message,req.app.locals);
        
        if (smsResult.success) {
            /*await db.run(
                'UPDATE sms_logs SET status = ?, retry_count = COALESCE(retry_count, 0) + 1 WHERE id = ?',
                ['Pending', req.params.id]
            );*/
            res.json({ success: true, message: 'SMS resent successfully' });
        } else {
            res.json({ success: false, error: 'Failed to resend SMS' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/sms/logs/:id - Delete SMS log
router.delete('/logs/:id', async (req, res) => {
    const db = req.app.locals.db;
    try {
        await db.run('DELETE FROM sms_logs WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/sms/logs/bulk-delete - Bulk delete SMS logs
router.post('/logs/bulk-delete', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const { ids } = req.body;
        const placeholders = ids.map(() => '?').join(',');
        await db.run(`DELETE FROM sms_logs WHERE id IN (${placeholders})`, ids);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/sms/export - Export to CSV
router.get('/export', async (req, res) => {
    const db = req.app.locals.db;
    try {
        const { search, status, type, entity, dateFrom, dateTo } = req.query;
        let query = 'SELECT * FROM sms_logs WHERE 1=1';
        const params = [];
        
         if (search) {
            query += ' AND (receiver LIKE ? OR message LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }
        if (entity) {
            query += ' AND entity = ?';
            params.push(entity);
        }
        if (dateFrom) {
            query += ' AND DATE(created_at) >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ' AND DATE(created_at) <= ?';
            params.push(dateTo);
        }
        
        
        
        const logs = await db.all(query, params);
        
        // Convert to CSV
        const csv = convertToCSV(logs);
        
        res.header('Content-Type', 'text/csv');
        res.attachment('sms_logs.csv');
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
/**
 * Converts an array of objects (like sqlite db.all result) to CSV string
 * @param {Array<Object>} data - Array of objects from db.all()
 * @param {Array<string>} [columns] - Optional: specify order of columns
 * @returns {string} CSV string
 */
function convertToCSV(data, columns) {
  if (!Array.isArray(data) || data.length === 0) return '';

  // Use keys from the first object if columns not provided
  const keys = columns || Object.keys(data[0]);

  // Build header row
  const header = keys.join(',');

  // Build rows
  const rows = data.map(row =>
    keys
      .map(key => {
        let val = row[key] ?? '';
        // Escape double quotes and wrap in quotes if needed
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      })
      .join(',')
  );

  return [header, ...rows].join('\n');
}
module.exports = { sms_router: router };
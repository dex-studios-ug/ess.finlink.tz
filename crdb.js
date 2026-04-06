const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const sha1 = require('sha1');
const md5 = require('md5');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');


require('dotenv').config();
const app = express();
const PORT = process.env.CRDB_PORT;
console.log(PORT)

// Middleware
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Database setup
let db;

async function initializeDatabase() {
  db = await open({
    filename: path.join(__dirname, 'crdb_database.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    -- System settings table
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      crdb_token TEXT,
      token_expiry DATETIME,
      partner_id TEXT,
      partner_pass TEXT,
      base_url TEXT,
      updatedAt DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO system_settings (id) VALUES (1);

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      transaction_type TEXT NOT NULL,
      customer_mobile TEXT,
      customer_account TEXT,
      customer_name TEXT,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'TZS',
      payment_reference TEXT,
      payment_desc TEXT,
      status INTEGER,
      status_desc TEXT,
      txn_reference TEXT,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

    -- Account lookups table
    CREATE TABLE IF NOT EXISTS account_lookups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      customer_account TEXT,
      account_name TEXT,
      status INTEGER,
      status_desc TEXT,
      txn_reference TEXT,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- USSD requests table
    CREATE TABLE IF NOT EXISTS ussd_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      customer_mobile TEXT,
      amount REAL,
      account_code TEXT,
      payment_reference TEXT,
      status INTEGER,
      status_desc TEXT,
      txn_reference TEXT,
      transaction_date DATETIME,
      transaction_channel TEXT,
      customer_name TEXT,
      completed_at DATETIME,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Batches table
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      batch_code TEXT,
      batch_post_type TEXT,
      batch_approval TEXT,
      batch_account TEXT,
      batch_sender TEXT,
      batch_desc TEXT,
      batch_currency TEXT DEFAULT 'TZS',
      total_amount REAL,
      status INTEGER,
      status_desc TEXT,
      txn_reference TEXT,
      approval_status TEXT,
      approval_receipt TEXT,
      approved_by TEXT,
      approved_at DATETIME,
      completed_records INTEGER DEFAULT 0,
      failed_records INTEGER DEFAULT 0,
      completed_amount REAL DEFAULT 0,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );

    -- Batch records table
    CREATE TABLE IF NOT EXISTS batch_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      record_id TEXT UNIQUE NOT NULL,
      account TEXT,
      bic TEXT,
      name TEXT,
      reference TEXT,
      sec_reference TEXT,
      amount REAL,
      currency TEXT DEFAULT 'TZS',
      description TEXT,
      status TEXT,
      status_desc TEXT,
      txn_reference TEXT,
      completed_at DATETIME,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
    );

    -- Batch verifications table
    CREATE TABLE IF NOT EXISTS batch_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      payment_reference TEXT,
      customer_name TEXT,
      customer_account TEXT,
      total_amount REAL,
      no_txns INTEGER,
      payment_type TEXT,
      currency TEXT,
      status INTEGER,
      status_desc TEXT,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Batch records list table
    CREATE TABLE IF NOT EXISTS batch_records_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      payment_reference TEXT,
      amount REAL,
      reference TEXT,
      receiver_name TEXT,
      receiver_account TEXT,
      receiver_bic TEXT,
      charge TEXT,
      status TEXT,
      status_desc TEXT,
      partner_id TEXT,
      base_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- API logs table
    CREATE TABLE IF NOT EXISTS api_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT,
      method TEXT,
      request_body TEXT,
      response_body TEXT,
      status_code INTEGER,
      response_time INTEGER,
      partner_id TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_request_id ON transactions(request_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer_account ON transactions(customer_account);
    CREATE INDEX IF NOT EXISTS idx_ussd_requests_request_id ON ussd_requests(request_id);
    CREATE INDEX IF NOT EXISTS idx_batches_batch_id ON batches(batch_id);
    CREATE INDEX IF NOT EXISTS idx_batch_records_batch_id ON batch_records(batch_id);
    CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
  `);

  app.locals.db = db;
  console.log('Database initialized successfully');
}

// Helper function to generate UUID without dashes
function generateUUID() {
  return uuidv4().replace(/-/g, '');
}

// CRDB Controller
class CRDBController {
  createAxiosInstance(baseURL) {
    return axios.create({
      baseURL: baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getToken(db, partnerId, partnerPass, baseURL) {
    try {
      const REMOTE = this.createAxiosInstance(baseURL);
      const response = await REMOTE.post('/api/service/token', {
        password: partnerPass,
        partnerId: partnerId,
        code: 'SESSION'
      });
      
      if (response.status === 200 && response.data.status === 200) {
        const token = response.data.sessionToken;
        await db.run(`
          UPDATE system_settings 
          SET crdb_token = ?, 
              updatedAt = ?,
              token_expiry = datetime('now', '+1 hour'),
              partner_id = ?,
              partner_pass = ?,
              base_url = ?
          WHERE id = 1
        `, [token, new Date().toISOString(), partnerId, partnerPass, baseURL]);
        return token;
      }
      throw new Error('Failed to get token: ' + (response.data.statusDesc || 'Unknown error'));
    } catch (error) {
      console.error('Error getting token:', error.message);
      throw error;
    }
  }

  async ensureValidToken(db, partnerId, partnerPass, baseURL) {
    const row = await db.get(`
      SELECT crdb_token, token_expiry, partner_id, base_url 
      FROM system_settings 
      WHERE id = 1
    `);
    
    const configChanged = row && (row.partner_id !== partnerId || row.base_url !== baseURL);
    
    if (!row || !row.crdb_token || new Date(row.token_expiry) <= new Date() || configChanged) {
      return await this.getToken(db, partnerId, partnerPass, baseURL);
    }
    return row.crdb_token;
  }

  validateAmount(amount) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1000 || numAmount > 10000000000) {
      throw new Error("Invalid Amount. Amount must be between 1000 and 10,000,000,000 TZS");
    }
    return numAmount;
  }

  async logAPICall(db, endpoint, method, requestBody, responseBody, statusCode, responseTime, partnerId, ipAddress) {
    try {
      await db.run(`
        INSERT INTO api_logs (endpoint, method, request_body, response_body, status_code, response_time, partner_id, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [endpoint, method, JSON.stringify(requestBody), JSON.stringify(responseBody), statusCode, responseTime, partnerId, ipAddress]);
    } catch (error) {
      console.error('Error logging API call:', error.message);
    }
  }

  // CRDB01 - Push CRDB CASHIN (Single Disbursement)
  async disbursementSingle(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { 
        customerMobile, customerAccount, paymentReference, paymentDesc, amount,
        customerName, currency = 'TZS',
        partnerId, partnerPass, baseURL 
      } = req.body;
      
      // Validate required fields
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!customerMobile || !customerAccount || !amount || !customerName) {
        return res.status(400).json({ error: 'Missing required fields: customerMobile, customerAccount, amount, customerName' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      const requestId = `TXN${generateUUID()}`;
      const validatedAmount = this.validateAmount(amount);
      
      // Calculate checksum: SHA1(customerName + md5(requestID) + customerAccount + amount)
      const checksum = sha1(customerName + md5(requestId) + customerAccount + validatedAmount);
      
      const requestBody = {
        code: "CRDB01",
        sessionToken: token,
        partnerID: partnerId,
        checksum: checksum,
        requestID: requestId,
        customerMobile: customerMobile,
        currency: currency,
        customerAccount: customerAccount,
        customerName: customerName,
        paymentReference: paymentReference || requestId,
        paymentDesc: paymentDesc || `CRDB Disbursement to ${customerName}`,
        amount: validatedAmount
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Save transaction to database
      await db.run(`
        INSERT INTO transactions (
          request_id, transaction_type, customer_mobile, customer_account, customer_name,
          amount, currency, payment_reference, payment_desc, status, status_desc, txn_reference, 
          partner_id, base_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        requestId,
        'DISBURSEMENT',
        customerMobile,
        customerAccount,
        customerName,
        validatedAmount,
        currency,
        paymentReference || requestId,
        paymentDesc || `CRDB Disbursement to ${customerName}`,
        response.data.status,
        response.data.statusDesc,
        response.data.data?.txnReference || null,
        partnerId,
        baseURL
      ]);
      
      await this.logAPICall(db, '/api/crdb/disbursement', 'POST', requestBody, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Disbursement error:', error.message);
      next(error);
    }
  }

  // CRDB02 - Push CRDB TXN FETCH (Check Transaction Status)
  async checkCRDBtransactionStatus(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { requestID, customerAccount, partnerId, partnerPass, baseURL } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!requestID || !customerAccount) {
        return res.status(400).json({ error: 'Missing required parameters: requestID, customerAccount' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      
      // Calculate checksum: SHA1(customerAccount + md5(requestID))
      const checksum = sha1(customerAccount + md5(requestID));
      
      const requestBody = {
        code: "CRDB02",
        sessionToken: token,
        partnerID: partnerId,
        checksum: checksum,
        requestID: requestID,
        customerAccount: customerAccount
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Update transaction status in database
      await db.run(`
        UPDATE transactions 
        SET status = ?, 
            status_desc = ?,
            txn_reference = ?,
            updated_at = ?
        WHERE request_id = ?
      `, [
        response.data.status,
        response.data.statusDesc,
        response.data.data?.txnReference || null,
        new Date().toISOString(),
        requestID
      ]);
      
      await this.logAPICall(db, '/api/crdb/transaction/status', 'POST', req.body, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Check transaction status error:', error.message);
      next(error);
    }
  }

  // CRDB03 - Push CRDB ACCOUNT STATUS (Get Account Details)
  async getCRDBAccountDetails(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { customerAccount, partnerId, partnerPass, baseURL } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!customerAccount) {
        return res.status(400).json({ error: 'Missing required parameter: customerAccount' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      const requestId = `ACC${generateUUID()}`;
      
      // Calculate checksum: SHA1(customerAccount + md5(requestID))
      const checksum = sha1(customerAccount + md5(requestId));
      
      const requestBody = {
        code: "CRDB03",
        sessionToken: token,
        partnerID: partnerId,
        checksum: checksum,
        requestID: requestId,
        customerAccount: customerAccount
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Save account lookup to database
      await db.run(`
        INSERT INTO account_lookups (
          request_id, customer_account, account_name, status, status_desc, txn_reference, partner_id, base_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        requestId,
        customerAccount,
        response.data.data?.accountName || null,
        response.data.status,
        response.data.statusDesc,
        response.data.data?.txnReference || null,
        partnerId,
        baseURL
      ]);
      
      await this.logAPICall(db, '/api/crdb/account/details', 'POST', req.body, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Get account details error:', error.message);
      next(error);
    }
  }

  // CRDB04 - CRDB SIMBANKING USSD PUSH
  async sendUssdPush(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { 
        amount, customerMobile, paymentReference, accountCode = "SP108",
        currency = "TZS", callback,
        partnerId, partnerPass, baseURL 
      } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!amount || !customerMobile) {
        return res.status(400).json({ error: 'Missing required fields: amount, customerMobile' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      const requestId = `USS${generateUUID()}`;
      const validatedAmount = this.validateAmount(amount);
      
      // Calculate checksum: SHA1(customerMobile + md5(requestID) + amount + accountCode)
      const checksum = sha1(customerMobile + md5(requestId) + validatedAmount + accountCode);
      
      const requestBody = {
        code: "CRDB04",
        sessionToken: token,
        partnerID: partnerId,
        checksum: checksum,
        requestID: requestId,
        customerMobile: customerMobile,
        amount: validatedAmount,
        accountCode: accountCode,
        currency: currency,
        paymentReference: paymentReference || requestId,
        callback: callback || `${req.protocol}://${req.get('host')}/api/crdb/ussd/callback`
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Save USSD push request to database
      await db.run(`
        INSERT INTO ussd_requests (
          request_id, customer_mobile, amount, account_code, payment_reference,
          status, status_desc, txn_reference, partner_id, base_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        requestId,
        customerMobile,
        validatedAmount,
        accountCode,
        paymentReference || requestId,
        response.data.status,
        response.data.statusDesc,
        response.data.data?.txnReference || null,
        partnerId,
        baseURL
      ]);
      
      await this.logAPICall(db, '/api/crdb/ussd/push', 'POST', requestBody, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Send USSD push error:', error.message);
      next(error);
    }
  }

  // CRDB04 Callback - USSD Push Callback
  async getUssdPushCallback(req, res, next) {
    try {
      const db = req.app.locals.db;
      const callbackData = req.body;
      
      // Validate checksum
      const { customerMobile, requestID, amount, accountCode, partnerID } = callbackData;
      const expectedChecksum = sha1(customerMobile + md5(requestID) + amount + accountCode);
      
      if (callbackData.checksum !== expectedChecksum) {
        console.error('Invalid checksum in USSD callback');
      }
      
      // Update USSD request status
      await db.run(`
        UPDATE ussd_requests 
        SET status = ?, 
            status_desc = ?,
            txn_reference = ?,
            transaction_date = ?,
            transaction_channel = ?,
            customer_name = ?,
            completed_at = ?
        WHERE request_id = ?
      `, [
        callbackData.status,
        callbackData.statusDesc,
        callbackData.txnReference,
        callbackData.transactionDate,
        callbackData.transactionChannel,
        callbackData.customerName,
        new Date().toISOString(),
        callbackData.requestID
      ]);
      
      // Update transaction if exists
      await db.run(`
        UPDATE transactions 
        SET status = ?, 
            status_desc = ?,
            txn_reference = ?,
            updated_at = ?
        WHERE request_id = ?
      `, [
        callbackData.status,
        callbackData.statusDesc,
        callbackData.txnReference,
        new Date().toISOString(),
        callbackData.requestID
      ]);
      
      await this.logAPICall(db, '/api/crdb/ussd/callback', 'POST', callbackData, { status: 200 }, 200, 0, partnerID, req.ip);
      
      // Return required response format
      res.json({
        status: 200,
        statusDesc: "success",
        data: {
          txnReference: callbackData.txnReference,
          receipt: `REC${generateUUID()}`
        }
      });
    } catch (error) {
      console.error('USSD callback error:', error.message);
      next(error);
    }
  }

  // CRDB07 - CRDB VERIFY BATCH
  async verifyBatch(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { paymentReference, partnerId, partnerPass, baseURL } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!paymentReference) {
        return res.status(400).json({ error: 'Missing required parameter: paymentReference' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      const requestId = `VER${generateUUID()}`;
      
      const requestBody = {
        paymentReference: paymentReference,
        code: "CRDB07",
        partnerID: partnerId,
        sessionToken: token,
        requestID: requestId
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Save verification to database
      await db.run(`
        INSERT INTO batch_verifications (
          request_id, payment_reference, customer_name, customer_account,
          total_amount, no_txns, payment_type, currency, status, status_desc, partner_id, base_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        requestId,
        paymentReference,
        response.data.data?.customerName || null,
        response.data.data?.customerAccount || null,
        response.data.data?.totalAmount || null,
        response.data.data?.noTxns || null,
        response.data.data?.paymentType || null,
        response.data.data?.currency || null,
        response.data.status,
        response.data.statusDesc,
        partnerId,
        baseURL
      ]);
      
      await this.logAPICall(db, '/api/crdb/batch/verify', 'POST', req.body, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Verify batch error:', error.message);
      next(error);
    }
  }

  // CRDB09 - CRDB GET BATCH RECORDS (List Batched Disbursement)
  async listBatchedDisbursement(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { paymentReference, partnerId, partnerPass, baseURL } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!paymentReference) {
        return res.status(400).json({ error: 'Missing required parameter: paymentReference' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      const requestId = `LST${generateUUID()}`;
      
      const requestBody = {
        paymentReference: paymentReference,
        code: "CRDB09",
        partnerID: partnerId,
        sessionToken: token,
        requestID: requestId
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Save batch records list to database
      if (response.data.data && Array.isArray(response.data.data)) {
        for (const record of response.data.data) {
          await db.run(`
            INSERT INTO batch_records_list (
              request_id, payment_reference, amount, reference, 
              receiver_name, receiver_account, receiver_bic, charge,
              status, status_desc, partner_id, base_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            requestId,
            paymentReference,
            record.amount,
            record.reference,
            record.receiverName,
            record.receiverAccount,
            record.receiverBic,
            record.charge || null,
            record.status,
            record.statusDesc,
            partnerId,
            baseURL
          ]);
        }
      }
      
      await this.logAPICall(db, '/api/crdb/batch/list', 'POST', req.body, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('List batched disbursement error:', error.message);
      next(error);
    }
  }

  // CRDB08 - CRDB APPROVE BATCH
  async approveBatch(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { paymentReference, payerName, payerID, payerSortCode, partnerId, partnerPass, baseURL } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!paymentReference || !payerName || !payerID) {
        return res.status(400).json({ error: 'Missing required fields: paymentReference, payerName, payerID' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      const requestId = `APP${generateUUID()}`;
      
      const requestBody = {
        paymentReference: paymentReference,
        payerName: payerName,
        payerID: payerID,
        payerSortCode: payerSortCode,
        code: "CRDB08",
        partnerID: partnerId,
        sessionToken: token,
        requestID: requestId
      };
      
      const response = await REMOTE.post('/api/service/crdb', requestBody);
      
      // Update batch approval status
      await db.run(`
        UPDATE batches 
        SET approval_status = ?,
            approval_receipt = ?,
            approved_by = ?,
            approved_at = ?
        WHERE batch_id = (
          SELECT batch_id FROM batch_verifications 
          WHERE payment_reference = ? 
          ORDER BY created_at DESC LIMIT 1
        )
      `, [
        response.data.status === 200 ? 'APPROVED' : 'FAILED',
        response.data.data?.receipt || null,
        payerName,
        new Date().toISOString(),
        paymentReference
      ]);
      
      await this.logAPICall(db, '/api/crdb/batch/approve', 'POST', requestBody, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Approve batch error:', error.message);
      next(error);
    }
  }

  // POST BATCH TRANSACTIONS (CRDB POST BATCH TXNS)
  async postBatch(req, res, next) {
    const startTime = Date.now();
    try {
      const db = req.app.locals.db;
      const { batch, records, partnerId, partnerPass, baseURL } = req.body;
      
      if (!partnerId || !partnerPass || !baseURL) {
        return res.status(400).json({ error: 'Missing CRDB configuration: partnerId, partnerPass, baseURL are required' });
      }
      if (!batch || !records || !Array.isArray(records)) {
        return res.status(400).json({ error: 'Missing required fields: batch, records' });
      }
      
      const token = await this.ensureValidToken(db, partnerId, partnerPass, baseURL);
      const REMOTE = this.createAxiosInstance(baseURL);
      
      // Generate batch ID if not provided
      const batchId = batch.batchID || `BATCH${generateUUID()}`;
      
      // Calculate total amount if not provided
      if (!batch.batchTotalAmount) {
        batch.batchTotalAmount = records.reduce((sum, record) => sum + (parseFloat(record.recAmount) || 0), 0);
      }
      
      // Process records to generate record IDs if not provided
      const processedRecords = records.map(record => ({
        ...record,
        recID: record.recID || `REC${generateUUID()}`,
        recAmount: parseFloat(record.recAmount)
      }));
      
      const requestBody = {
        batch: {
          batchCode: batch.batchCode || "CRDBDIS01",
          batchPostType: batch.batchPostType || "M",
          batchApproval: batch.batchApproval || "N",
          batchID: batchId,
          batchAccount: batch.batchAccount,
          batchSender: batch.batchSender,
          batchDesc: batch.batchDesc,
          batchCurrency: batch.batchCurrency || "TZS",
          batchTotalAmount: batch.batchTotalAmount
        },
        records: processedRecords.map(record => ({
          recID: record.recID,
          recAccount: record.recAccount,
          recBic: record.recBic || "CORUTZTZ",
          recName: record.recName,
          recRef: record.recRef,
          recSecRef: record.recSecRef,
          recAmount: record.recAmount,
          recCurrency: record.recCurrency || "TZS",
          recDesc: record.recDesc
        })),
        sessionToken: token,
        partnerID: partnerId
      };
      
      const response = await REMOTE.post('/api/service/batch/crdb', requestBody);
      
      // Save batch information to database
      await db.run(`
        INSERT INTO batches (
          batch_id, batch_code, batch_post_type, batch_approval, batch_account, batch_sender, 
          batch_desc, batch_currency, total_amount, status, status_desc, 
          txn_reference, partner_id, base_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        batchId,
        batch.batchCode || "CRDBDIS01",
        batch.batchPostType || "M",
        batch.batchApproval || "N",
        batch.batchAccount,
        batch.batchSender,
        batch.batchDesc,
        batch.batchCurrency || "TZS",
        batch.batchTotalAmount,
        response.data.status,
        response.data.statusDesc,
        response.data.data?.txnReference || null,
        partnerId,
        baseURL
      ]);
      
      // Save batch records
      for (const record of processedRecords) {
        await db.run(`
          INSERT INTO batch_records (
            batch_id, record_id, account, bic, name, 
            reference, sec_reference, amount, currency, description, partner_id, base_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          batchId,
          record.recID,
          record.recAccount,
          record.recBic || "CORUTZTZ",
          record.recName,
          record.recRef,
          record.recSecRef,
          record.recAmount,
          record.recCurrency || "TZS",
          record.recDesc,
          partnerId,
          baseURL
        ]);
      }
      
      await this.logAPICall(db, '/api/crdb/batch', 'POST', requestBody, response.data, response.status, Date.now() - startTime, partnerId, req.ip);
      
      res.json(response.data);
    } catch (error) {
      console.error('Post batch error:', error.message);
      next(error);
    }
  }

  // CRDB Batch Completed/Failed Callback
  async batchTransactionCallback(req, res, next) {
    try {
      const db = req.app.locals.db;
      const { txnReference, recID, batchCode, partnerID, recDesc, batchID } = req.body;
      
      const isSuccessful = batchCode === "CRDBBTCMP";
      
      // Update batch record status
      await db.run(`
        UPDATE batch_records 
        SET status = ?,
            status_desc = ?,
            txn_reference = ?,
            completed_at = ?
        WHERE record_id = ? AND batch_id = ?
      `, [
        isSuccessful ? 'COMPLETED' : 'FAILED',
        recDesc,
        isSuccessful ? txnReference : null,
        new Date().toISOString(),
        recID,
        batchID
      ]);
      
      // Update batch summary
      await db.run(`
        UPDATE batches 
        SET completed_records = completed_records + 1,
            failed_records = failed_records + CASE WHEN ? THEN 0 ELSE 1 END,
            completed_amount = completed_amount + CASE WHEN ? THEN (SELECT amount FROM batch_records WHERE record_id = ?) ELSE 0 END,
            updated_at = ?
        WHERE batch_id = ?
      `, [
        isSuccessful,
        isSuccessful,
        recID,
        new Date().toISOString(),
        batchID
      ]);
      
      await this.logAPICall(db, '/api/crdb/batch/callback', 'POST', req.body, { status: 200 }, 200, 0, partnerID, req.ip);
      
      // Return required response format
      res.json({
        status: 200,
        statusDesc: "success",
        data: {
          receipt: `BATCHCB${generateUUID()}`
        }
      });
    } catch (error) {
      console.error('Batch callback error:', error.message);
      next(error);
    }
  }

  // Get transaction history
  async getTransactionHistory(req, res, next) {
    try {
      const db = req.app.locals.db;
      const { startDate, endDate, status, customerAccount, partnerId, limit = 100, offset = 0 } = req.body;
      
      let query = 'SELECT * FROM transactions WHERE 1=1';
      const params = [];
      
      if (partnerId) {
        query += ' AND partner_id = ?';
        params.push(partnerId);
      }
      if (startDate) {
        query += ' AND date(created_at) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND date(created_at) <= ?';
        params.push(endDate);
      }
      if (status) {
        query += ' AND status = ?';
        params.push(parseInt(status));
      }
      if (customerAccount) {
        query += ' AND customer_account = ?';
        params.push(customerAccount);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      
      const transactions = await db.all(query, params);
      
      let countQuery = 'SELECT COUNT(*) as total FROM transactions WHERE 1=1';
      const countParams = [];
      if (partnerId) countParams.push(partnerId);
      if (startDate) countParams.push(startDate);
      if (endDate) countParams.push(endDate);
      if (status) countParams.push(parseInt(status));
      if (customerAccount) countParams.push(customerAccount);
      
      const total = await db.get(countQuery, countParams);
      
      res.json({
        data: transactions,
        pagination: {
          total: total.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Get transaction history error:', error.message);
      next(error);
    }
  }

  // Get batch status
  async getBatchStatus(req, res, next) {
    try {
      const db = req.app.locals.db;
      const { batchId } = req.body;
      
      if (!batchId) {
        return res.status(400).json({ error: 'Missing required parameter: batchId' });
      }
      
      const batch = await db.get(`
        SELECT * FROM batches WHERE batch_id = ?
      `, [batchId]);
      
      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      
      const records = await db.all(`
        SELECT * FROM batch_records WHERE batch_id = ?
      `, [batchId]);
      
      res.json({
        batch,
        records,
        summary: {
          total_records: records.length,
          completed: records.filter(r => r.status === 'COMPLETED').length,
          failed: records.filter(r => r.status === 'FAILED').length,
          pending: records.filter(r => !r.status).length,
          total_amount: batch.total_amount,
          completed_amount: batch.completed_amount
        }
      });
    } catch (error) {
      console.error('Get batch status error:', error.message);
      next(error);
    }
  }

  // Get API logs
  async getAPILogs(req, res, next) {
    try {
      const db = req.app.locals.db;
      const { partnerId, startDate, endDate, limit = 100, offset = 0 } = req.body;
      
      let query = 'SELECT * FROM api_logs WHERE 1=1';
      const params = [];
      
      if (partnerId) {
        query += ' AND partner_id = ?';
        params.push(partnerId);
      }
      if (startDate) {
        query += ' AND date(created_at) >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND date(created_at) <= ?';
        params.push(endDate);
      }
      
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      
      const logs = await db.all(query, params);
      
      let countQuery = 'SELECT COUNT(*) as total FROM api_logs WHERE 1=1';
      const countParams = [];
      if (partnerId) countParams.push(partnerId);
      if (startDate) countParams.push(startDate);
      if (endDate) countParams.push(endDate);
      
      const total = await db.get(countQuery, countParams);
      
      res.json({
        data: logs,
        pagination: {
          total: total.total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Get API logs error:', error.message);
      next(error);
    }
  }

  // Database table viewer
  async getTableData(req, res, next) {
    try {
      const db = req.app.locals.db;
      const { tableName } = req.body;
      const allowedTables = ['transactions', 'account_lookups', 'ussd_requests', 'batches', 'batch_records', 'batch_verifications', 'batch_records_list', 'api_logs'];
      
      if (!allowedTables.includes(tableName)) {
        return res.status(400).json({ error: 'Invalid table name' });
      }
      
      const data = await db.all(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 100`);
      res.json({ data });
    } catch (error) {
      console.error('Get table data error:', error.message);
      next(error);
    }
  }

  // Health check
  async healthCheck(req, res, next) {
    try {
      const db = req.app.locals.db;
      await db.get('SELECT 1');
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected'
      });
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  }
}

// Initialize CRDB Controller
const crdbController = new CRDBController();

// API Routes - All POST endpoints
app.post('/health', crdbController.healthCheck.bind(crdbController));

// Transaction endpoints
app.post('/api/crdb/disbursement', crdbController.disbursementSingle.bind(crdbController));
app.post('/api/crdb/transaction/status', crdbController.checkCRDBtransactionStatus.bind(crdbController));
app.post('/api/crdb/transactions', crdbController.getTransactionHistory.bind(crdbController));

// Account endpoints
app.post('/api/crdb/account/details', crdbController.getCRDBAccountDetails.bind(crdbController));

// USSD endpoints
app.post('/api/crdb/ussd/push', crdbController.sendUssdPush.bind(crdbController));
app.post('/api/crdb/ussd/callback', crdbController.getUssdPushCallback.bind(crdbController));

// Batch endpoints
app.post('/api/crdb/batch', crdbController.postBatch.bind(crdbController));
app.post('/api/crdb/batch/verify', crdbController.verifyBatch.bind(crdbController));
app.post('/api/crdb/batch/list', crdbController.listBatchedDisbursement.bind(crdbController));
app.post('/api/crdb/batch/approve', crdbController.approveBatch.bind(crdbController));
app.post('/api/crdb/batch/callback', crdbController.batchTransactionCallback.bind(crdbController));
app.post('/api/crdb/batch/status', crdbController.getBatchStatus.bind(crdbController));

// Database inspector
app.post('/api/database/table', crdbController.getTableData.bind(crdbController));

// Logs endpoint
app.post('/api/logs', crdbController.getAPILogs.bind(crdbController));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health (POST)`);
      console.log(`API endpoints available at /api/crdb/*`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
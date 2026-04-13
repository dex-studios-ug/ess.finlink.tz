
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Database setup
let db;

async function initializeDatabase() {
  db = await open({
    filename: path.join(__dirname, 'db.sqlite'),
    driver: sqlite3.Database
  });

  await db.exec(`
    --loan approvers
    create table if not exists LoanApprover(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      status INTEGER,
      rank INTEGER,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

      create table if not exists LoanApproval(
     id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      loan_id INTEGER,
      rank INTEGER,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
-- insert 2 test approvers
insert or ignore into LoanApprover values (1,1,1,1,NULL,NULL),(2,4,1,2,NULL,NULL);

    -- User mobile numbers table
    CREATE TABLE IF NOT EXISTS user_mobile_no (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      mobile_no TEXT);
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
    -- =========================
-- SMS LOGS TABLE
-- =========================
CREATE TABLE IF NOT EXISTS sms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receiver TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'Pending', -- Pending | Delivered | Failed
    type TEXT, -- e.g. TRANSACTION_ALERT, OTP, etc.
    entity TEXT, -- e.g. TRANSACTION, ACCOUNT, etc.
    action TEXT, -- e.g. CREATED, APPROVED, etc.
    client_id TEXT,
    client_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance (important for your queries)
CREATE INDEX IF NOT EXISTS idx_sms_status 
ON sms_logs (status);

CREATE INDEX IF NOT EXISTS idx_sms_created_at 
ON sms_logs (created_at);

-- ESS Logs Table
CREATE TABLE IF NOT EXISTS ess_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'INBOUND' or 'OUTBOUND'
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED', 'PROCESSING'
    request_payload TEXT,
    response_payload TEXT,
    error_message TEXT,
    sender TEXT,
    receiver TEXT,
    fsp_code TEXT,
    application_number TEXT,
    loan_number TEXT,
    client_id TEXT,
    client_name TEXT,
    amount REAL,
    approval_status TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
 CREATE TABLE IF NOT EXISTS VCN (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            num INTEGER NOT NULL
        )
            ;
             
    CREATE TABLE IF NOT EXISTS LoanApprover (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        first_name TEXT,
        rank INTEGER,
        created_at TEXT,
        updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS LoanApproval (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER,
        rank INTEGER,
        created_at TEXT,
        updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS LoanDisburser (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        first_name TEXT,
        rank INTEGER,
        created_at TEXT,
        updated_at TEXT
    );
    
            CREATE TABLE IF NOT EXISTS CPTransaction (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fineract_id INTEGER DEFAULT -1,
                is_reversed INTEGER DEFAULT 0,
                is_suspicious INTEGER DEFAULT 0,
                clientId INTEGER NOT NULL,
                savingsId INTEGER NOT NULL,
                status TEXT DEFAULT 'PENDING',
                amount REAL NOT NULL,
                phoneNo TEXT DEFAULT '',
                currency TEXT DEFAULT 'TZS',
                method TEXT DEFAULT '',
                bankName TEXT DEFAULT '',
                bic TEXT DEFAULT '',
                accountNo TEXT DEFAULT '',
                type TEXT NOT NULL,
                remark TEXT DEFAULT '',
                orderReference TEXT NOT NULL,
                createdDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedDate DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        
            CREATE TABLE IF NOT EXISTS user_mobile_no (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                mobile_no TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
     
    
    CREATE TABLE IF NOT EXISTS LoanDisbursement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER,
        rank INTEGER,
        created_at TEXT,
        updated_at TEXT
    );
        INSERT OR IGNORE INTO VCN (id, num) VALUES (1, 1);
    CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                objectType TEXT ,
                objectId TEXT ,
                userId TEXT ,
                userRole TEXT ,
                toUserId TEXT ,
                toUserRole TEXT ,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                read INTEGER DEFAULT 0
            );     
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ess_logs_message_type ON ess_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_ess_logs_direction ON ess_logs(direction);
CREATE INDEX IF NOT EXISTS idx_ess_logs_status ON ess_logs(status);
CREATE INDEX IF NOT EXISTS idx_ess_logs_application_number ON ess_logs(application_number);
CREATE INDEX IF NOT EXISTS idx_ess_logs_created_at ON ess_logs(created_at);

-- =========================
-- SETTINGS TABLE (for volume)
-- =========================
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), -- single row config
    sms_volume INTEGER DEFAULT 0
);

INSERT or ignore INTO sms_logs (id, receiver, message, status)
VALUES
(1, '+256700000001', 'Test SMS 1', 'Delivered'),
(2, '+256700000002', 'Test SMS 2', 'Pending'),
(3, '+256700000003', 'Test SMS 3', 'Delivered');

-- Ensure exactly one row exists
INSERT OR IGNORE INTO settings (id, sms_volume) VALUES (1, 0);

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_transactions_request_id ON transactions(request_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer_account ON transactions(customer_account);
    CREATE INDEX IF NOT EXISTS idx_ussd_requests_request_id ON ussd_requests(request_id);
    CREATE INDEX IF NOT EXISTS idx_batches_batch_id ON batches(batch_id);
    CREATE INDEX IF NOT EXISTS idx_batch_records_batch_id ON batch_records(batch_id);
    CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
  `);

 return db;
}

module.exports = { db, initializeDatabase };
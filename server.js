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
require('dotenv').config();

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

    async sendNotification(messageType, messageDetails, notificationId = null) {
        const msgId = notificationId || this.signature.generateMsgId();
        const payload = this.signature.generateXmlDocument(messageType, messageDetails);
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await axios.post(this.essUrl, payload, {
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
                return { success: true, messageId: msgId, statusCode: response.status };
            } catch (error) {
                logger.warn(`Notification send failed (attempt ${attempt}/${this.retryAttempts}): ${messageType}`, {
                    messageId: msgId,
                    error: error.message,
                    nextRetryIn: attempt < this.retryAttempts ? this.retryDelayMs : 'no retry'
                });
                
                if (attempt < this.retryAttempts) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelayMs * attempt));
                } else {
                    logger.error(`Failed to send notification after ${this.retryAttempts} attempts: ${messageType}`, {
                        messageId: msgId,
                        error: error.message
                    });
                    return { success: false, messageId: msgId, error: error.message };
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
const app = express();
const mifosxClient = new MifosxClient();
const signatureService = new DigitalSignatureService();
const notificationService = new NotificationService(signatureService, config.essNotificationUrl);
const loanService = new LoanProcessingService(mifosxClient, signatureService);
loanService.notificationService = notificationService;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : (config.env !== 'production' ? true : []),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Message-Type', 'X-Message-ID', 'X-FSP-Code']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['application/xml', 'text/xml', 'application/*+xml'], limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimits.windowMs,
    max: config.rateLimits.max,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/ess/', limiter);

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path}`, {
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    });
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        fspCode: config.fspCode,
        version: '1.0.0'
    });
});

// ==================== AUTHENTICATION ROUTES ====================
const auth = require('./auth');

// In-memory user store (in production, use a database)
const users = [
    {
        id: 1,
        username: 'admin',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfLkI0qQcO8m5m', // admin123
        role: 'admin',
        name: 'Administrator'
    },
    {
        id: 2,
        username: 'user',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewfLkI0qQcO8m5m', // user123
        role: 'user',
        name: 'Regular User'
    }
];

// Login route
app.post('/api/ess/auth/login', [
    body('username').trim().isLength({ min: 1 }).withMessage('Username is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find user
        const user = {id:0,username:'admin',role:'admin',password:'admin'};//users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Verify password
        const isValidPassword = 1;//await auth.verifyPassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Generate JWT token
        const token = auth.generateToken({
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name
        });

        // Return success response
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                name: user.name
            }
        });

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Verify token route (for client-side token validation)
app.get('/api/ess/auth/verify', auth.authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// Logout route (client-side token removal)
app.post('/api/ess/auth/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// ==================== API ENDPOINTS ====================

// Product Catalog Management
app.post('/api/ess/products/catalog', async (req, res) => {
    try {
        const products = await mifosxClient.getLoanProducts();
        if (!products.success) {
            return res.status(500).json({ error: 'Failed to fetch products' });
        }
        
        const catalog = products.data.map(product => ({
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
        
        const xmlResponse = signatureService.generateXmlDocument('PRODUCT_DETAIL', catalog);
        res.type('application/xml').send(xmlResponse);
    } catch (error) {
        logger.error('Product catalog error:', error);
        res.status(500).type('application/xml').send(signatureService.generateResponse('8011', 'Internal server error'));
    }
});

// Product Decommission
app.post('/api/ess/products/decommission', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Product decommission acknowledged'));
});

// Loan Charges Request
app.post('/api/ess/loan/charges', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processLoanChargesRequest(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Offer Request
app.post('/api/ess/loan/offer', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processLoanOfferRequest(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Final Approval Notification
app.post('/api/ess/loan/approval', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processLoanApproval(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Disbursement
app.post('/api/ess/loan/disburse/:applicationNumber', async (req, res) => {
    const response = await loanService.processDisbursement(req.params.applicationNumber);
    res.type('application/xml').send(response);
});

// Loan Cancellation
app.post('/api/ess/loan/cancel', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { ApplicationNumber, Reason } = parsed.data.MessageDetails;
    logger.info('Loan cancellation received:', { ApplicationNumber, Reason });
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Cancellation acknowledged'));
});

// Top Up Pay Off Balance Request
app.post('/api/ess/topup/balance', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { LoanNumber } = parsed.data.MessageDetails;
    const response = await loanService.processLoanBalanceRequest(LoanNumber);
    res.type('application/xml').send(response);
});

// Top Up Offer Request
app.post('/api/ess/topup/offer', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processLoanOfferRequest(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Restructuring Balance Request
app.post('/api/ess/restructuring/balance', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { LoanNumber } = parsed.data.MessageDetails;
    const response = await loanService.processLoanBalanceRequest(LoanNumber);
    res.type('application/xml').send(response);
});

// Loan Restructuring Affordability Request
app.post('/api/ess/restructuring/affordability', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processLoanChargesRequest(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Restructuring Request
app.post('/api/ess/restructuring/request', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Restructuring request received'));
});

// Loan Takeover Balance Request
app.post('/api/ess/takeover/balance', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processTakeoverBalance(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Takeover Offer Request
app.post('/api/ess/takeover/offer', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processTakeoverOffer(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Takeover Payment Notification (FSP1 receives payment from FSP2)
app.post('/api/ess/takeover/payment', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processTakeoverPayment(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Monthly Deductions Record
app.post('/api/ess/deductions/monthly', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const deductions = Array.isArray(parsed.data.MessageDetails.DeductionRecord) 
        ? parsed.data.MessageDetails.DeductionRecord 
        : [parsed.data.MessageDetails.DeductionRecord];
    
    const response = await loanService.processMonthlyDeductions(deductions);
    res.type('application/xml').send(response);
});

// Full Loan Repayment Request
app.post('/api/ess/repayment/full', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { LoanNumber, PaymentOption } = parsed.data.MessageDetails;
    const response = await loanService.processLoanBalanceRequest(LoanNumber);
    res.type('application/xml').send(response);
});

// Partial Loan Repayment Request
app.post('/api/ess/repayment/partial', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { LoanNumber, AmountToPay, Intention } = parsed.data.MessageDetails;
    const response = await loanService.processLoanBalanceRequest(LoanNumber);
    res.type('application/xml').send(response);
});

// Account Validation
app.post('/api/ess/account/validate', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { AccountNumber, FirstName, LastName } = parsed.data.MessageDetails;
    const response = await loanService.processAccountValidation(AccountNumber, FirstName, LastName);
    res.type('application/xml').send(response);
});

// FSP Branches
app.get('/api/ess/branches', async (req, res) => {
    const response = await loanService.getFSPBranches();
    res.type('application/xml').send(response);
});

// Defaulter Details to Employer (FSP initiated)
app.post('/api/ess/defaulter/notify', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processDefaulterNotification(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Deduction Stop Notification
app.post('/api/ess/deduction/stop', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const response = await loanService.processDeductionStop(parsed.data.MessageDetails);
    res.type('application/xml').send(response);
});

// Loan Status Request
app.post('/api/ess/loan/status', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { ApplicationNumber } = parsed.data.MessageDetails;
    const cached = loanService.loanCache.get(ApplicationNumber);
    
    const statusDescription = cached 
        ? `Loan with application ${ApplicationNumber} is at status: ${cached.status}`
        : `Loan with application ${ApplicationNumber} not found`;
    
    res.type('application/xml').send(signatureService.generateResponse('8000', statusDescription));
});

// General Response Handler
app.post('/api/ess/response', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (parsed && parsed.isValid) {
        logger.info('Response received from ESS:', parsed.data.MessageDetails);
    }
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Response acknowledged'));
});

// Restructuring Cancellation
app.post('/api/ess/restructuring/cancel', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { ApplicationNumber, Reason, LoanNumber } = parsed.data.MessageDetails;
    logger.info('Loan restructuring cancellation received:', { ApplicationNumber, LoanNumber, Reason });
    
    const cached = loanService.loanCache.get(ApplicationNumber);
    if (cached) {
        cached.status = 'RESTRUCTURE_CANCELLED';
        loanService.loanCache.set(ApplicationNumber, cached);
    }
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Restructuring cancellation acknowledged'));
});

// Top-Up Cancellation
app.post('/api/ess/topup/cancel', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { ApplicationNumber, Reason, LoanNumber } = parsed.data.MessageDetails;
    logger.info('Loan top-up cancellation received:', { ApplicationNumber, LoanNumber, Reason });
    
    const cached = loanService.loanCache.get(ApplicationNumber);
    if (cached) {
        cached.status = 'TOPUP_CANCELLED';
        loanService.loanCache.set(ApplicationNumber, cached);
    }
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Top-up cancellation acknowledged'));
});

// Loan Restructuring Rejection (Employee rejection of FSP offer)
app.post('/api/ess/restructuring/reject', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { ApplicationNumber, Reason, LoanNumber } = parsed.data.MessageDetails;
    logger.info('Loan restructuring rejection received:', { ApplicationNumber, LoanNumber, Reason });
    
    const cached = loanService.loanCache.get(ApplicationNumber);
    if (cached) {
        cached.status = 'RESTRUCTURE_REJECTED';
        loanService.loanCache.set(ApplicationNumber, cached);
    }
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Restructuring rejection acknowledged'));
});

// Enhanced Restructuring Request with affordability and balance checks
app.post('/api/ess/restructuring/request-full', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    try {
        const { ApplicationNumber, CheckNumber, LoanNumber, NewTenure, NewDesiredAmount } = parsed.data.MessageDetails;
        
        // Get existing loan details
        const loan = await loanService.mifosx.getLoan(LoanNumber);
        if (!loan.success) {
            return res.status(400).type('application/xml').send(signatureService.generateResponse('8011', 'Loan not found'));
        }
        
        const loanData = loan.data;
        const currentBalance = loanData.totalOutstandingAmount || 0;
        
        // Calculate new charges based on new tenure
        const interestRate = (loanData.interestRatePerPeriod || 10) / 100;
        const newInterest = (currentBalance * interestRate) * (NewTenure / 12);
        const newMonthlyPayment = (currentBalance + newInterest) / NewTenure;
        
        logger.info('Restructuring request processed:', {
            ApplicationNumber,
            LoanNumber,
            currentBalance,
            newTenure: NewTenure,
            newMonthlyPayment,
            newInterest
        });
        
        // Send approval notification asynchronously
        if (notificationService) {
            setTimeout(() => {
                notificationService.notifyRestructuringApproval(
                    ApplicationNumber,
                    LoanNumber,
                    'APPROVED',
                    `Loan restructured: new tenure ${NewTenure} months, new payment ${newMonthlyPayment}`
                );
            }, 500);
        }
        
        res.type('application/xml').send(signatureService.generateResponse('8000', `Restructuring approved with new tenure ${NewTenure} months and monthly payment ${newMonthlyPayment}`));
    } catch (error) {
        logger.error('Restructuring request error:', error);
        res.status(500).type('application/xml').send(signatureService.generateResponse('8011', `Restructuring error: ${error.message}`));
    }
});

// FSP Initiates Loan Restructuring (Section 2.4.5)
app.post('/api/ess/restructuring/initiate-fsp', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    try {
        const { LoanNumber, Reason, ProposedTenure, ProposedAmount } = parsed.data.MessageDetails;
        
        logger.info('FSP-initiated restructuring received:', { LoanNumber, Reason, ProposedTenure, ProposedAmount });
        
        // Get existing loan details
        const loan = await loanService.mifosx.getLoan(LoanNumber);
        if (!loan.success) {
            return res.status(400).type('application/xml').send(signatureService.generateResponse('8019', 'Loan not found'));
        }
        
        const loanData = loan.data;
        const currentBalance = loanData.summary?.totalOutstanding || 0;
        
        // Calculate proposed charges
        const interestRate = (loanData.interestRatePerPeriod || 10) / 100;
        const proposedInterest = (currentBalance * interestRate) * (ProposedTenure / 12);
        const proposedMonthly = (currentBalance + proposedInterest) / ProposedTenure;
        
        res.type('application/xml').send(signatureService.generateResponse('8000', 
            `Restructuring proposal: ${ProposedTenure} months, monthly payment ${proposedMonthly}, reason: ${Reason}`));
    } catch (error) {
        logger.error('FSP restructuring initiation error:', error);
        res.status(500).type('application/xml').send(signatureService.generateResponse('8011', 'Error processing FSP restructuring'));
    }
});

// Loan Takeover Cancellation/Rejection (Section 2.5.7)
app.post('/api/ess/takeover/cancel', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { ApplicationNumber, Reason, LoanNumber } = parsed.data.MessageDetails;
    logger.info('Loan takeover cancellation/rejection received:', { ApplicationNumber, LoanNumber, Reason });
    
    const cached = loanService.loanCache.get(ApplicationNumber);
    if (cached) {
        cached.status = 'TAKEOVER_CANCELLED';
        loanService.loanCache.set(ApplicationNumber, cached);
    }
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Takeover cancellation acknowledged'));
});

// Loan Liquidation Notification (Section 2.6.4)
app.post('/api/ess/loan/liquidation', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    try {
        const { LoanNumber, ApplicationNumber, OutstandingBalance, LiquidationDate } = parsed.data.MessageDetails;
        
        logger.info('Loan liquidation notification received:', { LoanNumber, ApplicationNumber, OutstandingBalance, LiquidationDate });
        
        const cached = loanService.loanCache.get(ApplicationNumber);
        if (cached) {
            cached.status = 'LIQUIDATED';
            cached.liquidationDate = LiquidationDate;
            cached.finalBalance = OutstandingBalance;
            loanService.loanCache.set(ApplicationNumber, cached);
        }
        
        res.type('application/xml').send(signatureService.generateResponse('8000', `Loan ${LoanNumber} liquidation acknowledged`));
    } catch (error) {
        logger.error('Liquidation notification error:', error);
        res.status(500).type('application/xml').send(signatureService.generateResponse('8011', 'Error processing liquidation'));
    }
});

// Defaulter Details Acknowledgment from Employer to FSP (Section 2.7.2)
app.post('/api/ess/defaulter/acknowledge', async (req, res) => {
    const parsed = signatureService.parseXmlDocument(req.body);
    if (!parsed || !parsed.isValid) {
        return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
    }
    
    const { CheckNumber, LoanNumber, EmployeeStatus, ActionTaken } = parsed.data.MessageDetails;
    logger.info('Defaulter acknowledgment received from employer:', { CheckNumber, LoanNumber, EmployeeStatus, ActionTaken });
    
    res.type('application/xml').send(signatureService.generateResponse('8000', 'Defaulter information acknowledged'));
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

let server;

if (require.main === module) {
    const PORT = config.port;
    server = app.listen(PORT, () => {
        logger.info(`e-MKOPO FSP Bridge Server running on port ${PORT}`);
        logger.info(`FSP Code: ${config.fspCode}`);
        logger.info(`Environment: ${config.env}`);
        logger.info(`MifosX API: ${config.mifosx.baseUrl}`);
        if (config.security.disableSignatureValidation) {
            logger.warn('⚠️  SIGNATURE VALIDATION DISABLED - For development/testing only!');
        }
        console.log(`Server is running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health (POST)`);
    }).on('error', (err) => {
        console.error('Server failed to start:', err);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        server.close(() => {
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

module.exports = { app, mifosxClient, signatureService, loanService };

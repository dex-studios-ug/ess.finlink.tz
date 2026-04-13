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
 async sendNotificationRaw(messageType, messageDetails, notificationId = null) {
        const msgId = notificationId || this.signature.generateMsgId();
        const payload = messageType;//this.signature.generateXmlDocument(messageType, messageDetails);
        
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
app.use(express.static('../public'));
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



// ==================== PRODUCT API ENDPOINTS ====================

app.post('/api/ess/products/commission', async (req, res) => {
    try {
        const {productIds}=req.body;
        const products = await mifosxClient.getLoanProducts();
        if (!products.success) {
            return res.status(500).json({ error: 'Failed to fetch products' });
        }
        
        const catalog = products.data.filter((p)=>productIds.includes(p)).map(product => ({
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
        
        notificationService.sendNotification('PRODUCT_DETAIL',catalog);
        
        res.json({
            success:true,
            productsCommissioned:catalog
        });
    } catch (error) {
        logger.error('Product catalog error:', error);
         res.status(500).json({ 'error': error });
   }
});

// Product Decommission
app.post('/api/ess/products/decommission', async (req, res) => {
   try{
    const {productIds}=req.body;
    const products = productIds.map(p=>({ProductCode:p}))
        notificationService.sendNotification('PRODUCT_DECOMMISSION',products);
        res.json({
            success:true,
            productsDecommissioned:products
        })
   }catch(error){
    logger.error('Decommission error ',error);
    res.status(500).json({ 'error': error });
   }
   // 
//product decomission not implemented here
});
/* these messages have an endpoit because they may come from ui on loan request
LOAN_INITIAL_APPROVAL_NOTIFICATION
LOAN_DISBURSEMENT_NOTIFICATION
LOAN_DISBURSEMENT_FAILURE_NOTIFICATION
LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST
LOAN_CANCELLATION_NOTIFICATION
LOAN_DISBURSEMENT_FAILURE_NOTIFICATION
TAKEOVER_DISBURSEMENT_NOTIFICATION
PAYMENT_ACKNOWLEDGMENT_NOTIFICATION
FULL_LOAN_REPAYMENT_NOTIFICATION
LOAN_LIQUIDATION_NOTIFICATION
DEFAULTER_DETAILS_TO_EMPLOYER
*/
//MAIN ENTRY POINT MESSAGE BASED
// ==================== REFACTORED MAIN ENTRY POINT ====================
// Only processes requests from ESS. 
// _RESPONSE messages are generated internally, not received from external sources.

app.post('/', async (req, res) => {
    try {
        const parsed = signatureService.parseXmlDocument(req.body);
        if (!parsed || !parsed.isValid) {
            return res.status(401).type('application/xml').send(signatureService.generateResponse('8009', 'Invalid signature'));
        }
        
        let response = null;
        const messageType = parsed.data.Header?.MessageType || parsed.data.MessageType;
        const messageDetails = parsed.data.MessageDetails || parsed.data;
        
        switch (messageType) {
            // ==================== PRODUCT CATALOG (from ESS to FSP) ====================
            // ESS sends these to FSP
            case MSG.PRODUCT_DETAIL:
                response = signatureService.generateResponse('8000', 'Product details received');
                break;
            case MSG.PRODUCT_DECOMMISSION:
                response = signatureService.generateResponse('8000', 'Product decommission received');
                break;
            
            // ==================== NEW LOAN (Requests from ESS to FSP) ====================
            // FSP processes these and sends back _RESPONSE messages synchronously
            case MSG.LOAN_CHARGES_REQUEST:
                // FSP generates LOAN_CHARGES_RESPONSE automatically
                response = await loanService.processLoanChargesRequest(messageDetails);
                break;
            case MSG.LOAN_OFFER_REQUEST:
                // FSP generates LOAN_INITIAL_APPROVAL_NOTIFICATION as response
                response = await loanService.processLoanOfferRequest(messageDetails);
                break;
            case MSG.LOAN_FINAL_APPROVAL_NOTIFICATION:
                // FSP processes approval
                response = await loanService.processLoanApproval(messageDetails);
                break;
            case MSG.LOAN_CANCELLATION_NOTIFICATION:
                // FSP processes cancellation
                response = await loanService.processLoanCancellationRequest(messageDetails);
                break;
            
            // ==================== TOP UP (Requests from ESS to FSP) ====================
            case MSG.TOP_UP_PAY_OFF_BALANCE_REQUEST:
                // FSP generates LOAN_TOP_UP_BALANCE_RESPONSE
                response = await loanService.processPayOffBalance(messageDetails);
                break;
            case MSG.TOP_UP_OFFER_REQUEST:
                // FSP generates LOAN_INITIAL_APPROVAL_NOTIFICATION
                response = await loanService.processLoanTopUp(messageDetails);
                break;
            
            // ==================== RESTRUCTURING (Requests from ESS to FSP) ====================
            case MSG.LOAN_RESTRUCTURE_BALANCE_REQUEST:
                // FSP generates LOAN_RESTRUCTURE_BALANCE_RESPONSE
                response = await loanService.processLoanRestructureBalance(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST:
                // FSP generates LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE
                response = await loanService.processLoanRestructureAffordability(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_REQUEST:
                // FSP generates LOAN_INITIAL_APPROVAL_NOTIFICATION
                response = await loanService.processLoanRestructureRequest(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_REJECTION:
                response = await loanService.processLoanRestructureRejection(messageDetails);
                break;
            case MSG.LOAN_RESTRUCTURE_REQUEST_FSP:
                // FSP-initiated restructure proposal
                response = await loanService.processFSPInitiatedRestructure(messageDetails);
                break;
            
            // ==================== TAKEOVER (Requests from ESS to FSP) ====================
            case MSG.TAKEOVER_PAY_OFF_BALANCE_REQUEST:
                // FSP generates LOAN_TAKEOVER_BALANCE_RESPONSE
                response = await loanService.processTakeoverBalance(messageDetails);
                break;
            case MSG.LOAN_TAKEOVER_OFFER_REQUEST:
                // FSP generates LOAN_TAKEOVER_APPROVAL_NOTIFICATION
                response = await loanService.processTakeoverOffer(messageDetails);
                break;
            case MSG.TAKEOVER_PAYMENT_NOTIFICATION:
                response = await loanService.processTakeoverPayment(messageDetails);
                break;
            
            // ==================== REPAYMENTS (Requests from ESS to FSP) ====================
            case MSG.FSP_REPAYMENT_REQUEST:
                // FSP generates REPAYMENT_OFF_BALANCE_REQUEST_TO_FSP
                response = await loanService.processFSPRepaymentRequest(messageDetails);
                break;
            case MSG.FULL_LOAN_REPAYMENT_REQUEST:
                // FSP generates FULL_REPAYMENT_OFF_BALANCE_RESPONSE
                response = await loanService.processFullEmployeeRepayment(messageDetails);
                break;
            case MSG.PARTIAL_LOAN_REPAYMENT_REQUEST:
                // FSP generates PARTIAL_REPAYMENT_OFF_BALANCE_RESPONSE
                response = await loanService.processPartialEmployeeRepayment(messageDetails);
                break;
            case MSG.FSP_MONTHLY_DEDUCTIONS:
                response = await loanService.processMonthlyPayments(parsed.data);
                break;
            
            // ==================== STATUS (Requests from ESS to FSP) ====================
            case MSG.LOAN_STATUS_REQUEST:
                // FSP generates LOAN_STATUS_RESPONSE
                response = await loanService.getLoanStatus(messageDetails);
                break;
            
            // ==================== DEFAULTER (Requests from ESS to FSP) ====================
            case MSG.DEFAULTER_DETAILS_TO_FSP:
                response = signatureService.generateResponse('8000', 'Defaulter details received');
                break;
            case MSG.DEDUCTION_STOP_NOTIFICATION:
                response = await loanService.processDeductionStopNotification(messageDetails);
                break;
            
            // ==================== ACCOUNT & BRANCHES (Requests from ESS to FSP) ====================
            case MSG.ACCOUNT_VALIDATION:
                // FSP generates ACCOUNT_VALIDATION_RESPONSE
                response = await loanService.validateEssClientAccount(messageDetails);
                break;
            case MSG.FSP_BRANCHES:
                // FSP generates FSP_BRANCHES response
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

// ==================== UI ENDPOINTS FOR PROACTIVE NOTIFICATIONS TO ESS ====================
// These are ONLY for notifications that FSP sends to ESS proactively
// NOT for _RESPONSE messages - those are handled automatically in the main entry point

// ==================== PROACTIVE NOTIFICATIONS (FSP to ESS) ====================

// FSP sends Loan Initial Approval Notification to ESS (proactive)
app.post('/api/ess/notification/loan-initial-approval', async (req, res) => {
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

        const xml = signatureService.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Ok',
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            OtherCharges: OtherCharges || '0',
            Approval: Approval || 'APPROVED'
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_INITIAL_APPROVAL_NOTIFICATION');
        
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

// FSP sends Loan Disbursement Notification to ESS (proactive)
app.post('/api/ess/notification/loan-disbursement', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            FSPReferenceNumber,
            LoanNumber,
            TotalAmountToPay,
            DisbursementDate
        } = req.body;

        const xml = signatureService.generateXmlDocument('LOAN_DISBURSEMENT_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            DisbursementDate: DisbursementDate || new Date().toISOString()
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_DISBURSEMENT_NOTIFICATION');
        
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

// FSP sends Loan Disbursement Failure Notification to ESS (proactive)
app.post('/api/ess/notification/loan-disbursement-failure', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason
        } = req.body;

        const xml = signatureService.generateXmlDocument('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Technical error occurred'
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_DISBURSEMENT_FAILURE_NOTIFICATION');
        
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

// FSP sends Loan Restructure Affordability Response (proactive - response to previous request)
// NOTE: This is a RESPONSE message type, but it's a proactive notification that ESS expects
app.post('/api/ess/notification/restructure-affordability-response', async (req, res) => {
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

        const xml = signatureService.generateXmlDocument('LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE', {
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

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE');
        
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

// FSP sends Loan Restructured Notification to ESS (proactive)
app.post('/api/ess/notification/loan-restructured', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            FSPReferenceNumber,
            LoanNumber,
            TotalAmountToPay,
            DisbursementDate
        } = req.body;

        const xml = signatureService.generateXmlDocument('LOAN_RESTRUCTURED_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            DisbursementDate: DisbursementDate || new Date().toISOString()
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_RESTRUCTURED_NOTIFICATION');
        
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

// FSP sends Loan Restructured Failure Notification to ESS (proactive)
app.post('/api/ess/notification/loan-restructured-failure', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason
        } = req.body;

        const xml = signatureService.generateXmlDocument('LOAN_RESTRUCTURED_FAILURE_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Restructuring failed'
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_RESTRUCTURED_FAILURE_NOTIFICATION');
        
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

// FSP sends Loan Takeover Balance Response (proactive)
app.post('/api/ess/notification/takeover-balance-response', async (req, res) => {
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

        const xml = signatureService.generateXmlDocument('LOAN_TAKEOVER_BALANCE_RESPONSE', {
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

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_TAKEOVER_BALANCE_RESPONSE');
        
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

// FSP sends Loan Takeover Approval Notification to ESS (proactive)
app.post('/api/ess/notification/takeover-approval', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Reason,
            FSPReferenceNumber,
            OtherCharges,
            Approval,
            LoanNumber
        } = req.body;

        const xml = signatureService.generateXmlDocument('LOAN_TAKEOVER_APPROVAL_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Reason: Reason || 'Ok',
            FSPReferenceNumber: FSPReferenceNumber,
            OtherCharges: OtherCharges || '0',
            Approval: Approval || 'APPROVED',
            LoanNumber: LoanNumber
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_TAKEOVER_APPROVAL_NOTIFICATION');
        
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

// FSP sends Takeover Disbursement Notification to ESS (proactive)
app.post('/api/ess/notification/takeover-disbursement', async (req, res) => {
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

        const xml = signatureService.generateXmlDocument('TAKEOVER_DISBURSEMENT_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            FSPReferenceNumber: FSPReferenceNumber,
            LoanNumber: LoanNumber,
            TotalAmountToPay: TotalAmountToPay || '0',
            DisbursementDate: DisbursementDate || new Date().toISOString(),
            Reason: Reason || 'Takeover disbursement completed',
            PaymentAdvice: PaymentAdvice || 'MT103',
            PaymentAdviceAttachment: PaymentAdviceAttachment || ''
        });

        const response = await notificationService.sendNotificationRaw(xml, 'TAKEOVER_DISBURSEMENT_NOTIFICATION');
        
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

// FSP sends Payment Acknowledgment Notification to ESS (proactive)
app.post('/api/ess/notification/payment-acknowledgment', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            Remarks,
            FSPReferenceNumber,
            PaymentStatus,
            LoanNumber
        } = req.body;

        const xml = signatureService.generateXmlDocument('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            Remarks: Remarks || 'Payment processed',
            FSPReferenceNumber: FSPReferenceNumber,
            PaymentStatus: PaymentStatus || 'SETTLED',
            LoanNumber: LoanNumber
        });

        const response = await notificationService.sendNotificationRaw(xml, 'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION');
        
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

// FSP sends Full Loan Repayment Notification to ESS (proactive)
app.post('/api/ess/notification/full-repayment', async (req, res) => {
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

        const xml = signatureService.generateXmlDocument('FULL_LOAN_REPAYMENT_NOTIFICATION', {
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

        const response = await notificationService.sendNotificationRaw(xml, 'FULL_LOAN_REPAYMENT_NOTIFICATION');
        
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

// FSP sends Loan Liquidation Notification to ESS (proactive)
app.post('/api/ess/notification/loan-liquidation', async (req, res) => {
    try {
        const {
            ApplicationNumber,
            LoanNumber,
            Remarks
        } = req.body;

        const xml = signatureService.generateXmlDocument('LOAN_LIQUIDATION_NOTIFICATION', {
            ApplicationNumber: ApplicationNumber,
            LoanNumber: LoanNumber,
            Remarks: Remarks || 'Loan fully paid and closed'
        });

        const response = await notificationService.sendNotificationRaw(xml, 'LOAN_LIQUIDATION_NOTIFICATION');
        
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

// FSP sends Defaulter Details to Employer (proactive)
app.post('/api/ess/notification/defaulter-to-employer', async (req, res) => {
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

        const xml = signatureService.generateXmlDocument('DEFAULTER_DETAILS_TO_EMPLOYER', {
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

        const response = await notificationService.sendNotificationRaw(xml, 'DEFAULTER_DETAILS_TO_EMPLOYER');
        
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

// ess-simulator.js
// ESS Side Simulator - Tests only implemented endpoints in server.js

const axios = require('axios');
const crypto = require('crypto');
const winston = require('winston');

// ==================== CONFIGURATION ====================
const FSP_URL = process.env.FSP_URL || 'http://localhost:3000';
const FSP_CODE = process.env.FSP_CODE || 'FL7407';
const ESS_CODE = process.env.ESS_CODE || 'ESS_UTUMISHI';

// ==================== LOGGING ====================
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: './logs/ess-simulator.log' })
    ]
});

// ==================== XML GENERATION ====================
class ESSMessageGenerator {
    constructor() {
        this.fspCode = FSP_CODE;
        this.sender = ESS_CODE;
    }

    generateMsgId() {
        return `ESS_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    generateXmlDocument(messageType, messageDetails) {
        const msgId = this.generateMsgId();
        const timestamp = new Date().toISOString();

        const xml = `<Document>
  <Data>
    <Header>
      <Sender>${this.sender}</Sender>
      <Receiver>FSPName</Receiver>
      <FSPCode>${this.fspCode}</FSPCode>
      <MsgId>${msgId}</MsgId>
      <MessageType>${messageType}</MessageType>
      <Timestamp>${timestamp}</Timestamp>
    </Header>
    <MessageDetails>
${this.objectToXml(messageDetails, '      ')}
    </MessageDetails>
  </Data>
  <Signature>ESS_SIGNATURE_${crypto.randomBytes(32).toString('base64')}</Signature>
</Document>`;
        return xml;
    }

    objectToXml(obj, indent = '') {
        const lines = [];
        for (const [key, value] of Object.entries(obj)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'object' && !Array.isArray(value)) {
                lines.push(`${indent}<${key}>`);
                lines.push(this.objectToXml(value, indent + '  '));
                lines.push(`${indent}</${key}>`);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    lines.push(`${indent}<${key}>`);
                    lines.push(this.objectToXml(item, indent + '  '));
                    lines.push(`${indent}</${key}>`);
                }
            } else {
                lines.push(`${indent}<${key}>${value}</${key}>`);
            }
        }
        return lines.join('\n');
    }

    // ==================== NEW LOAN REQUESTS (from ESS to FSP) ====================

    loanChargesRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            DesignationCode: 'TZ800186',
            DesignationName: 'ICTO II',
            BasicSalary: '2500000.00',
            NetSalary: '2100000.00',
            OneThirdAmount: '700000.00',
            DeductibleAmount: '1400000.00',
            RetirementDate: '15',
            TermsOfEmployment: 'Permanent and Pensionable',
            RequestedAmount: '5000000',
            DesiredDeductibleAmount: '200000',
            Tenure: '24',
            FSPCode: FSP_CODE,
            ProductCode: 'P001',
            VoteCode: 'VOTE001',
            TotalEmployeeDeduction: '500000',
            JobClassCode: 'JB0012'
        };
        return this.generateXmlDocument('LOAN_CHARGES_REQUEST', { ...defaultData, ...data });
    }

    loanOfferRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            Sex: 'M',
            EmploymentDate: '2020-07-01',
            MaritalStatus: 'Married',
            ConfirmationDate: '2021-07-01',
            BankAccountNumber: '011445888578',
            NearestBranchName: 'A Manyoni',
            NearestBranchCode: 'AX002',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            NIN: '19870527111450000124',
            DesignationCode: 'TZ800186',
            DesignationName: 'ICTO II',
            BasicSalary: '2500000.00',
            NetSalary: '2100000.00',
            OneThirdAmount: '700000.00',
            TotalEmployeeDeduction: '500000.00',
            RetirementDate: '15',
            TermsOfEmployment: 'Permanent and Pensionable',
            RequestedAmount: '5000000',
            DesiredDeductibleAmount: '200000',
            Tenure: '24',
            FSPCode: FSP_CODE,
            ProductCode: 'P001',
            InterestRate: '10.00',
            ProcessingFee: '2.00',
            Insurance: '0.75',
            PhysicalAddress: 'Dar es Salaam',
            TelephoneNumber: '0712345678',
            EmailAddress: 'juma.mali@example.com',
            MobileNumber: '0758484339',
            ApplicationNumber: `APP${Date.now()}`,
            LoanPurpose: 'Home renovation',
            ContractStartDate: '2020-07-01',
            ContractEndDate: '2030-07-01',
            SwiftCode: 'AXBOTZTZ',
            Funding: 'OS'
        };
        return this.generateXmlDocument('LOAN_OFFER_REQUEST', { ...defaultData, ...data });
    }

    loanFinalApprovalNotification(data = {}) {
        const defaultData = {
            ApplicationNumber: 'APP1734567890',
            Reason: 'Loan approved by employer',
            FSPReferenceNumber: 'FSP123456',
            LoanNumber: 'LN1001',
            Approval: 'APPROVED'
        };
        return this.generateXmlDocument('LOAN_FINAL_APPROVAL_NOTIFICATION', { ...defaultData, ...data });
    }

    loanCancellationNotification(data = {}) {
        const defaultData = {
            ApplicationNumber: 'APP1734567890',
            Reason: 'Employee changed mind',
            FSPReferenceNumber: 'FSP123456',
            LoanNumber: 'LN1001'
        };
        return this.generateXmlDocument('LOAN_CANCELLATION_NOTIFICATION', { ...defaultData, ...data });
    }

    // ==================== TOP UP REQUESTS ====================

    topUpPayOffBalanceRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            LoanNumber: 'LN1001',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            DeductionAmount: '250000',
            DeductionCode: 'DED001',
            DeductionName: 'Loan Deduction',
            DeductionBalance: '2500000',
            PaymentOption: 'Full payment'
        };
        return this.generateXmlDocument('TOP_UP_PAY_0FF_BALANCE_REQUEST', { ...defaultData, ...data });
    }

    topUpOfferRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            Sex: 'M',
            EmploymentDate: '2020-07-01',
            MaritalStatus: 'Married',
            ConfirmationDate: '2021-07-01',
            BankAccountNumber: '011445888578',
            NearestBranchName: 'A Manyoni',
            NearestBranchCode: 'AX002',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            NIN: '19870527111450000124',
            DesignationCode: 'TZ800186',
            DesignationName: 'ICTO II',
            BasicSalary: '2500000.00',
            NetSalary: '2100000.00',
            OneThirdAmount: '700000.00',
            TotalEmployeeDeduction: '500000.00',
            RetirementDate: '15',
            TermsOfEmployment: 'Permanent and Pensionable',
            RequestedAmount: '3000000',
            DesiredDeductibleAmount: '150000',
            Tenure: '12',
            FSPCode: FSP_CODE,
            ProductCode: 'P001',
            InterestRate: '10.00',
            ProcessingFee: '2.00',
            Insurance: '0.75',
            PhysicalAddress: 'Dar es Salaam',
            TelephoneNumber: '0712345678',
            EmailAddress: 'juma.mali@example.com',
            MobileNumber: '0758484339',
            ApplicationNumber: `TP${Date.now()}`,
            LoanPurpose: 'Top up for car purchase',
            ContractStartDate: '2020-07-01',
            ContractEndDate: '2030-07-01',
            LoanNumber: 'LN1001',
            SettlementAmount: '2500000',
            SwiftCode: 'AXBOTZTZ',
            Funding: 'OS'
        };
        return this.generateXmlDocument('TOP_UP_OFFER_REQUEST', { ...defaultData, ...data });
    }

    // ==================== RESTRUCTURING REQUESTS ====================

    loanRestructureBalanceRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            LoanNumber: 'LN1001',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            DeductionAmount: '250000',
            DeductionCode: 'DED001',
            DeductionName: 'Loan Deduction',
            DeductionBalance: '2500000',
            PaymentOption: 'Full payment'
        };
        return this.generateXmlDocument('LOAN_RESTRUCTURE_BALANCE_REQUEST', { ...defaultData, ...data });
    }

    loanRestructureAffordabilityRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            DesignationCode: 'TZ800186',
            DesignationName: 'ICTO II',
            BasicSalary: '2500000.00',
            NetSalary: '2100000.00',
            OneThirdAmount: '700000.00',
            DeductibleAmount: '1400000.00',
            RetirementDate: '15',
            TermsOfEmployment: 'Permanent and Pensionable',
            RequestedAmount: '3000000',
            DesiredDeductibleAmount: '150000',
            Tenure: '36',
            FSPCode: FSP_CODE,
            ProductCode: 'P001',
            VoteCode: 'VOTE001',
            TotalEmployeeDeduction: '500000',
            JobClassCode: 'JB0012',
            LoanNumber: 'LN1001'
        };
        return this.generateXmlDocument('LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST', { ...defaultData, ...data });
    }

    loanRestructureRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            Sex: 'M',
            EmploymentDate: '2020-07-01',
            MaritalStatus: 'Married',
            NearestBranchName: 'A Manyoni',
            NearestBranchCode: 'AX002',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            NIN: '19870527111450000124',
            DesignationCode: 'TZ800186',
            DesignationName: 'ICTO II',
            BasicSalary: '2500000.00',
            NetSalary: '2100000.00',
            OneThirdAmount: '700000.00',
            TotalEmployeeDeduction: '500000.00',
            RetirementDate: '15',
            TermsOfEmployment: 'Permanent and Pensionable',
            DesiredDeductibleAmount: '150000',
            Tenure: '36',
            FSPCode: FSP_CODE,
            ProductCode: 'P001',
            InterestRate: '10.00',
            ProcessingFee: '2.00',
            Insurance: '0.75',
            PhysicalAddress: 'Dar es Salaam',
            EmailAddress: 'juma.mali@example.com',
            MobileNumber: '0758484339',
            ApplicationNumber: `RS${Date.now()}`,
            ContractStartDate: '2020-07-01',
            ContractEndDate: '2030-07-01',
            LoanNumber: 'LN1001',
            Funding: 'OS',
            FSPReferenceNumber: 'REST123456',
            LoanPurpose: 'Reduce monthly payments'
        };
        return this.generateXmlDocument('LOAN_RESTRUCTURE_REQUEST', { ...defaultData, ...data });
    }

    loanRestructureRejection(data = {}) {
        const defaultData = {
            ApplicationNumber: 'RS1734567890',
            Reason: 'Employee declined restructure offer',
            FSPReferenceNumber: 'REST123456',
            LoanNumber: 'LN1001'
        };
        return this.generateXmlDocument('LOAN_RESTRUCTURE_REJECTION', { ...defaultData, ...data });
    }

    loanRestructureRequestFSP(data = {}) {
        const defaultData = {
            ApplicationNumber: `RS${Date.now()}`,
            LoanNumber: 'LN1001',
            OutstandingBalance: '2500000',
            PrincipalBalance: '2000000',
            InstallmentAmount: '250000',
            LastRepaymentDate: new Date().toISOString(),
            MaturityDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            ValidityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            Reason: 'Financial hardship',
            NewInstallmentAmount: '150000',
            NewInsuranceAmount: '5000',
            NewProcessingFee: '1000',
            NewInterestAmount: '50000',
            NewPrincipalAmount: '2000000',
            NewTotalAmountPayable: '2500000',
            OtherCharges: '0',
            NewTenure: '48',
            ProductCode: 'P001',
            DeductionCode: 'DED001',
            FSPReferenceNumber: `FSP_REST_${Date.now()}`
        };
        return this.generateXmlDocument('LOAN_RESTRUCTURE_REQUEST_FSP', { ...defaultData, ...data });
    }

    // ==================== TAKEOVER REQUESTS ====================

    takeoverPayOffBalanceRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            LoanNumber: 'LN1001',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            DeductionAmount: '250000',
            DeductionCode: 'DED001',
            DeductionName: 'Loan Deduction',
            DeductionBalance: '2500000',
            PaymentOption: 'Full Payment'
        };
        return this.generateXmlDocument('TAKEOVER_PAY_OFF_BALANCE_REQUEST', { ...defaultData, ...data });
    }

    loanTakeoverOfferRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            Sex: 'M',
            EmploymentDate: '2020-07-01',
            MaritalStatus: 'Married',
            ConfirmationDate: '2021-07-01',
            BankAccountNumber: '011445888578',
            NearestBranchName: 'A Manyoni',
            NearestBranchCode: 'AX002',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            NIN: '19870527111450000124',
            DesignationCode: 'TZ800186',
            DesignationName: 'ICTO II',
            BasicSalary: '2500000.00',
            NetSalary: '2100000.00',
            OneThirdAmount: '700000.00',
            DeductibleAmount: '1400000.00',
            TotalEmployeeDeduction: '500000.00',
            RetirementDate: '15',
            TermsOfEmployment: 'Permanent and Pensionable',
            RequestedAmount: '6000000',
            DesiredDeductibleAmount: '250000',
            Tenure: '36',
            FSPCode: FSP_CODE,
            ProductCode: 'P002',
            InterestRate: '9.00',
            ProcessingFee: '1.50',
            Insurance: '0.50',
            PhysicalAddress: 'Dar es Salaam',
            TelephoneNumber: '0712345678',
            EmailAddress: 'juma.mali@example.com',
            MobileNumber: '0758484339',
            ApplicationNumber: `TK${Date.now()}`,
            LoanPurpose: 'Takeover existing loan',
            ContractStartDate: '2020-07-01',
            ContractEndDate: '2030-07-01',
            SwiftCode: 'AXBOTZTZ',
            Funding: 'OS',
            FSP1Code: 'FSP001',
            FSP1SWIFTCode: 'OLD001TZ',
            FSP1BankAccount: '1234567890',
            FSP1BankAccountName: 'Old Bank',
            FSP1MNOChannel: '0755000000',
            FSP1LoanNumber: 'OLD-LN-1001',
            FSP1PaymentReferenceNumber: 'REF123456',
            FSP1FinalPaymentDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            TakeOverAmount: '3500000'
        };
        return this.generateXmlDocument('LOAN_TAKEOVER_OFFER_REQUEST', { ...defaultData, ...data });
    }

    takeoverPaymentNotification(data = {}) {
        const defaultData = {
            ApplicationNumber: 'TK1734567890',
            LoanNumber: 'LN1001',
            Reason: 'Payment completed',
            FSPReferenceNumber: 'TK123456',
            PaymentReferenceNumber: 'PAY123456',
            TotalPayoffAmount: '3500000',
            PaymentDate: new Date().toISOString(),
            PaymentAdvice: 'MT103',
            PaymentAdviceAttachment: 'base64encodedpdfcontent'
        };
        return this.generateXmlDocument('TAKEOVER_PAYMENT_NOTIFICATION', { ...defaultData, ...data });
    }

    // ==================== REPAYMENT REQUESTS ====================

    fspRepaymentRequest(data = {}) {
        const defaultData = {
            DeductionCode: 'DED001',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            CheckNumber: '111222333',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            FSPCode: FSP_CODE,
            PayDate: new Date().toISOString()
        };
        return this.generateXmlDocument('FSP_REPAYMENT_REQUEST', { ...defaultData, ...data });
    }

    fullLoanRepaymentRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            LoanNumber: 'LN1001',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            DeductionAmount: '2500000',
            DeductionCode: 'DED001',
            DeductionName: 'Loan Deduction',
            DeductionBalance: '2500000',
            FSPCode: FSP_CODE,
            PaymentOption: 'Full payment'
        };
        return this.generateXmlDocument('FULL_LOAN_REPAYMENT_REQUEST', { ...defaultData, ...data });
    }

    partialLoanRepaymentRequest(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            LoanNumber: 'LN1001',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali',
            VoteCode: 'VOTE001',
            VoteName: 'Ministry of Finance',
            DeductionAmount: '500000',
            DeductionCode: 'DED001',
            DeductionName: 'Loan Deduction',
            DeductionBalance: '2500000',
            FSPCode: FSP_CODE,
            PaymentOption: 'Partial Payment',
            Intention: 'reduce_tenure',
            AmountToPay: '1000000'
        };
        return this.generateXmlDocument('PARTIAL_LOAN_REPAYMENT_REQUEST', { ...defaultData, ...data });
    }

    fspMonthlyDeductions(data = {}) {
        const defaultData = {
            MessageSummary: {
                BatchRecordSize: '2',
                BatchNumber: '1',
                TotalBatch: '1',
                PayrollDate: new Date().toISOString().split('T')[0]
            },
            DeductionRecord: [
                {
                    ApplicationNumber: 'APP1734567890',
                    LoanNumber: 'LN1001',
                    CheckNumber: '111222333',
                    FirstName: 'Juma',
                    LastName: 'Mali',
                    MiddleName: 'Ponda',
                    NationalId: '19870527111450000124',
                    VoteCode: 'VOTE001',
                    VoteName: 'Ministry of Finance',
                    DepartmentCode: 'DEPT01',
                    DepartmentName: 'ICT',
                    DeductionCode: 'DED001',
                    DeductionDescription: 'Monthly Loan Repayment',
                    BalanceAmount: '2000000',
                    DeductionAmount: '250000',
                    HasStopPay: 'false',
                    CheckDate: new Date().toISOString().split('T')[0]
                }
            ]
        };
        return this.generateXmlDocument('FSP_MONTHLY_DEDUCTIONS', defaultData);
    }

    // ==================== STATUS REQUESTS ====================

    loanStatusRequest(data = {}) {
        const defaultData = {
            ApplicationNumber: 'APP1734567890'
        };
        return this.generateXmlDocument('LOAN_STATUS_REQUEST', { ...defaultData, ...data });
    }

    // ==================== DEFAULTER REQUESTS ====================

    defaulterDetailsToFSP(data = {}) {
        const defaultData = {
            CheckNumber: '111222333',
            LoanNumber: 'LN1001',
            FSPCode: FSP_CODE,
            LastPaymentDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
            EmploymentStatus: 'ACTIVE',
            WorkStation: 'Dar es Salaam',
            PhysicalAddress: 'Box 1234, Dar es Salaam',
            TelephoneNumber: '0221234567',
            EmailAddress: 'juma.mali@example.com',
            MobileNumber: '0758484339',
            ContactPerson: 'HR Department',
            Institution: 'Ministry of Finance'
        };
        return this.generateXmlDocument('DEFAULTER_DETAILS_TO_FSP', { ...defaultData, ...data });
    }

    deductionStopNotification(data = {}) {
        const defaultData = {
            ApplicationNumber: 'APP1734567890',
            LoanNumber: 'LN1001',
            CheckNumber: '111222333',
            DeductionCode: 'DED001',
            DeductionDescription: 'Monthly Loan Repayment',
            BalanceAmount: '2000000',
            DeductionAmount: '250000',
            StopReason: 'Employee on leave without pay',
            StopDate: new Date().toISOString()
        };
        return this.generateXmlDocument('DEDUCTION_STOP_NOTIFICATION', { ...defaultData, ...data });
    }

    // ==================== ACCOUNT & BRANCHES ====================

    accountValidation(data = {}) {
        const defaultData = {
            AccountNumber: '011445888578',
            FirstName: 'Juma',
            MiddleName: 'Ponda',
            LastName: 'Mali'
        };
        return this.generateXmlDocument('ACCOUNT_VALIDATION', { ...defaultData, ...data });
    }

    fspBranchesRequest() {
        return this.generateXmlDocument('FSP_BRANCHES', {});
    }
}

// ==================== ESS SIMULATOR ====================
class ESSSimulator {
    constructor(fspUrl) {
        this.fspUrl = fspUrl;
        this.generator = new ESSMessageGenerator();
        this.results = [];
    }

    async sendMessage(xml, messageName) {
        try {
            logger.info(`Sending ${messageName}...`);
            const response = await axios.post(this.fspUrl, xml, {
                headers: {
                    'Content-Type': 'application/xml',
                    'Accept': 'application/xml'
                },
                timeout: 30000
            });
            
            logger.info(`✓ ${messageName} - Status: ${response.status}`);
            this.results.push({
                message: messageName,
                status: response.status,
                success: true
            });
            return { success: true, data: response.data };
        } catch (error) {
            logger.error(`✗ ${messageName} - Failed: ${error.message}`);
            this.results.push({
                message: messageName,
                status: error.response?.status || 500,
                success: false,
                error: error.message
            });
            return { success: false, error: error.message };
        }
    }

    async runAllTests() {
        logger.info('========================================');
        logger.info('Starting ESS Simulator Tests');
        logger.info(`FSP URL: ${this.fspUrl}`);
        logger.info('========================================\n');

        // Account & Branches
        await this.sendMessage(this.generator.accountValidation(), 'Account Validation');
        await this.sendMessage(this.generator.fspBranchesRequest(), 'FSP Branches Request');

        // New Loan
        await this.sendMessage(this.generator.loanChargesRequest(), 'Loan Charges Request');
        const loanOfferXml = this.generator.loanOfferRequest();
        await this.sendMessage(loanOfferXml, 'Loan Offer Request');
        
        const appMatch = loanOfferXml.match(/<ApplicationNumber>([^<]+)<\/ApplicationNumber>/);
        const applicationNumber = appMatch ? appMatch[1] : 'APP1734567890';
        
        await this.sendMessage(this.generator.loanFinalApprovalNotification({ ApplicationNumber: applicationNumber }), 'Loan Final Approval Notification');
        await this.sendMessage(this.generator.loanCancellationNotification(), 'Loan Cancellation Notification');

        // Top Up
        await this.sendMessage(this.generator.topUpPayOffBalanceRequest(), 'Top Up Pay Off Balance Request');
        await this.sendMessage(this.generator.topUpOfferRequest(), 'Top Up Offer Request');

        // Restructuring
        await this.sendMessage(this.generator.loanRestructureBalanceRequest(), 'Loan Restructure Balance Request');
        await this.sendMessage(this.generator.loanRestructureAffordabilityRequest(), 'Loan Restructure Affordability Request');
        await this.sendMessage(this.generator.loanRestructureRequest(), 'Loan Restructure Request');
        await this.sendMessage(this.generator.loanRestructureRejection(), 'Loan Restructure Rejection');
        await this.sendMessage(this.generator.loanRestructureRequestFSP(), 'Loan Restructure Request FSP');

        // Takeover
        await this.sendMessage(this.generator.takeoverPayOffBalanceRequest(), 'Takeover Pay Off Balance Request');
        await this.sendMessage(this.generator.loanTakeoverOfferRequest(), 'Loan Takeover Offer Request');
        await this.sendMessage(this.generator.takeoverPaymentNotification(), 'Takeover Payment Notification');

        // Repayments
        await this.sendMessage(this.generator.fspRepaymentRequest(), 'FSP Repayment Request');
        await this.sendMessage(this.generator.fullLoanRepaymentRequest(), 'Full Loan Repayment Request');
        await this.sendMessage(this.generator.partialLoanRepaymentRequest(), 'Partial Loan Repayment Request');
        await this.sendMessage(this.generator.fspMonthlyDeductions(), 'FSP Monthly Deductions');

        // Status
        await this.sendMessage(this.generator.loanStatusRequest(), 'Loan Status Request');

        // Defaulter
        await this.sendMessage(this.generator.defaulterDetailsToFSP(), 'Defaulter Details to FSP');
        await this.sendMessage(this.generator.deductionStopNotification(), 'Deduction Stop Notification');

        this.printSummary();
    }

    async runSpecificTest(testName, data = {}) {
        const methods = {
            'accountValidation': () => this.generator.accountValidation(data),
            'fspBranches': () => this.generator.fspBranchesRequest(),
            'loanCharges': () => this.generator.loanChargesRequest(data),
            'loanOffer': () => this.generator.loanOfferRequest(data),
            'loanApproval': () => this.generator.loanFinalApprovalNotification(data),
            'loanCancellation': () => this.generator.loanCancellationNotification(data),
            'topUpBalance': () => this.generator.topUpPayOffBalanceRequest(data),
            'topUpOffer': () => this.generator.topUpOfferRequest(data),
            'restructureBalance': () => this.generator.loanRestructureBalanceRequest(data),
            'restructureAffordability': () => this.generator.loanRestructureAffordabilityRequest(data),
            'restructureRequest': () => this.generator.loanRestructureRequest(data),
            'restructureRejection': () => this.generator.loanRestructureRejection(data),
            'restructureRequestFSP': () => this.generator.loanRestructureRequestFSP(data),
            'takeoverBalance': () => this.generator.takeoverPayOffBalanceRequest(data),
            'takeoverOffer': () => this.generator.loanTakeoverOfferRequest(data),
            'takeoverPayment': () => this.generator.takeoverPaymentNotification(data),
            'fspRepayment': () => this.generator.fspRepaymentRequest(data),
            'fullRepayment': () => this.generator.fullLoanRepaymentRequest(data),
            'partialRepayment': () => this.generator.partialLoanRepaymentRequest(data),
            'monthlyDeductions': () => this.generator.fspMonthlyDeductions(data),
            'loanStatus': () => this.generator.loanStatusRequest(data),
            'defaulterDetails': () => this.generator.defaulterDetailsToFSP(data),
            'deductionStop': () => this.generator.deductionStopNotification(data)
        };

        const method = methods[testName];
        if (!method) {
            logger.error(`Unknown test: ${testName}`);
            logger.info(`Available tests: ${Object.keys(methods).join(', ')}`);
            return;
        }

        const xml = method();
        await this.sendMessage(xml, testName);
        this.printSummary();
    }

    printSummary() {
        const total = this.results.length;
        const passed = this.results.filter(r => r.success).length;
        const failed = total - passed;

        logger.info('\n========================================');
        logger.info('TEST SUMMARY');
        logger.info('========================================');
        logger.info(`Total Tests: ${total}`);
        logger.info(`Passed: ${passed}`);
        logger.info(`Failed: ${failed}`);
        
        if (failed > 0) {
            logger.info('\nFailed Tests:');
            this.results.filter(r => !r.success).forEach(r => {
                logger.info(`  - ${r.message}: ${r.error}`);
            });
        }
        logger.info('========================================\n');
    }
}

// ==================== COMMAND LINE INTERFACE ====================
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const testName = args[1];

    const simulator = new ESSSimulator(FSP_URL);

    if (command === 'test' && testName) {
        await simulator.runSpecificTest(testName);
    } else if (command === 'all') {
        await simulator.runAllTests();
    } else if (command === 'watch') {
        logger.info('Starting watch mode - will run tests every 30 seconds');
        setInterval(async () => {
            logger.info('\n=== Running test cycle ===');
            await simulator.runAllTests();
        }, 30000);
    } else {
        logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                    ESS SIMULATOR                              ║
║            e-MKOPO API Testing Tool                           ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  node ess-simulator.js all                    - Run all tests
  node ess-simulator.js test <name>            - Run specific test
  node ess-simulator.js watch                  - Run tests every 30 seconds

Available Tests (Implemented in server.js):
  accountValidation      - Validate employee bank account
  fspBranches           - Get FSP branches list
  loanCharges           - Calculate loan charges
  loanOffer             - Submit loan offer request
  loanApproval          - Send final approval notification
  loanCancellation      - Cancel loan request
  topUpBalance          - Request top up payoff balance
  topUpOffer            - Submit top up offer
  restructureBalance    - Request restructure balance
  restructureAffordability - Check restructure affordability
  restructureRequest    - Submit restructure request
  restructureRejection  - Reject restructure request
  restructureRequestFSP - FSP initiated restructure
  takeoverBalance       - Request takeover balance
  takeoverOffer         - Submit takeover offer
  takeoverPayment       - Send takeover payment notification
  fspRepayment          - FSP repayment request
  fullRepayment         - Request full repayment
  partialRepayment      - Request partial repayment
  monthlyDeductions     - Send monthly deductions
  loanStatus            - Check loan status
  defaulterDetails      - Send defaulter details
  deductionStop         - Send deduction stop notification

Examples:
  node ess-simulator.js all
  node ess-simulator.js test loanOffer
  node ess-simulator.js watch
        `);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ESSSimulator, ESSMessageGenerator };
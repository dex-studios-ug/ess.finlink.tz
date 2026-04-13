// ess-simulator.js
// ESS Side Simulator - Sends e-MKOPO API requests to FSP Server
// Simulates all 60+ message types from the API documentation

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// ==================== CONFIGURATION ====================
const FSP_URL = process.env.FSP_URL || 'http://localhost:3000/api/ess';
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

    generateXmlDocument(messageType, messageDetails, isArray = false) {
        const msgId = this.generateMsgId();
        const timestamp = new Date().toISOString();

        let detailsXml = '';
        if (isArray && Array.isArray(messageDetails)) {
            for (const item of messageDetails) {
                detailsXml += this.objectToXml(item, '        ');
            }
        } else {
            detailsXml = this.objectToXml(messageDetails, '      ');
        }

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
${detailsXml}
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
    // ==================== ADD THESE NEW TEST CASES TO ess-simulator.js ====================
// Add these methods to the ESSMessageGenerator class

// ==================== UI NOTIFICATION TEST CASES ====================

loanInitialApprovalNotification(data = {}) {
    const defaultData = {
        ApplicationNumber: `APP${Date.now()}`,
        Reason: 'Loan approved by FSP',
        FSPReferenceNumber: `FSP${Date.now()}`,
        LoanNumber: `LN${Date.now()}`,
        TotalAmountToPay: '5000000.00',
        OtherCharges: '2500.00',
        Approval: 'APPROVED'
    };
    
    return this.generateXmlDocument('LOAN_INITIAL_APPROVAL_NOTIFICATION', { ...defaultData, ...data });
}

loanDisbursementNotification(data = {}) {
    const defaultData = {
        ApplicationNumber: `APP${Date.now()}`,
        FSPReferenceNumber: `FSP${Date.now()}`,
        LoanNumber: `LN${Date.now()}`,
        TotalAmountToPay: '5000000.00',
        DisbursementDate: new Date().toISOString()
    };
    
    return this.generateXmlDocument('LOAN_DISBURSEMENT_NOTIFICATION', { ...defaultData, ...data });
}

loanDisbursementFailureNotification(data = {}) {
    const defaultData = {
        ApplicationNumber: `APP${Date.now()}`,
        Reason: 'Bank account validation failed'
    };
    
    return this.generateXmlDocument('LOAN_DISBURSEMENT_FAILURE_NOTIFICATION', { ...defaultData, ...data });
}

loanRestructureAffordabilityRequestUI(data = {}) {
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
        FSPCode: 'FL7407',
        ProductCode: 'P001',
        VoteCode: 'VOTE001',
        TotalEmployeeDeduction: '500000',
        JobClassCode: 'JB0012',
        LoanNumber: 'LN1001'
    };
    
    return this.generateXmlDocument('LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST', { ...defaultData, ...data });
}

loanCancellationNotificationUI(data = {}) {
    const defaultData = {
        ApplicationNumber: `APP${Date.now()}`,
        Reason: 'Employee requested cancellation',
        FSPReferenceNumber: `FSP${Date.now()}`,
        LoanNumber: `LN${Date.now()}`
    };
    
    return this.generateXmlDocument('LOAN_CANCELLATION_NOTIFICATION', { ...defaultData, ...data });
}

takeoverDisbursementNotification(data = {}) {
    const defaultData = {
        ApplicationNumber: `TK${Date.now()}`,
        FSPReferenceNumber: `FSP${Date.now()}`,
        LoanNumber: `LN${Date.now()}`,
        TotalAmountToPay: '6000000.00',
        DisbursementDate: new Date().toISOString(),
        Reason: 'Takeover disbursement completed',
        PaymentAdvice: 'MT103',
        PaymentAdviceAttachment: 'base64encodedpdfcontent'
    };
    
    return this.generateXmlDocument('TAKEOVER_DISBURSEMENT_NOTIFICATION', { ...defaultData, ...data });
}

paymentAcknowledgmentNotificationUI(data = {}) {
    const defaultData = {
        ApplicationNumber: `TK${Date.now()}`,
        Remarks: 'Payment settled successfully',
        FSPReferenceNumber: `FSP${Date.now()}`,
        PaymentStatus: 'SETTLED',
        LoanNumber: `LN${Date.now()}`
    };
    
    return this.generateXmlDocument('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION', { ...defaultData, ...data });
}

fullLoanRepaymentNotificationUI(data = {}) {
    const defaultData = {
        CheckNumber: '111222333',
        ApplicationNumber: `APP${Date.now()}`,
        LoanNumber: `LN${Date.now()}`,
        PaymentReference: `PAY${Date.now()}`,
        DeductionCode: 'DED001',
        PaymentDescription: 'Full loan repayment',
        PaymentDate: new Date().toISOString(),
        PaymentAmount: '2500000.00',
        LoanBalance: '0.00'
    };
    
    return this.generateXmlDocument('FULL_LOAN_REPAYMENT_NOTIFICATION', { ...defaultData, ...data });
}

loanLiquidationNotification(data = {}) {
    const defaultData = {
        ApplicationNumber: `APP${Date.now()}`,
        LoanNumber: `LN${Date.now()}`,
        Remarks: 'Loan fully paid and closed'
    };
    
    return this.generateXmlDocument('LOAN_LIQUIDATION_NOTIFICATION', { ...defaultData, ...data });
}

defaulterDetailsToEmployer(data = {}) {
    const defaultData = {
        CheckNumber: '111222333',
        LoanNumber: 'LN1001',
        FirstName: 'Juma',
        MiddleName: 'Ponda',
        LastName: 'Mali',
        VoteCode: 'VOTE001',
        VoteName: 'Ministry of Finance',
        InstallationAmount: '250000',
        DeductionCode: 'DED001',
        DeductionName: 'Loan Deduction',
        OutstandingBalance: '2500000',
        LastPayDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        FSPCode: 'FL7407'
    };
    
    return this.generateXmlDocument('DEFAULTER_DETAILS_TO_EMPLOYER', { ...defaultData, ...data });
}

    // ==================== NEW LOAN MESSAGES ====================

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

    // ==================== TOP UP MESSAGES ====================

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

    // ==================== RESTRUCTURING MESSAGES ====================

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

    // ==================== TAKEOVER MESSAGES ====================

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

    paymentAcknowledgmentNotification(data = {}) {
        const defaultData = {
            ApplicationNumber: 'TK1734567890',
            Remarks: 'Payment settled successfully',
            FSPReferenceNumber: 'TK123456',
            PaymentStatus: 'SETTLED',
            LoanNumber: 'LN1001'
        };
        
        return this.generateXmlDocument('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION', { ...defaultData, ...data });
    }

    // ==================== REPAYMENT MESSAGES ====================

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
                },
                {
                    ApplicationNumber: 'APP1734567891',
                    LoanNumber: 'LN1002',
                    CheckNumber: '444555666',
                    FirstName: 'Asha',
                    LastName: 'John',
                    MiddleName: 'Mohamed',
                    NationalId: '19900515123450000123',
                    VoteCode: 'VOTE002',
                    VoteName: 'Ministry of Health',
                    DepartmentCode: 'DEPT02',
                    DepartmentName: 'Administration',
                    DeductionCode: 'DED002',
                    DeductionDescription: 'Monthly Loan Repayment',
                    BalanceAmount: '1500000',
                    DeductionAmount: '200000',
                    HasStopPay: 'false',
                    CheckDate: new Date().toISOString().split('T')[0]
                }
            ]
        };
        
        // Merge with provided data
        const merged = { ...defaultData, ...data };
        return this.generateXmlDocument('FSP_MONTHLY_DEDUCTIONS', merged, true);
    }

    // ==================== STATUS MESSAGES ====================

    loanStatusRequest(data = {}) {
        const defaultData = {
            ApplicationNumber: 'APP1734567890'
        };
        
        return this.generateXmlDocument('LOAN_STATUS_REQUEST', { ...defaultData, ...data });
    }

    // ==================== DEFAULTER MESSAGES ====================

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

    // ==================== ACCOUNT VALIDATION MESSAGES ====================

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
                success: true,
                response: response.data
            });
            logger.info(`Response for ${messageName}:\n${response.data}\n`);
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

        // Test 1: Account Validation
        await this.sendMessage(this.generator.accountValidation(), 'Account Validation');

        // Test 2: FSP Branches
        await this.sendMessage(this.generator.fspBranchesRequest(), 'FSP Branches Request');

        // Test 3: Loan Charges Request
        await this.sendMessage(this.generator.loanChargesRequest(), 'Loan Charges Request');

        // Test 4: Loan Offer Request
        const loanOfferXml = this.generator.loanOfferRequest();
        await this.sendMessage(loanOfferXml, 'Loan Offer Request');

        // Extract application number for later tests
        const appMatch = loanOfferXml.match(/<ApplicationNumber>([^<]+)<\/ApplicationNumber>/);
        const applicationNumber = appMatch ? appMatch[1] : 'APP1734567890';

        // Test 5: Loan Final Approval Notification
        await this.sendMessage(this.generator.loanFinalApprovalNotification({ ApplicationNumber: applicationNumber }), 'Loan Final Approval Notification');

        // Test 6: Top Up Pay Off Balance Request
        await this.sendMessage(this.generator.topUpPayOffBalanceRequest(), 'Top Up Pay Off Balance Request');

        // Test 7: Top Up Offer Request
        await this.sendMessage(this.generator.topUpOfferRequest(), 'Top Up Offer Request');

        // Test 8: Loan Restructure Balance Request
        await this.sendMessage(this.generator.loanRestructureBalanceRequest(), 'Loan Restructure Balance Request');

        // Test 9: Loan Restructure Affordability Request
        await this.sendMessage(this.generator.loanRestructureAffordabilityRequest(), 'Loan Restructure Affordability Request');

        // Test 10: Loan Restructure Request
        await this.sendMessage(this.generator.loanRestructureRequest(), 'Loan Restructure Request');

        // Test 11: Takeover Pay Off Balance Request
        await this.sendMessage(this.generator.takeoverPayOffBalanceRequest(), 'Takeover Pay Off Balance Request');

        // Test 12: Loan Takeover Offer Request
        await this.sendMessage(this.generator.loanTakeoverOfferRequest(), 'Loan Takeover Offer Request');

        // Test 13: FSP Repayment Request
        await this.sendMessage(this.generator.fspRepaymentRequest(), 'FSP Repayment Request');

        // Test 14: Full Loan Repayment Request
        await this.sendMessage(this.generator.fullLoanRepaymentRequest(), 'Full Loan Repayment Request');

        // Test 15: Partial Loan Repayment Request
        await this.sendMessage(this.generator.partialLoanRepaymentRequest(), 'Partial Loan Repayment Request');

        // Test 16: FSP Monthly Deductions
        await this.sendMessage(this.generator.fspMonthlyDeductions(), 'FSP Monthly Deductions');

        // Test 17: Loan Status Request
        await this.sendMessage(this.generator.loanStatusRequest(), 'Loan Status Request');

        // Test 18: Defaulter Details to FSP
        await this.sendMessage(this.generator.defaulterDetailsToFSP(), 'Defaulter Details to FSP');

        // Test 19: Deduction Stop Notification
        await this.sendMessage(this.generator.deductionStopNotification(), 'Deduction Stop Notification');

        // Test 20: Loan Cancellation Notification
        await this.sendMessage(this.generator.loanCancellationNotification(), 'Loan Cancellation Notification');

        // Test 21: Loan Restructure Rejection
        await this.sendMessage(this.generator.loanRestructureRejection(), 'Loan Restructure Rejection');

        // Test 22: Takeover Payment Notification
        await this.sendMessage(this.generator.takeoverPaymentNotification(), 'Takeover Payment Notification');

        // Test 23: Payment Acknowledgment Notification
        await this.sendMessage(this.generator.paymentAcknowledgmentNotification(), 'Payment Acknowledgment Notification');

        // Test 24: LOAN_INITIAL_APPROVAL_NOTIFICATION
    await this.sendMessage(this.generator.loanInitialApprovalNotification(), 'LOAN_INITIAL_APPROVAL_NOTIFICATION');

    // Test 25: LOAN_DISBURSEMENT_NOTIFICATION
    await this.sendMessage(this.generator.loanDisbursementNotification(), 'LOAN_DISBURSEMENT_NOTIFICATION');

    // Test 26: LOAN_DISBURSEMENT_FAILURE_NOTIFICATION
    await this.sendMessage(this.generator.loanDisbursementFailureNotification(), 'LOAN_DISBURSEMENT_FAILURE_NOTIFICATION');

    // Test 27: LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST
    await this.sendMessage(this.generator.loanRestructureAffordabilityRequestUI(), 'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST');

    // Test 28: LOAN_CANCELLATION_NOTIFICATION
    await this.sendMessage(this.generator.loanCancellationNotificationUI(), 'LOAN_CANCELLATION_NOTIFICATION');

    // Test 29: TAKEOVER_DISBURSEMENT_NOTIFICATION
    await this.sendMessage(this.generator.takeoverDisbursementNotification(), 'TAKEOVER_DISBURSEMENT_NOTIFICATION');

    // Test 30: PAYMENT_ACKNOWLEDGMENT_NOTIFICATION
    await this.sendMessage(this.generator.paymentAcknowledgmentNotificationUI(), 'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION');

    // Test 31: FULL_LOAN_REPAYMENT_NOTIFICATION
    await this.sendMessage(this.generator.fullLoanRepaymentNotificationUI(), 'FULL_LOAN_REPAYMENT_NOTIFICATION');

    // Test 32: LOAN_LIQUIDATION_NOTIFICATION
    await this.sendMessage(this.generator.loanLiquidationNotification(), 'LOAN_LIQUIDATION_NOTIFICATION');

    // Test 33: DEFAULTER_DETAILS_TO_EMPLOYER
    await this.sendMessage(this.generator.defaulterDetailsToEmployer(), 'DEFAULTER_DETAILS_TO_EMPLOYER');

        // Print Summary
        this.printSummary();
    }

    async runSpecificTest(testName, data = {}) {
        const methods = {

            // ui tests
              'loanInitialApproval': () => this.generator.loanInitialApprovalNotification(data),
        'loanDisbursement': () => this.generator.loanDisbursementNotification(data),
        'loanDisbursementFailure': () => this.generator.loanDisbursementFailureNotification(data),
        'loanRestructureAffordabilityUI': () => this.generator.loanRestructureAffordabilityRequestUI(data),
        'loanCancellationUI': () => this.generator.loanCancellationNotificationUI(data),
        'takeoverDisbursement': () => this.generator.takeoverDisbursementNotification(data),
        'paymentAcknowledgmentUI': () => this.generator.paymentAcknowledgmentNotificationUI(data),
        'fullLoanRepaymentUI': () => this.generator.fullLoanRepaymentNotificationUI(data),
        'loanLiquidation': () => this.generator.loanLiquidationNotification(data),
        'defaulterToEmployer': () => this.generator.defaulterDetailsToEmployer(data),


            'accountValidation': () => this.generator.accountValidation(data),
            'fspBranches': () => this.generator.fspBranchesRequest(),
            'loanCharges': () => this.generator.loanChargesRequest(data),
            'loanOffer': () => this.generator.loanOfferRequest(data),
            'loanApproval': () => this.generator.loanFinalApprovalNotification(data),
            'topUpBalance': () => this.generator.topUpPayOffBalanceRequest(data),
            'topUpOffer': () => this.generator.topUpOfferRequest(data),
            'restructureBalance': () => this.generator.loanRestructureBalanceRequest(data),
            'restructureAffordability': () => this.generator.loanRestructureAffordabilityRequest(data),
            'restructureRequest': () => this.generator.loanRestructureRequest(data),
            'takeoverBalance': () => this.generator.takeoverPayOffBalanceRequest(data),
            'takeoverOffer': () => this.generator.loanTakeoverOfferRequest(data),
            'fullRepayment': () => this.generator.fullLoanRepaymentRequest(data),
            'partialRepayment': () => this.generator.partialLoanRepaymentRequest(data),
            'monthlyDeductions': () => this.generator.fspMonthlyDeductions(data),
            'loanStatus': () => this.generator.loanStatusRequest(data),
            'defaulterDetails': () => this.generator.defaulterDetailsToFSP(data),
            'deductionStop': () => this.generator.deductionStopNotification(data),
            'loanCancellation': () => this.generator.loanCancellationNotification(data),
            'takeoverPayment': () => this.generator.takeoverPaymentNotification(data),
            'paymentAcknowledgment': () => this.generator.paymentAcknowledgmentNotification(data)
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
    const fspUrl = args[2] || FSP_URL;

    const simulator = new ESSSimulator(fspUrl);

    if (command === 'test' && testName) {
        // Run specific test
        await simulator.runSpecificTest(testName);
    } else if (command === 'all') {
        // Run all tests
        await simulator.runAllTests();
    } else if (command === 'watch') {
        // Run tests continuously
        logger.info('Starting watch mode - will run tests every 30 seconds');
        setInterval(async () => {
            logger.info('\n=== Running test cycle ===');
            await simulator.runAllTests();
        }, 30000);
    } else {
        // Interactive mode
        logger.info(`
╔══════════════════════════════════════════════════════════════╗
║                    ESS SIMULATOR                              ║
║            e-MKOPO API Testing Tool                           ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  node ess-simulator.js all [fsp-url]     - Run all tests
  node ess-simulator.js test <name> [url] - Run specific test
  node ess-simulator.js watch [url]       - Run tests every 30 seconds

Available Tests:
  accountValidation      - Validate employee bank account
  fspBranches           - Get FSP branches list
  loanCharges           - Calculate loan charges
  loanOffer             - Submit loan offer request
  loanApproval          - Send final approval notification
  topUpBalance          - Request top up payoff balance
  topUpOffer            - Submit top up offer
  restructureBalance    - Request restructure balance
  restructureAffordability - Check restructure affordability
  restructureRequest    - Submit restructure request
  takeoverBalance       - Request takeover balance
  takeoverOffer         - Submit takeover offer
  fullRepayment         - Request full repayment
  partialRepayment      - Request partial repayment
  monthlyDeductions     - Send monthly deductions
  loanStatus            - Check loan status
  defaulterDetails      - Send defaulter details
  deductionStop         - Send deduction stop notification
  loanCancellation      - Cancel loan request
  takeoverPayment       - Send takeover payment notification
  paymentAcknowledgment - Send payment acknowledgment
  // NEW UI NOTIFICATION TESTS
  loanInitialApproval     - Send loan initial approval notification
  loanDisbursement        - Send loan disbursement notification
  loanDisbursementFailure - Send loan disbursement failure notification
  loanRestructureAffordabilityUI - Send restructure affordability request
  loanCancellationUI      - Send loan cancellation notification
  takeoverDisbursement    - Send takeover disbursement notification
  paymentAcknowledgmentUI - Send payment acknowledgment notification
  fullLoanRepaymentUI     - Send full loan repayment notification
  loanLiquidation         - Send loan liquidation notification
  defaulterToEmployer     - Send defaulter details to employer

Examples:
  node ess-simulator.js all
  node ess-simulator.js test loanOffer
  node ess-simulator.js watch http://localhost:3002
        `);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ESSSimulator, ESSMessageGenerator };
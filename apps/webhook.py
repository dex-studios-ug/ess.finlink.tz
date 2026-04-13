from fastapi import FastAPI, Request, Header, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json
import logging
from datetime import datetime
import httpx
from enum import Enum

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
MIFOS_BASE_URL = "https://localhost/fineract-provider/api/v1"
MIFOS_TENANT = "default"
MIFOS_AUTH_TOKEN =  "TGVvbjpLYWl0ZXNp"  # Base64 encoded username:password
SMS_API_URL = "https://localhost/dexstudios/sms"  # Replace with actual SMS API
SMS_API_KEY = "your_sms_api_key"

# Enum for Mifos entities and actions
class MifosEntity(str, Enum):
    LOAN = "LOAN"
    SAVINGS = "SAVINGS"
    CLIENT = "CLIENT"

class MifosAction(str, Enum):
    REPAYMENT = "REPAYMENT"
    DISBURSAL = "DISBURSAL"
    APPROVAL = "APPROVAL"
    REJECTION = "REJECTION"
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    ACTIVATION = "ACTIVATION"
    CREATION = "CREATION"
    CLOSURE = "CLOSURE"

# Pydantic models
class MifosWebhookPayload(BaseModel):
    officeId: int
    clientId: int
    savingsId: Optional[int] = None
    resourceId: int
    loanId: Optional[int] = None
    amount: Optional[float] = None
    transactionDate: Optional[str] = None
    transactionType: Optional[str] = None
    changes: Optional[dict] =None
# Utility Functions
class MifosClient:
    @staticmethod
    async def get_client_info(client_id: int) -> Optional[Dict[str, Any]]:
        """Get client information from MifosX"""
        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                response = await client.get(
                    f"{MIFOS_BASE_URL}/clients/{client_id}",
                    headers={
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": f"Basic {MIFOS_AUTH_TOKEN}"
                    }
                )
                
                if response.status_code == 200:
                    client_data = response.json()
                    return {
                        "id": client_id,
                        "accountNo": client_data.get("accountNo"),
                        "fullName": client_data.get("displayName"),
                        "firstName": client_data.get("firstname"),
                        "lastName": client_data.get("lastname"),
                        "mobileNo": client_data.get("mobileNo"),
                        "email": client_data.get("emailAddress"),
                        "status": client_data.get("status", {}).get("value", "UNKNOWN")
                    }
                else:
                    logger.error(f"Failed to get client info: {response.status_code} - {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting client info: {str(e)}")
            return None
    
    @staticmethod
    async def get_loan_info(loan_id: int) -> Optional[Dict[str, Any]]:
        """Get loan account information"""
        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                response = await client.get(
                    f"{MIFOS_BASE_URL}/loans/{loan_id}",
                    headers={
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": f"Basic {MIFOS_AUTH_TOKEN}"
                    }
                )
                
                if response.status_code == 200:
                    loan_data = response.json()
                    return {
                        "id": loan_id,
                        "accountNo": loan_data.get("accountNo"),
                        "productName": loan_data.get("productName"),
                        "loanAmount": loan_data.get("principal"),
                        "outstandingBalance": loan_data.get("summary", {}).get("totalOutstanding"),
                        "status": loan_data.get("status", {}).get("value", "UNKNOWN")
                    }
                else:
                    logger.error(f"Failed to get loan info: {response.status_code} - {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting loan info: {str(e)}")
            return None
    
    @staticmethod
    async def get_savings_info(savings_id: int) -> Optional[Dict[str, Any]]:
        """Get savings account information"""
        try:
            async with httpx.AsyncClient(verify=False, timeout=30) as client:
                response = await client.get(
                    f"{MIFOS_BASE_URL}/savingsaccounts/{savings_id}",
                    headers={
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": f"Basic {MIFOS_AUTH_TOKEN}"
                    }
                )
                
                if response.status_code == 200:
                    savings_data = response.json()
                    return {
                        "id": savings_id,
                        "accountNo": savings_data.get("accountNo"),
                        "productName": savings_data.get("productName"),
                        "accountBalance": savings_data.get("accountBalance"),
                        "availableBalance": savings_data.get("availableBalance"),
                        "status": savings_data.get("status", {}).get("value", "UNKNOWN")
                    }
                else:
                    logger.error(f"Failed to get savings info: {response.status_code} - {response.text}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting savings info: {str(e)}")
            return None

class SMSClient:
    @staticmethod
    async def send_sms(phone_number: str, message: str) -> Dict[str, Any]:
        """Send SMS to customer"""
        try:
            # Remove any non-digit characters except +
            phone_number = ''.join(c for c in phone_number if c.isdigit() or c == '+')
            
            # If no country code, assume Tanzania (+255)
            if not phone_number.startswith('255'):
                if phone_number.startswith('0'):
                    phone_number = '255' + phone_number[1:]
                else:
                    phone_number = '255' + phone_number
            
            # Send SMS via API (example using Twilio-like API)
            async with httpx.AsyncClient(verify=False,timeout=30) as client:
                response = await client.get(
                    SMS_API_URL,
                    params={
                        "phone": phone_number,
                        "message": message,
                       
                    }
                )
                
                if response.status_code in [200, 201]:
                    logger.info(f"SMS sent successfully to {phone_number}")
                    return {
                        "success": True,
                        "message": "SMS sent successfully",
                        "recipient": phone_number
                    }
                else:
                    logger.error(f"SMS API error: {response.status_code} - {response.text}")
                    return {
                        "success": False,
                        "message": f"SMS API error: {response.status_code}",
                        "recipient": phone_number
                    }
                    
        except Exception as e:
            logger.error(f"Error sending SMS: {str(e)}")
            return {
                "success": False,
                "message": str(e),
                "recipient": phone_number
            }

# SMS Templates for different events
class SMSTemplates:
    # Loan Templates
    @staticmethod
    def loan_repayment(client_name: str, loan_account_no: str,amount: float =0.0,balance:float=0.0, date:str="")-> str:
        return f"""
Dear {client_name},

Your loan repayment of TZS {amount} for account {loan_account_no} has been received successfully.

New outstanding balance: TZS {balance}
Date: {date}

Thank you for your payment.
        """.strip()
    
    @staticmethod
    def loan_disbursement(client_name: str, loan_account_no: str, amount: float, date:str="")-> str:
        return f"""
Dear {client_name},

Your loan of TZS {amount} for account {loan_account_no} has been disbursed successfully.

The funds have been transferred to your account.
Date: {date}

Please ensure timely repayments.
        """.strip()
    
    @staticmethod
    def loan_approval(client_name: str, loan_account_no: str, amount: float) -> str:
        return f"""
Dear {client_name},

Congratulations! Your loan application {loan_account_no} for TZS {amount} has been approved.

The loan will be disbursed shortly. You will receive another SMS once funds are transferred.
        """.strip()
    
    @staticmethod
    def loan_rejection(client_name: str, loan_account_no: str) -> str:
        return f"""
Dear {client_name},

We regret to inform you that your loan application {loan_account_no} has not been approved at this time.

Please contact our branch for more information.
        """.strip()
    
    # Savings Templates
    @staticmethod
    def savings_deposit(client_name: str, savings_account_no: str,amount: float =0.0,balance:float=0.0, date:str="")-> str:
        return f"""
Dear {client_name},

Your deposit of TZS {amount} to savings account {savings_account_no} has been processed successfully.

New balance: TZS {balance}
Date: {date}

Thank you for saving with us.
        """.strip()
    
    @staticmethod
    def savings_withdrawal(client_name: str, savings_account_no: str,amount: float =0.0,balance:float=0.0, date:str="")-> str:
        return f"""
Dear {client_name},

Your withdrawal of TZS {amount} from savings account {savings_account_no} has been processed successfully.

Remaining balance: TZS {balance}
Date: {date}

Thank you for banking with us.
        """.strip()
    
    @staticmethod
    def savings_activation(client_name: str, savings_account_no: str) -> str:
        return f"""
Dear {client_name},

Your savings account {savings_account_no} has been activated successfully.

You can now start making deposits and withdrawals.
Welcome to our banking family!
        """.strip()
    
    @staticmethod
    def account_creation(client_name: str, account_no: str, account_type: str) -> str:
        return f"""
Dear {client_name},

Your {account_type} account {account_no} has been created successfully.

Welcome to our banking services. Your account is now active.
        """.strip()
    
    @staticmethod
    def account_closure(client_name: str, account_no: str, account_type: str) -> str:
        return f"""
Dear {client_name},

Your {account_type} account {account_no} has been closed successfully.

We thank you for banking with us. Please visit any branch if you need assistance.
        """.strip()

# Main Webhook Endpoint
@app.post("/webhook/")
async def receive_mifos_webhook(
    request: Request,
    payload: MifosWebhookPayload,
    x_mifos_platform_tenantid: Optional[str] = Header(None, alias="fineract-platform-tenantid"),
    x_mifos_entity: Optional[str] = Header(None, alias="x-fineract-entity"),
    x_mifos_action: Optional[str] = Header(None, alias="x-fineract-action")
):
    """
    Receive MifosX webhook notifications and send SMS to customers
    """

    timestamp = datetime.now().isoformat()
    
    # Log the incoming request
    logger.info(f"Webhook received - Tenant: {x_mifos_platform_tenantid}, Entity: {x_mifos_entity}, Action: {x_mifos_action}")
    logger.info(f"Payload: {payload.model_dump()}")
    
    try:
        # Get client information
        client_info = await MifosClient.get_client_info(payload.clientId)
        
        if not client_info:
            return {
                "status": "error",
                "message": f"Client with ID {payload.clientId} not found",
                "timestamp": timestamp
            }
        print(payload)
        # Prepare response
        result = {
            "status": "processing",
            "client_id": payload.clientId,
            "client_name": client_info.get("fullName"),
            "tenant": x_mifos_platform_tenantid,
            "entity": x_mifos_entity,
            "action": x_mifos_action,
            "timestamp": timestamp,
            "sms_sent": False
        }
        
        # Process based on entity and action
        if x_mifos_entity and x_mifos_action:
            # Prepare SMS data
            sms_data = await prepare_sms_data(
                entity=x_mifos_entity,
                action=x_mifos_action,
                payload=payload.model_dump(),
                client_info=client_info
            )
            
            if sms_data:
                # Send SMS if phone number exists
                phone_number = client_info.get("mobileNo")
                if phone_number:
                    sms_response = await SMSClient.send_sms(phone_number, sms_data["message"])
                    result["sms_sent"] = sms_response["success"]
                    result["sms_response"] = sms_response
                    result["sms_message"] = sms_data["message"]
                else:
                    result["sms_sent"] = False
                    result["sms_response"] = {"error": "No phone number found for client"}
                
                # Add transaction details
                result.update(sms_data.get("transaction_details", {}))
        
        return result
        
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": timestamp
        }

async def prepare_sms_data(entity: str, action: str, payload: Dict[str, Any], client_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Prepare SMS data based on entity and action
    """
    print(payload)
    payload.update(payload.get('changes',{}))
    payload['amount']=payload.get('transactionAmount',0)
    entity_upper = entity.upper()
    action_upper = action.upper()
    client_name = client_info.get("fullName", "Customer")
    
    # Default transaction date
    transaction_date = payload.get("transactionDate") or datetime.now().strftime("%d-%m-%Y %H:%M")
    
    sms_data = {
        "message": "",
        "transaction_details": {}
    }
    
    try:
        if entity_upper == MifosEntity.LOAN.value:
            loan_id = payload.get("loanId") or payload.get("resourceId")
            loan_info = await MifosClient.get_loan_info(loan_id) if loan_id else None
            
            if action_upper == MifosAction.REPAYMENT.value:
                amount = payload.get("amount", 0)
                balance = loan_info.get("outstandingBalance", 0) if loan_info else 0
                account_no = loan_info.get("accountNo", "N/A") if loan_info else "N/A"
                
                sms_data["message"] = SMSTemplates.loan_repayment(
                    client_name=client_name,
                    loan_account_no=account_no,
                    amount=amount,
                    balance=balance,
                    date=transaction_date
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "LOAN_REPAYMENT",
                    "account_number": account_no,
                    "amount": amount,
                    "balance": balance,
                    "date": transaction_date
                }
                
            elif action_upper == MifosAction.DISBURSAL.value:
                amount = payload.get("amount", 0)
                account_no = loan_info.get("accountNo", "N/A") if loan_info else "N/A"
                
                sms_data["message"] = SMSTemplates.loan_disbursement(
                    client_name=client_name,
                    loan_account_no=account_no,
                    amount=amount,
                    date=transaction_date
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "LOAN_DISBURSEMENT",
                    "account_number": account_no,
                    "amount": amount,
                    "date": transaction_date
                }
                
            elif action_upper == MifosAction.APPROVAL.value:
                account_no = loan_info.get("accountNo", "N/A") if loan_info else "N/A"
                amount = loan_info.get("loanAmount", 0) if loan_info else 0
                
                sms_data["message"] = SMSTemplates.loan_approval(
                    client_name=client_name,
                    loan_account_no=account_no,
                    amount=amount
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "LOAN_APPROVAL",
                    "account_number": account_no,
                    "amount": amount
                }
                
            elif action_upper == MifosAction.REJECTION.value:
                account_no = loan_info.get("accountNo", "N/A") if loan_info else "N/A"
                
                sms_data["message"] = SMSTemplates.loan_rejection(
                    client_name=client_name,
                    loan_account_no=account_no
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "LOAN_REJECTION",
                    "account_number": account_no
                }
        
        elif entity_upper == MifosEntity.SAVINGS.value:
            savings_id = payload.get("savingsId") or payload.get("resourceId")
            savings_info = await MifosClient.get_savings_info(savings_id) if savings_id else None
            
            if action_upper == MifosAction.DEPOSIT.value:
                amount = payload.get("amount", 0)
                balance = savings_info.get("accountBalance", 0) if savings_info else 0
                account_no = savings_info.get("accountNo", "N/A") if savings_info else "N/A"
                
                sms_data["message"] = SMSTemplates.savings_deposit(
                    client_name=client_name,
                    savings_account_no=account_no,
                    amount=amount,
                    balance=balance,
                    date=transaction_date
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "SAVINGS_DEPOSIT",
                    "account_number": account_no,
                    "amount": amount,
                    "balance": balance,
                    "date": transaction_date
                }
                
            elif action_upper == MifosAction.WITHDRAWAL.value:
                amount = payload.get("amount", 0)
                balance = savings_info.get("accountBalance", 0) if savings_info else 0
                account_no = savings_info.get("accountNo", "N/A") if savings_info else "N/A"
                
                sms_data["message"] = SMSTemplates.savings_withdrawal(
                    client_name=client_name,
                    savings_account_no=account_no,
                    amount=amount,
                    balance=balance,
                    date=transaction_date
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "SAVINGS_WITHDRAWAL",
                    "account_number": account_no,
                    "amount": amount,
                    "balance": balance,
                    "date": transaction_date
                }
                
            elif action_upper == MifosAction.ACTIVATION.value:
                account_no = savings_info.get("accountNo", "N/A") if savings_info else "N/A"
                
                sms_data["message"] = SMSTemplates.savings_activation(
                    client_name=client_name,
                    savings_account_no=account_no
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "SAVINGS_ACTIVATION",
                    "account_number": account_no
                }
                
            elif action_upper == MifosAction.CREATION.value:
                account_no = savings_info.get("accountNo", "N/A") if savings_info else "N/A"
                
                sms_data["message"] = SMSTemplates.account_creation(
                    client_name=client_name,
                    account_no=account_no,
                    account_type="savings"
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "ACCOUNT_CREATION",
                    "account_number": account_no,
                    "account_type": "savings"
                }
        
        elif entity_upper == MifosEntity.CLIENT.value:
            if action_upper == MifosAction.CREATION.value:
                account_no = client_info.get("accountNo", "N/A")
                
                sms_data["message"] = SMSTemplates.account_creation(
                    client_name=client_name,
                    account_no=account_no,
                    account_type="client"
                )
                
                sms_data["transaction_details"] = {
                    "transaction_type": "CLIENT_CREATION",
                    "account_number": account_no,
                    "account_type": "client"
                }
        
        return sms_data if sms_data["message"] else None
        
    except Exception as e:
        logger.error(f"Error preparing SMS data: {str(e)}")
        return None

# Test endpoints
@app.get("/test/client/{client_id}")
async def test_client_info(client_id: int):
    """Test client information retrieval"""
    client_info = await MifosClient.get_client_info(client_id)
    
    if client_info:
        # Test SMS
        phone = client_info.get("mobileNo")
        if phone:
            message = f"Test message for {client_info.get('fullName')}"
            sms_response = await SMSClient.send_sms(phone, message)
            return {
                "client_info": client_info,
                "sms_test": sms_response
            }
        else:
            return {
                "client_info": client_info,
                "sms_test": {"error": "No phone number"}
            }
    else:
        return {"error": "Client not found"}

@app.post("/test/webhook")
async def test_webhook_manual():
    """Manual test endpoint for webhooks"""
    test_payload = {
        "officeId": 187,
        "clientId": 7,
        "savingsId": 382,
        "resourceId": 241,
        "amount": 50000.00,
        "transactionDate": datetime.now().strftime("%d %B %Y")
    }
    
    return await receive_mifos_webhook(
        request=None,  # Mock request
        payload=MifosWebhookPayload(**test_payload),
        x_mifos_platform_tenantid="demo",
        x_mifos_entity="LOAN",
        x_mifos_action="REPAYMENT"
    )

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "MifosX SMS Notification Service",
        "timestamp": datetime.now().isoformat()
    }

# Run the application
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8337, log_level="info")

from fastapi import FastAPI, HTTPException, Depends, Header, Request, Query, status
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Field, Session, create_engine, select, func, or_,text
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import hashlib
import secrets
import json
import csv
import io
import asyncio
from pydantic import BaseModel
import logging
from contextlib import asynccontextmanager
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "mysql+mysqlconnector://root:spike%23%401012@localhost:20509/postanasimu"
engine = create_engine(DATABASE_URL)

# Database Models
class ATMTransaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reference: str = Field(index=True, unique=True)
    pan: str = Field(index=True)
    account_no: str = Field(index=True)
    terminal: str | None = None
    transaction_type: str
    amount: Optional[int] 
    charge: Optional[int] 
    currency: str = Field(default="TZS")
    settlement_account: Optional[str]
    response_code: str
    response_message: str
    available_balance_after: Optional[int] 
    ledger_balance_after: Optional[int]
    fineract_id: Optional[int] = Field(default=-1)
    reversal_fineract_id: Optional[int] = Field(default=-1)
    savings_id: Optional[int]
    is_reversed: bool = Field(default=False)
    reversal_reference: Optional[str]
    created_at: datetime = Field(default_factory=datetime.utcnow)



# Pydantic Models
class ATMRequest(BaseModel):
    reference: str
    pan: str
    accountNo: str
    terminal: str

class CashWithdrawRequest(ATMRequest):
    settlementAccount: str
    currency: str
    amount: int
    charge: int

class ATMResponse(BaseModel):
    reference: str
    responseCode: str
    message: str
    availableBalance: Optional[float] = None
    ledgerBalance: Optional[float] = None

# MifosX Integration
MIFOS_BASE_URL = "https://localhost/fineract-provider/api/v1"
MIFOS_TENANT = "default"
MIFOS_ADMIN_AUTH = "TGVvbjpLYWl0ZXNp"  # Base64 encoded admin:password
PRESHARED_ATM_API_KEY="s"

class MifosClient:
    @staticmethod
    async def get_savings_account_by_pan(pan: str) -> Optional[Dict]:
        """Get Amana savings account details using PAN mapping"""
        try:
            with Session(engine) as session:
                # Get savings account ID from PAN mapping
                mapping = session.exec(
                  text( f"select savings_account_id from `ATM Details` where pan = '{pan}'")
                ).all()
                
                if not mapping:
                    logger.error(f"No PAN mapping found for: {pan}")
                    return None
                sv_account=mapping[0][0]
                
                # Fetch account from MifosX
                async with httpx.AsyncClient(verify=False, timeout=20) as client:
                    response = await client.get(
                        f"{MIFOS_BASE_URL}/savingsaccounts/{sv_account}",
                        headers={
                            "Fineract-Platform-Tenantid": MIFOS_TENANT,
                            "Authorization": f"Basic {MIFOS_ADMIN_AUTH}"
                        }
                    )
                    
                    if response.status_code == 200:
                        account_data = response.json()
                        return {
                            "savings_id": sv_account,
                            "account_no": sv_account,
                            "account_balance": float(account_data.get("accountBalance", 0)),
                            "available_balance": float(account_data.get("availableBalance", 0)),
                            "status": account_data.get("status", {}).get("value", "UNKNOWN"),
                            "product_name": account_data.get("productName", "")
                        }
                    else:
                        logger.error(f"MifosX API error: {response.status_code} - {response.text}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error fetching account from MifosX: {str(e)}")
            return None
    
  
    @staticmethod
    async def authorize_withdrawal(pan: str, amount: float) -> tuple[bool, str, float, float]:
        """Authorize withdrawal from Amana account"""
        account = await MifosClient.get_savings_account_by_pan(pan)
        
        if not account:
            return False, "Account not found", 0.0, 0.0
        
        if account["status"] != "Active":
            return False, "Account inactive", account["available_balance"], account["account_balance"]
        
        if account["available_balance"] < amount:
            return False, "Insufficient funds", account["available_balance"], account["account_balance"]
        
        # Check if it's AMANA account
        if "AMANA" not in account["product_name"].upper():
            return False, "Not an AMANA account", account["available_balance"], account["account_balance"]
        
        return True, "Success", account["available_balance"] - amount, account["account_balance"] - amount
    
    @staticmethod
    async def log_withdrawal(savings_id: int, amount: float, reference: str) -> tuple[bool, Optional[int]]:
        """Log withdrawal in MifosX"""
        try:
            async with httpx.AsyncClient(verify=False, timeout=20) as client:
                response = await client.post(
                    f"{MIFOS_BASE_URL}/savingsaccounts/{savings_id}/transactions?command=withdrawal",
                    headers={
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": f"Basic {MIFOS_ADMIN_AUTH}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "transactionDate": datetime.now().strftime("%d %B %Y"),
                        "voucherNumber": reference,
                        "transactionAmount": amount,
                        "paymentTypeId": 4,
                        "locale": "en",
                        "dateFormat": "dd MMMM yyyy",
                        "paymentDescription": f"ATM Withdrawal - {reference}"
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return True, data.get('resourceId')
                else:
                    logger.error(f"Withdrawal failed in MifosX: {response.status_code} - {response.text}")
                    return False, None
                    
        except Exception as e:
            logger.error(f"Error logging withdrawal in MifosX: {str(e)}")
            return False, None
    
    @staticmethod
    async def log_reversal(savings_id: int, fineract_id: int, reference: str) -> bool:
        """Log reversal in MifosX"""
        try:
            async with httpx.AsyncClient(verify=False, timeout=20) as client:
                response = await client.post(
                    f"{MIFOS_BASE_URL}/savingsaccounts/{savings_id}/transactions/{fineract_id}?command=undo",
                    headers={
                        "Fineract-Platform-Tenantid": MIFOS_TENANT,
                        "Authorization": f"Basic {MIFOS_ADMIN_AUTH}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "transactionDate": datetime.now().strftime("%d %B %Y"),
                        "transactionAmount": 0,
                        "locale": "en",
                        "dateFormat": "dd MMMM yyyy"
                    }
                )
                
                if response.status_code == 200:
                    logger.info(f"Reversal successful for {reference}")
                    return True,response.json().get('resourceId')
                else:
                    logger.error(f"Reversal failed in MifosX: {response.status_code} - {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error logging reversal in MifosX: {str(e)}")
            return False
    


# Helper Functions
def get_session():
    with Session(engine) as session:
        yield session


def verify_terminal_api_key(api_key: str = Header(..., alias="X-API-Key")):
    """Verify terminal API key"""
    return api_key == PRESHARED_ATM_API_KEY




@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and create default data"""
    SQLModel.metadata.create_all(engine)
    logger.info("Database tables created")
    logger.info("ATM Integration API started on port 8336")
    yield
    logger.info("ATM Integration API shutting down")

# Create FastAPI app
app = FastAPI(
    title="ATM Integration API",
    description="ATM transaction processing with MifosX integration",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== ATM TRANSACTION ENDPOINTS ==========

@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    """Handle all OPTIONS requests for CORS"""
    return JSONResponse(
        content={"success": True, "message": "CORS preflight"},
        status_code=200
    )

@app.post("/api/v1/atm/withdraw", response_model=ATMResponse)
async def cash_withdraw(
    request: CashWithdrawRequest
    ,authorised  = Depends(verify_terminal_api_key),
    session: Session = Depends(get_session)
):
    """Authorize ATM withdrawal against Amana savings account"""
    logger.info(f"Withdrawal request: {request.reference} - {request.amount}")
    
    try:
        # Check for duplicate transaction
        existing = session.exec(
            select(ATMTransaction).where(ATMTransaction.reference == request.reference)
        ).first()
        
        if existing:
            return ATMResponse(
                reference=request.reference,
                responseCode="99",
                message="Duplicate transaction"
            )
        
        # Authorize with MifosX
        authorized, message, available_balance, ledger_balance = await MifosClient.authorize_withdrawal(
            request.pan, request.amount
        )
        
        if not authorized:
            # Record failed transaction
            transaction = ATMTransaction(
                reference=request.reference,
                pan=request.pan,
                account_no=request.accountNo,
                terminal=request.terminal,
                transaction_type="WITHDRAWAL",
                amount=int(str(request.amount)),
                charge=int(request.charge) if request.charge else int('0.00'),
                settlement_account=request.settlementAccount,
                response_code="99",
                response_message=message
            )
            session.add(transaction)
            session.commit()
            
            return ATMResponse(
                reference=request.reference,
                responseCode="99",
                message=message
            )
        
        # Get account details for savings_id
        account = await MifosClient.get_savings_account_by_pan(request.pan)
        if not account:
            return ATMResponse(
                reference=request.reference,
                responseCode="99",
                message="Account details not found"
            )
        
        # Record transaction in database first
        transaction = ATMTransaction(
            reference=request.reference,
            pan=request.pan,
            account_no=request.accountNo,
            terminal=request.terminal,
            transaction_type="WITHDRAWAL",
            amount=request.amount,
            charge=request.charge if request.charge else 0,
            settlement_account=request.settlementAccount,
            response_code="0",
            response_message="Success",
            available_balance_after=int(str(available_balance)),
            ledger_balance_after=int(str(ledger_balance)),
            savings_id=account["savings_id"]
        )
        session.add(transaction)
        session.commit()
        
        # Log withdrawal in MifosX
        success, fineract_id = await MifosClient.log_withdrawal(
            account["savings_id"], request.amount, request.reference
        )
        
        if success and fineract_id:
            # Update transaction with Fineract ID
            transaction.fineract_id = fineract_id
            session.add(transaction)
            session.commit()
            
            return ATMResponse(
                reference=request.reference,
                responseCode="0",
                message="Success",
                availableBalance=available_balance,
                ledgerBalance=ledger_balance
            )
        else:
            # Mark transaction as failed if MifosX logging fails
            transaction.response_code = "99"
            transaction.response_message = "Failed to log in MifosX"
            session.add(transaction)
            session.commit()
            
            return ATMResponse(
                reference=request.reference,
                responseCode="99",
                message="Transaction processing failed"
            )
            
    except Exception as e:
        logger.error(f"Error processing withdrawal: {str(e)}")
        return ATMResponse(
            reference=request.reference,
            responseCode="96",
            message="System error"
        )

@app.post("/api/v1/atm/balance", response_model=ATMResponse)
async def balance_inquiry(
    request: ATMRequest
    ,authorised = Depends(verify_terminal_api_key),
    session: Session = Depends(get_session)
):
    """Get balance from Amana savings account"""
    logger.info(f"Balance inquiry: {request.reference}")
    
    try:
        # Get account details from MifosX
        account = await MifosClient.get_savings_account_by_pan(request.pan)
        if not account:
            return ATMResponse(
                reference=request.reference,
                responseCode="99",
                message="Account not found"
            )
        
        # Record inquiry
        transaction = ATMTransaction(
            reference=request.reference,
            pan=request.pan,
            account_no=request.accountNo,
            terminal=request.terminal,
            transaction_type="BALANCE_INQUIRY",
            response_code="0",
            response_message="Success",
            available_balance_after=account["available_balance"],
            ledger_balance_after=account["account_balance"]
        )
        session.add(transaction)
        session.commit()
        
        return ATMResponse(
            reference=request.reference,
            responseCode="0",
            message="Success",
            availableBalance=account["available_balance"],
            ledgerBalance=account["account_balance"]
        )
        
    except Exception as e:
        logger.error(f"Error processing balance inquiry: {str(e)}")
        return ATMResponse(
            reference=request.reference,
            responseCode="96",
            message="System error"
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy", 
        "service": "ATM-MifosX Integration",
        "timestamp": datetime.now().isoformat()
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8336, log_level="info")

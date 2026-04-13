from fastapi import FastAPI, Request, Header, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import json
import logging
from datetime import datetime

app = FastAPI()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic model for the payload
class MifosWebhookPayload(BaseModel):
    officeId: int
    clientId: int
    savingsId: Optional[int] = None
    resourceId: int
    loanId: Optional[int] = None  # Some webhooks might have loanId instead of savingsId
@app.post("/webhook/")
@app.post("/webhook")
async def receive_mifos_webhook(
    request: Request,
    payload: MifosWebhookPayload,
    x_mifos_platform_tenantid: Optional[str] = Header(None, alias="X-Mifos-Platform-TenantId"),
    x_mifos_entity: Optional[str] = Header(None, alias="X-Mifos-Entity"),
    x_mifos_action: Optional[str] = Header(None, alias="X-Mifos-Action"),
    # Also accept as query parameters for backward compatibility
    tenant_id: Optional[str] = Query(None, alias="X-Mifos-Platform-TenantId"),
    entity: Optional[str] = Query(None, alias="X-Mifos-Entity"),
    action: Optional[str] = Query(None, alias="X-Mifos-Action")
):
    """
    Receive MifosX webhook notifications for loan/savings transactions
    
    Example request:
    POST http://localhost:8000/services/apexrest/transactions
    Headers:
        X-Mifos-Platform-TenantId: demo
        X-Mifos-Entity: LOAN
        X-Mifos-Action: REPAYMENT
    
    Body:
    {
        "officeId": 187,
        "clientId": 7,
        "savingsId": 382,
        "resourceId": 241
    }
    """
    
    # Get timestamp
    timestamp = datetime.now().isoformat()
    
    # Get raw request body for logging
    raw_body = await request.body()
    
    # Get headers
    headers = dict(request.headers)
    
    # Get query parameters
    query_params = dict(request.query_params)
    
    # Use query parameters if headers are not provided
    tenant_id_final = x_mifos_platform_tenantid or tenant_id
    entity_final = x_mifos_entity or entity
    action_final = x_mifos_action or action
    
    # Create comprehensive log entry
    log_entry = {
        "timestamp": timestamp,
        "endpoint": str(request.url),
        "method": request.method,
        "headers": headers,
        "query_parameters": query_params,
        "tenant_id": tenant_id_final,
        "entity": entity_final,
        "action": action_final,
        "payload": payload.dict(),
        "raw_body": raw_body.decode('utf-8') if raw_body else None
    }
    
    # Pretty print to console
    print("\n" + "="*80)
    print("MIFOSX WEBHOOK RECEIVED")
    print("="*80)
    print(f"Timestamp: {timestamp}")
    print(f"URL: {request.url}")
    print(f"Method: {request.method}")
    print("-"*80)
    
    print("HEADERS:")
    for key, value in headers.items():
        print(f"  {key}: {value}")
    print("-"*80)
    
    print("QUERY PARAMETERS:")
    for key, value in query_params.items():
        print(f"  {key}: {value}")
    print("-"*80)
    
    print("MIFOS SPECIFIC PARAMETERS:")
    print(f"  X-Mifos-Platform-TenantId: {tenant_id_final}")
    print(f"  X-Mifos-Entity: {entity_final}")
    print(f"  X-Mifos-Action: {action_final}")
    print("-"*80)
    
    print("PAYLOAD:")
    print(json.dumps(payload.dict(), indent=2))
    print("-"*80)
    
    print("RAW REQUEST BODY:")
    print(raw_body.decode('utf-8') if raw_body else "No body")
    print("="*80 + "\n")
    
    # Also log to file
    logger.info(f"MifosX Webhook Received - Tenant: {tenant_id_final}, Entity: {entity_final}, Action: {action_final}")
    logger.info(f"Payload: {payload.dict()}")
    
    # Process based on entity and action
    response = await process_mifos_webhook(
        tenant_id=tenant_id_final,
        entity=entity_final,
        action=action_final,
        payload=payload.dict()
    )
    
    return response

async def process_mifos_webhook(tenant_id: str, entity: str, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process the MifosX webhook based on entity and action
    """
    result = {
        "status": "received",
        "tenant": tenant_id,
        "entity": entity,
        "action": action,
        "processed_at": datetime.now().isoformat(),
        "message": "Webhook received successfully"
    }
    
    # Determine the type of transaction
    if entity and action:
        entity_upper = entity.upper()
        action_upper = action.upper()
        
        if entity_upper == "LOAN":
            if action_upper == "REPAYMENT":
                result["transaction_type"] = "LOAN_REPAYMENT"
                result["loan_id"] = payload.get("resourceId")
                result["office_id"] = payload.get("officeId")
                result["client_id"] = payload.get("clientId")
                logger.info(f"Loan repayment received - Loan ID: {payload.get('resourceId')}")
                
            elif action_upper == "DISBURSAL":
                result["transaction_type"] = "LOAN_DISBURSEMENT"
                result["loan_id"] = payload.get("resourceId")
                logger.info(f"Loan disbursement received - Loan ID: {payload.get('resourceId')}")
                
            elif action_upper == "APPROVAL":
                result["transaction_type"] = "LOAN_APPROVAL"
                result["loan_id"] = payload.get("resourceId")
                logger.info(f"Loan approval received - Loan ID: {payload.get('resourceId')}")
                
            elif action_upper == "REJECTION":
                result["transaction_type"] = "LOAN_REJECTION"
                result["loan_id"] = payload.get("resourceId")
                logger.info(f"Loan rejection received - Loan ID: {payload.get('resourceId')}")
                
        elif entity_upper == "SAVINGS":
            if action_upper == "DEPOSIT":
                result["transaction_type"] = "SAVINGS_DEPOSIT"
                result["savings_id"] = payload.get("savingsId") or payload.get("resourceId")
                logger.info(f"Savings deposit received - Savings ID: {payload.get('savingsId') or payload.get('resourceId')}")
                
            elif action_upper == "WITHDRAWAL":
                result["transaction_type"] = "SAVINGS_WITHDRAWAL"
                result["savings_id"] = payload.get("savingsId") or payload.get("resourceId")
                logger.info(f"Savings withdrawal received - Savings ID: {payload.get('savingsId') or payload.get('resourceId')}")
                
            elif action_upper == "ACTIVATION":
                result["transaction_type"] = "SAVINGS_ACTIVATION"
                result["savings_id"] = payload.get("savingsId") or payload.get("resourceId")
                logger.info(f"Savings activation received - Savings ID: {payload.get('savingsId') or payload.get('resourceId')}")
    
    return result

# Test endpoint to verify the webhook is working
@app.get("/test-mifos-webhook")
async def test_mifos_webhook():
    """
    Generate a test curl command for the MifosX webhook
    """
    test_curl = """# Test MifosX Webhook Endpoint

# With Headers:
curl -X POST "http://localhost:8000/services/apexrest/transactions" \\
  -H "Content-Type: application/json" \\
  -H "X-Mifos-Platform-TenantId: demo" \\
  -H "X-Mifos-Entity: LOAN" \\
  -H "X-Mifos-Action: REPAYMENT" \\
  -d '{
    "officeId": 187,
    "clientId": 7,
    "savingsId": 382,
    "resourceId": 241
  }'

# With Query Parameters:
curl -X POST "http://localhost:8000/services/apexrest/transactions?X-Mifos-Platform-TenantId=demo&X-Mifos-Entity=LOAN&X-Mifos-Action=REPAYMENT" \\
  -H "Content-Type: application/json" \\
  -d '{
    "officeId": 187,
    "clientId": 7,
    "savingsId": 382,
    "resourceId": 241
  }'

# Savings Deposit Example:
curl -X POST "http://localhost:8000/services/apexrest/transactions" \\
  -H "Content-Type: application/json" \\
  -H "X-Mifos-Platform-TenantId: default" \\
  -H "X-Mifos-Entity: SAVINGS" \\
  -H "X-Mifos-Action: DEPOSIT" \\
  -d '{
    "officeId": 1,
    "clientId": 42,
    "savingsId": 125,
    "resourceId": 356
  }'
    """
    
    return {
        "message": "MifosX Webhook Endpoint is running",
        "endpoint": "POST /webhooks",
        "test_commands": test_curl
    }

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "MifosX Webhook Receiver",
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8337, log_level="info")

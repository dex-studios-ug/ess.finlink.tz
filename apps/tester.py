import requests
import json
from datetime import datetime

class ATMAPITester:
    def __init__(self, base_url="http://localhost:8336"):
        self.base_url = base_url
        self.api_key = "test-api-key-123"
        self.admin_key = "admin_secret_key_123"
        
    def test_health(self):
        """Test health endpoint"""
        url = f"{self.base_url}/health"
        response = requests.get(url)
        print(f"Health Check - Status: {response.status_code}")
        print(json.dumps(response.json(), indent=2))
        return response.json()
    
    def test_withdrawal(self, reference=None):
        """Test withdrawal request"""
        if not reference:
            reference = f"WDRW_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        url = f"{self.base_url}/api/v1/atm/withdraw"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
        
        payload = {
            "reference": reference,
            "pan": "5078580000000001",
            "accountNo": "0011001234567",
            "terminal": "TPB0081",
            "settlementAccount": "1100110001",
            "currency": "TZS",
            "amount": 50000.00,
            "charge": "500.00"
        }
        
        print(f"\nTesting Withdrawal - Reference: {reference}")
        response = requests.post(url, headers=headers, json=payload)
        
        print(f"Status Code: {response.status_code}")
        print("Response:")
        print(json.dumps(response.json(), indent=2))
        
        return response.json(), reference
    
    def test_balance_inquiry(self, reference=None):
        """Test balance inquiry request"""
        if not reference:
            reference = f"BAL_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        url = f"{self.base_url}/api/v1/atm/balance"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
        
        payload = {
            "reference": reference,
            "pan": "5078580000000001",
            "accountNo": "0011001234567",
            "terminal": "TPB0081"
        }
        
        print(f"\nTesting Balance Inquiry - Reference: {reference}")
        response = requests.post(url, headers=headers, json=payload)
        
        print(f"Status Code: {response.status_code}")
        print("Response:")
        print(json.dumps(response.json(), indent=2))
        
        return response.json()
    
    def test_duplicate_transaction(self, reference):
        """Test duplicate transaction rejection"""
        print(f"\nTesting Duplicate Transaction - Reference: {reference}")
        return self.test_withdrawal(reference)
    
    def test_invalid_pan(self):
        """Test with invalid PAN"""
        url = f"{self.base_url}/api/v1/atm/withdraw"
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
        
        reference = f"INV_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        payload = {
            "reference": reference,
            "pan": "9999999999999999",
            "accountNo": "0011009999999",
            "terminal": "TPB0081",
            "settlementAccount": "1100110001",
            "currency": "TZS",
            "amount": 1000.00,
            "charge": "10.00"
        }
        
        print(f"\nTesting Invalid PAN - Reference: {reference}")
        response = requests.post(url, headers=headers, json=payload)
        
        print(f"Status Code: {response.status_code}")
        print("Response:")
        print(json.dumps(response.json(), indent=2))
        
        return response.json()
    
    def test_admin_stats(self):
        """Test admin transaction stats"""
        url = f"{self.base_url}/api/v1/transactions/stats"
        headers = {
            "X-Admin-Key": self.admin_key
        }
        
        print("\nTesting Admin - Transaction Stats")
        response = requests.get(url, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        print("Response:")
        print(json.dumps(response.json(), indent=2))
        
        return response.json()
    
    def run_all_tests(self):
        """Run all test scenarios"""
        print("=" * 50)
        print("ATM API TEST SUITE")
        print("=" * 50)
        
        # Test health
        self.test_health()
        
        # Test balance inquiry
        self.test_balance_inquiry()
        
        # Test withdrawal
        result, ref = self.test_withdrawal()
        
        # Test duplicate transaction
        self.test_duplicate_transaction(ref)
        
        # Test invalid PAN
        self.test_invalid_pan()
        
        # Test admin stats
        self.test_admin_stats()
        
        print("\n" + "=" * 50)
        print("ALL TESTS COMPLETED")
        print("=" * 50)

if __name__ == "__main__":
    tester = ATMAPITester()
    
    # Run individual test or all tests
    # tester.test_health()
    # tester.test_withdrawal()
    # tester.test_balance_inquiry()
    
    # Run all tests
    tester.run_all_tests()

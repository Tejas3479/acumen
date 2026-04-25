import requests
import sys

def test_backend():
    url = "http://127.0.0.1:8000/"
    print(f"--- Testing Backend Connection ---")
    print(f"Target URL: {url}")
    
    try:
        response = requests.get(url, timeout=5)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        
        if response.status_code == 200:
            print("\n[SUCCESS] Backend is reachable.")
        else:
            print("\n[WARNING] Backend responded but status code is not 200.")
            
    except requests.exceptions.ConnectionError:
        print("\n[ERROR] Could not connect to the backend.")
        print("   Make sure the FastAPI server is running on port 8000.")
        print("   Run: uvicorn main:app --reload --port 8000")
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")

if __name__ == "__main__":
    test_backend()

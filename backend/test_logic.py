from datetime import datetime, timezone
from logic import calculate_next_revision

def test_logic():
    # Use a fixed start date for testing
    start_date = datetime.now(timezone.utc)
    
    print(f"Base Date: {start_date.strftime('%Y-%m-%d')}\n")
    print(f"{'Rev Count':<10} | {'Interval':<10} | {'Next Date'}")
    print("-" * 40)
    
    test_cases = [0, 1, 2, 3, 4, 5, 10]
    
    for count in test_cases:
        next_date = calculate_next_revision(start_date, count)
        days_diff = (next_date - start_date).days
        print(f"{count:<10} | +{days_diff:<9} | {next_date.strftime('%Y-%m-%d')}")

if __name__ == "__main__":
    test_logic()

from datetime import datetime, timedelta, timezone

def calculate_next_revision(last_revision_date: datetime, revision_count: int) -> datetime:
    """
    Calculates the next revision date based on spaced repetition intervals.
    
    Intervals:
    - 0 revisions: +3 days
    - 1 revision:  +7 days
    - 2 revisions: +15 days
    - 3 revisions: +30 days
    - 4+ revisions: +60 days
    """
    intervals = {
        0: 3,
        1: 7,
        2: 15,
        3: 30
    }
    
    # Default to 60 days if revision_count is 4 or more
    days_to_add = intervals.get(revision_count, 60)
    
    return last_revision_date + timedelta(days=days_to_add)

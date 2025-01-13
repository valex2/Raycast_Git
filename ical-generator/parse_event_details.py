def parse_event_details(text):
    import re
    from datetime import datetime, timedelta

    # Extract title using regex for capitalized title structure
    title_match = re.search(r"^[A-Z][a-z]+ [A-Z][a-z]+", text, re.MULTILINE)
    title = title_match.group(0).strip() if title_match else "Unknown Title"

    # Extract event description (after title and advisor line)
    summary_start = text.find(title) + len(title)
    advisor_start = text.find("Advisor:")
    summary = text[advisor_start + len("Advisor:"):] if advisor_start != -1 else text[summary_start:]
    summary = summary.strip()

    # Extract date
    date_match = re.search(r"Date:\s*([A-Za-z]+,\s*[A-Za-z]+\s*\d{1,2},\s*\d{4})", text)
    date_str = date_match.group(1).strip() if date_match else None

    # Extract time
    time_match = re.search(r"Time:\s*([\d:apm\s]+)", text)
    time_str = time_match.group(1).strip() if time_match else None

    if date_str and time_str:
        try:
            start_datetime_str = f"{date_str} {time_str}"
            start = datetime.strptime(start_datetime_str, "%A, %B %d, %Y %I:%M %p")
            end = start + timedelta(hours=1)  # Default to 1-hour duration
        except ValueError as e:
            raise ValueError(f"Error parsing datetime: {e}")
    else:
        start = end = None

    # Extract location
    location_match = re.search(r"Location:\s*(.*)", text)
    location = location_match.group(1).strip() if location_match else "Unknown Location"

    # Construct Event Details JSON
    event_details = {
        "title": title,
        "start": start.isoformat() if start else "Unknown Start",
        "end": end.isoformat() if end else "Unknown End",
        "location": location,
        "summary": summary
    }

    return event_details

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        details = parse_event_details(input_text)
        print(json.dumps(details, indent=4))
    else:
        print("Please provide the event details as an argument.")

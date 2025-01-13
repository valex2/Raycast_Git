import spacy
import re
import json
from datetime import datetime

# Load SpaCy model
nlp = spacy.load("en_core_web_sm")

def parse_event_details(input_text):
    doc = nlp(input_text)

    location, date, time_start, time_end = None, None, None, None

    # Extract entities using SpaCy
    for ent in doc.ents:
        if ent.label_ in {"GPE", "LOC", "FAC"} and not location:  # Location-related entities
            location = ent.text.strip()
        elif ent.label_ == "DATE" and not date:  # Date entity
            date = ent.text.strip()
        elif ent.label_ == "TIME":  # Time entity
            # Match explicit time range or single time
            time_match = re.match(r"(\d{1,2}:\d{2}(?:\s?[APap][Mm])?)(?:\s*-\s*(\d{1,2}:\d{2}(?:\s?[APap][Mm])?))?", ent.text)
            if time_match:
                time_start = time_match.group(1)
                time_end = time_match.group(2)

    # Fallback regex to extract date if SpaCy misses it
    if not date:
        date_match = re.search(r"[A-Za-z]+\s\d{1,2},\s\d{4}", input_text)
        if date_match:
            date = date_match.group(0)

    # Fallback regex to extract time if SpaCy misses it
    if not time_start:
        time_match = re.search(r"\b\d{1,2}:\d{2}(?:\s?[APap][Mm])?\b", input_text)
        if time_match:
            time_start = time_match.group(0)

    # Parse extracted date and time
    parsed_date, parsed_start, parsed_end = None, None, None
    if date:
        try:
            parsed_date = datetime.strptime(date, "%A, %B %d, %Y")
        except ValueError:
            pass

    if parsed_date and time_start:
        try:
            parsed_start = datetime.strptime(f"{date} {time_start.strip()}", "%A, %B %d, %Y %I:%M %p")
        except ValueError:
            pass

    if parsed_date and time_end:
        try:
            parsed_end = datetime.strptime(f"{date} {time_end.strip()}", "%A, %B %d, %Y %I:%M %p")
        except ValueError:
            pass

    # Clean up title and remove redundant lines
    title = re.sub(r"(Date:.*|Time:.*|Location:.*|Zoom Link:.*)", "", input_text, flags=re.IGNORECASE).strip().split("\n")[0]

    # Construct event details
    event_details = {
        "title": title if title else "Untitled Event",
        "start": parsed_start.isoformat() if parsed_start else None,
        "end": parsed_end.isoformat() if parsed_end else None,
        "location": location,
        "summary": input_text.strip(),
    }

    return event_details

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        details = parse_event_details(input_text)
        print(json.dumps(details, indent=4))
    else:
        print("Please provide the event details as an argument.")

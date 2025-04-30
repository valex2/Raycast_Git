# move this to the raycast folder
#/Users/Vassilis/.config/raycast/extensions/ical-generator/

import subprocess
import json
import sys
from datetime import datetime

def extract_event_from_text(text: str):
    prompt = f"""
Extract the event details from the following text and return a JSON object in the format:
{{
  "summary": string of the event title,
  "start": ISO 8601 datetime string (e.g. 2025-05-02T14:00:00),
  "end": ISO 8601 datetime string,
  "location": string
}}

Text: "{text}"
"""

    try:
        result = subprocess.run(
            ["/usr/local/bin/ollama", "run", "mistral"],
            input=prompt.encode(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30
        )

        response = result.stdout.decode("utf-8", errors="ignore")
        json_start = response.find("{")
        json_text = response[json_start:].strip()

        parsed = json.loads(json_text)
        print(json.dumps(parsed))  # Output result to stdout
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    input_text = sys.argv[1]
    extract_event_from_text(input_text)

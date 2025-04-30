# /Users/Vassilis/.config/raycast/extensions/ical-generator/parse_event_llm.py

import subprocess
import json
import sys
import re
from datetime import datetime

def extract_event_from_text(text: str):
    today = datetime.now().strftime("%Y-%m-%d")

    prompt = f"""
    Today's date is {today}.

    Extract the event details from the following text and return a JSON object in the format:
    {{
    "summary": string of event title,
    "start": ISO 8601 datetime string (e.g. 2025-05-02T14:00:00),
    "end": ISO 8601 datetime string (or null if not provided),
    "location": string
    }}

    Only return valid JSON. No commentary, no markdown.

    Text:
    \"\"\"{text}\"\"\"
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
        json_candidates = re.findall(r"{.*?}", response[json_start:], re.DOTALL)

        if not json_candidates:
            print(json.dumps({"error": "No valid JSON object found in LLM output"}))
            return

        try:
            parsed = json.loads(json_candidates[0])
            print(json.dumps(parsed))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input provided"}))
        sys.exit(1)

    input_text = sys.argv[1]
    extract_event_from_text(input_text)

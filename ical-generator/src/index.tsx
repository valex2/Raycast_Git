import { ActionPanel, Detail, Form, SubmitAction, showToast, Toast } from "@raycast/api";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import ical from "ical-generator";

function parseEventDetails(text: string): {
  title: string;
  start: string;
  end: string;
  location: string;
  summary: string;
} {
  // Equivalent of your Python `parse_event_details` function in TypeScript
  const titleMatch = text.match(/^[A-Z][a-z]+ [A-Z][a-z]+/m);
  const title = titleMatch ? titleMatch[0].trim() : "Unknown Title";

  const summaryStart = text.indexOf(title) + title.length;
  const advisorStart = text.indexOf("Advisor:");
  const summary = advisorStart !== -1 ? text.slice(advisorStart + "Advisor:".length).trim() : text.slice(summaryStart).trim();

  const dateMatch = text.match(/Date:\s*([A-Za-z]+,\s*[A-Za-z]+\s*\d{1,2},\s*\d{4})/);
  const dateStr = dateMatch ? dateMatch[1].trim() : null;

  const timeMatch = text.match(/Time:\s*([\d:apm\s]+)/);
  const timeStr = timeMatch ? timeMatch[1].trim() : null;

  let start = null;
  let end = null;
  if (dateStr && timeStr) {
    try {
      const startDate = new Date(`${dateStr} ${timeStr}`);
      start = startDate.toISOString();
      end = new Date(startDate.getTime() + 60 * 60 * 1000).toISOString(); // 1-hour duration
    } catch {
      start = end = null;
    }
  }

  const locationMatch = text.match(/Location:\s*(.*)/);
  const location = locationMatch ? locationMatch[1].trim() : "Unknown Location";

  return {
    title,
    start: start || "Unknown Start",
    end: end || "Unknown End",
    location,
    summary,
  };
}

export default function Command() {
  async function handleSubmit(values: { text: string }) {
    const { text } = values;

    if (!text) {
      showToast({ style: Toast.Style.Failure, title: "Text input is required!" });
      return;
    }

    const details = parseEventDetails(text);

    if (details.start === "Unknown Start") {
      showToast({ style: Toast.Style.Failure, title: "Failed to parse event date/time" });
      return;
    }

    // Create an iCal invite
    const calendar = ical({ name: "Generated Invite" });
    calendar.createEvent({
      start: new Date(details.start),
      end: new Date(details.end),
      summary: details.title,
      location: details.location,
      description: details.summary,
    });

    // Save to a temporary .ics file
    const icsPath = path.join(os.tmpdir(), "event.ics");
    calendar.saveSync(icsPath);

    // Add to Apple Calendar using `open` command
    require("child_process").exec(`open ${icsPath}`, (err) => {
      if (err) {
        showToast({ style: Toast.Style.Failure, title: "Failed to open iCal file", message: err.message });
      } else {
        showToast({ style: Toast.Style.Success, title: "Event added to Apple Calendar!" });
      }
    });
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <SubmitAction title="Generate iCal Invite" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Event Details" placeholder="Paste event details here" />
    </Form>
  );
}

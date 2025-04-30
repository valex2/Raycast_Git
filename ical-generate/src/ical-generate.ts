import { showToast, ToastStyle } from "@raycast/api";
import * as chrono from "chrono-node";
import ical from "ical-generator";
import { execSync, spawnSync } from "child_process";
import fs from "fs";

interface EventDetails {
  summary: string;
  start: Date;
  end?: Date;
  location?: string;
  recurrence?: { freq: string; interval: number; byDay?: string[] };
}

// ------------------------ LLM fallback ------------------------

function parseEventWithLLM(input: string): EventDetails | null {
  const path = require("path");
  const scriptPath = path.join(__dirname, "parse_event_llm.py");
  const result = spawnSync("python3", [scriptPath, input], {
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  
  if (result.error) {
    console.error("LLM spawn error:", result.error);
    return null;
  }

  if (result.stderr) {
    console.warn("LLM stderr:", result.stderr);
  }

  const stdout = result.stdout.trim();
  if (!stdout || !stdout.includes("{")) {
    console.warn("LLM returned no JSON.");
    return null;
  }

  try {
    const jsonStart = stdout.indexOf("{");
    const jsonText = stdout.slice(jsonStart);
    const output = JSON.parse(jsonText);

    if (output.error) {
      throw new Error(output.error);
    }

    return {
      summary: output.summary || "Untitled Event",
      start: new Date(output.start),
      end: output.end ? new Date(output.end) : undefined,
      location: output.location,
    };
  } catch (e) {
    console.error("Failed to parse LLM output:", e, "\nRaw output:", stdout);
    return null;
  }
}

// ------------------------ Fallback parser ------------------------

function fallbackParseLines(input: string): Partial<EventDetails> {
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean);
  const possibleDateLine = lines.find((line) => chrono.parseDate(line));
  const start = possibleDateLine ? chrono.parseDate(possibleDateLine) : undefined;

  const timeLine = lines.find((l) => /\d{1,2}[:–-]?\d{2}/.test(l));
  const [startTime, endTime] = timeLine?.split(/[–-]/).map((t) => chrono.parseDate(`${possibleDateLine} ${t}`)) ?? [];

  const locationLine = lines.find((l) =>
    /\b(Room|Hall|Building|Auditorium|Center|Oval|Packard|Grove|Cordura|University)\b/i.test(l) ||
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+)+$/.test(l)
  );

  const locationSet = new Set([locationLine, possibleDateLine, timeLine]);
  const summaryLine = lines.find((l) => !locationSet.has(l) && l.length > 5);

  return {
    summary: summaryLine || "Untitled Event",
    location: locationLine,
    start: startTime || start,
    end: endTime,
  };
}

// ------------------------ Main parser ------------------------

function parseEventDetails(input: string): EventDetails {
  input = input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");

  const timeRangeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (timeRangeMatch) {
    const [, h1, m1 = "00", ampm1, h2, m2 = "00", ampm2] = timeRangeMatch;
    const inferredPeriod = /p\.?m\.?/i.test(input) ? "PM" : ampm1 ?? "";
    startTime = `${h1}:${m1} ${ampm1 || inferredPeriod}`.trim();
    endTime = `${h2}:${m2} ${ampm2 || inferredPeriod}`.trim();
    input = input.replace(timeRangeMatch[0], "");
  }

  const chronoResults = chrono.parse(input);
  const chronoResult = chronoResults[0];
  let startDate = chronoResult?.start?.date();
  input = input.replace(chronoResult?.text ?? "", "");

  let start: Date | undefined = startDate;
  let end: Date | undefined = undefined;

  if (startDate && startTime) {
    start = chrono.parseDate(`${startDate.toDateString()} ${startTime}`);
    end = chrono.parseDate(`${startDate.toDateString()} ${endTime}`);
  }

  const locationRegex = /\b(Room|Hall|Grove|Oval|Center|Auditorium|Building|Packard|Cordura|University)\b[^,.!?]*/i;
  const locationMatch = input.match(locationRegex);
  const location = locationMatch?.[0]?.trim();
  if (location) input = input.replace(location, "").trim();

  const summaryMatch = input.match(/^[A-Z][\w\s']+/);
  const summary = summaryMatch?.[0]?.trim() || "Untitled Event";

  const recurrenceMatch = input.match(/every\s+(week|day|month|year|[a-zA-Z]+day)/i);
  const freqMap = { week: "WEEKLY", day: "DAILY", month: "MONTHLY", year: "YEARLY" };
  const freqRaw = recurrenceMatch?.[1]?.toLowerCase();
  const freq = freqRaw && freqMap[freqRaw] ? freqMap[freqRaw] : "WEEKLY";
  const byDay = freqRaw?.endsWith("day") ? [freqRaw.substring(0, 2).toUpperCase()] : undefined;

  return {
    summary,
    start,
    end,
    location,
    recurrence: recurrenceMatch ? { freq, interval: 1, byDay } : undefined,
  };
}

// ------------------------ Timezone handler ------------------------

function convertToPacificTime(date: Date): Date {
  const options = { timeZone: "America/Los_Angeles", timeZoneName: "short" };
  return new Date(date.toLocaleString("en-US", options));
}

// ------------------------ Calendar event creator ------------------------

async function createCalendarEvent(input: string): Promise<void> {
  console.log("Received input:", input);
  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  try {
    input = input.trim().replace(/^["']|["']$/g, "");
    let event = parseEventWithLLM(input);

    if (!event || !event.start) {
      console.warn("LLM failed or returned no valid date. Falling back to regex/chrono parsing.");
      event = parseEventDetails(input);
    }
    
    const { summary, start, end, location, recurrence } = event;
    const eventStart = convertToPacificTime(start);
    const eventEnd = end ? convertToPacificTime(end) : new Date(eventStart.getTime() + 60 * 60 * 1000);

    const calendar = ical({ name: "Raycast Events" });

    const eventOptions: any = {
      start: eventStart,
      end: eventEnd,
      summary,
      location,
      description: input,
      timezone: "America/Los_Angeles",
    };

    if (recurrence) {
      eventOptions.repeating = {
        freq: recurrence.freq,
        interval: recurrence.interval,
        byDay: recurrence.byDay,
      };
    }

    calendar.createEvent(eventOptions);
    const sanitizedSummary = summary.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
    const filePath = `/tmp/${sanitizedSummary}.ics`;

    fs.writeFileSync(filePath, calendar.toString(), "utf8");
    execSync(`open ${filePath}`);

    await showToast(
      ToastStyle.Success,
      "Event added",
      `Added "${summary}" to your Apple Calendar${location ? ` at "${location}"` : ""}.`
    );
  } catch (error) {
    console.error("Error:", error);
    await showToast(ToastStyle.Failure, "Failed to create event", "An error occurred while processing the event.");
  }
}

// ------------------------ Raycast command entry point ------------------------

export default async (args: { arguments?: { text?: string } }) => {
  console.log("Args received:", args);
  const input = args.arguments?.text;
  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  await createCalendarEvent(input);
};
// ------------------------ End of file ------------------------
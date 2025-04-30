import { showToast, ToastStyle } from "@raycast/api";
import * as chrono from "chrono-node";
import ical from "ical-generator";
import { execSync } from "child_process";
import fs from "fs";

interface EventDetails {
  summary: string;
  start: Date;
  end?: Date;
  location?: string;
  recurrence?: { freq: string; interval: number; byDay?: string[] };
}

function fallbackParseLines(input: string): Partial<EventDetails> {
  const lines = input.split("\n").map(line => line.trim()).filter(Boolean);

  const possibleDateLine = lines.find(line => chrono.parseDate(line));
  const start = possibleDateLine ? chrono.parseDate(possibleDateLine) : undefined;

  const timeLine = lines.find(l => /\d{1,2}[:–-]\d{2}/.test(l)); // "2–5 p.m."
  const [startTime, endTime] = timeLine?.split(/[–-]/).map(t => chrono.parseDate(`${possibleDateLine} ${t}`)) ?? [];

  const locationLine = lines.find(l =>
    /\b(Room|Hall|Building|Auditorium|Center|Oval|Packard|Grove|Cordura|University)\b/i.test(l) ||
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+)+$/.test(l) // e.g., "Barwise Room, Cordura Hall"
  );

  const summaryLine = lines.find(l => l.length > 5 && !chrono.parseDate(l) && !/\d{1,2}[:–-]\d{2}/.test(l));

  return {
    summary: summaryLine,
    location: locationLine,
    start: startTime || start,
    end: endTime,
  };
}

function parseEventDetails(input: string): EventDetails {
  const chronoResults = chrono.parse(input);
  const chronoResult = chronoResults[0];

  let start = chronoResult?.start?.date();
  let end = chronoResult?.end?.date();
  const dateText = chronoResult?.text ?? "";

  let remainingText = input.replace(dateText, "").trim();

  const locationMatch = remainingText.match(/(?:at|in)\s+(.+)/i);
  const location = locationMatch?.[1]?.trim();
  if (locationMatch) remainingText = remainingText.replace(locationMatch[0], "").trim();

  const recurrenceMatch = input.match(/every\s+(week|day|month|year|[a-zA-Z]+day)/i);
  const freqMap = { week: "WEEKLY", day: "DAILY", month: "MONTHLY", year: "YEARLY" };
  const freqRaw = recurrenceMatch?.[1]?.toLowerCase();
  const freq = freqRaw && freqMap[freqRaw] ? freqMap[freqRaw] : "WEEKLY";
  const byDay = freqRaw?.endsWith("day") ? [freqRaw.substring(0, 2).toUpperCase()] : undefined;

  let details: EventDetails = {
    summary: remainingText || "Untitled Event",
    start,
    end,
    location,
    recurrence: recurrenceMatch ? { freq, interval: 1, byDay } : undefined,
  };

  // Fallback if chrono didn't catch it all
  if (!start || !details.summary || !location) {
    const fallback = fallbackParseLines(input);
    details = { ...details, ...fallback };
  }

  if (!details.start) throw new Error("No start time found.");

  return details;
}

function convertToPacificTime(date: Date): Date {
  const options = { timeZone: "America/Los_Angeles", timeZoneName: "short" };
  return new Date(date.toLocaleString("en-US", options));
}

async function createCalendarEvent(input: string): Promise<void> {
  console.log("Received input:", input);

  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  try {
    input = input.trim().replace(/^["']|["']$/g, "");
    const { summary, start, end, location, recurrence } = parseEventDetails(input);

    const eventStart = convertToPacificTime(start);
    const eventEnd = end ? convertToPacificTime(end) : new Date(eventStart.getTime() + 60 * 60 * 1000);

    console.log("Parsed summary:", summary);
    console.log("Parsed start:", eventStart);
    console.log("Parsed end:", eventEnd);
    console.log("Parsed location:", location);
    console.log("Parsed recurrence:", recurrence);

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

export default async (args: { arguments?: { text?: string } }) => {
  console.log("Args received:", args);
  const input = args.arguments?.text;

  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  await createCalendarEvent(input);
};

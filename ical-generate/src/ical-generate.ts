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

function parseEventDetails(input: string): EventDetails {
  const parsedResults = chrono.parse(input);
  if (parsedResults.length === 0) {
    throw new Error("Could not parse date and time.");
  }

  const parsedDate = parsedResults[0].start?.date();
  if (!parsedDate) {
    throw new Error("Could not parse a valid start date.");
  }

  // Check for end time if available
  const parsedEndDate = parsedResults[0].end?.date();

  // Remove the date/time-related text from the input
  const dateText = parsedResults[0].text; // The exact date/time string that was parsed
  let remainingText = input.replace(dateText, "").trim();

  // Extract location based on the word "at" or "in"
  const locationMatch = remainingText.match(/(?:at|in)\s+(.+)/i);
  const location = locationMatch ? locationMatch[1].trim() : undefined;

  // Remove the location text from the summary
  if (location) {
    remainingText = remainingText.replace(locationMatch[0], "").trim();
  }

  // Detect recurrence patterns (e.g., "every week," "every Wednesday")
  let recurrence: EventDetails["recurrence"] = undefined;
  const recurrenceMatch = input.match(/every\s+(week|day|month|year|[a-zA-Z]+day)/i);
  if (recurrenceMatch) {
    const freqMap: { [key: string]: string } = {
      week: "WEEKLY",
      day: "DAILY",
      month: "MONTHLY",
      year: "YEARLY",
    };

    const freq = freqMap[recurrenceMatch[1].toLowerCase()] || "WEEKLY"; // Default to WEEKLY for specific weekdays
    const byDay = freq === "WEEKLY" && recurrenceMatch[1].toLowerCase().endsWith("day")
      ? [recurrenceMatch[1].toUpperCase().substring(0, 2)] // Convert day names to ICS format (e.g., "MO", "WE")
      : undefined;

    recurrence = { freq, interval: 1, byDay };
  }

  return {
    summary: remainingText,
    start: parsedDate,
    end: parsedEndDate,
    location,
    recurrence,
  };
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

    // Add recurrence rule if present
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
      `Added "${summary}" to your Apple Calendar${location ? ` with location "${location}"` : ""}.`
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

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
}

function parseEventDetails(input: string): EventDetails {
  // Use chrono to parse the date and time from the input
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

  return {
    summary: remainingText,
    start: parsedDate,
    end: parsedEndDate,
    location,
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
    // Sanitize the input string by removing extra quotes and trimming spaces
    input = input.trim().replace(/^["']|["']$/g, "");

    // Parse event details
    const { summary, start, end, location } = parseEventDetails(input);

    // Convert start and end times to Pacific Time
    const eventStart = convertToPacificTime(start);
    const eventEnd = end ? convertToPacificTime(end) : new Date(eventStart.getTime() + 60 * 60 * 1000); // Default 1-hour duration

    console.log("Parsed summary:", summary);
    console.log("Parsed start:", eventStart);
    console.log("Parsed end:", eventEnd);
    console.log("Parsed location:", location);

    // Generate ICS
    const calendar = ical({ name: "Raycast Events" });

    calendar.createEvent({
      start: eventStart,
      end: eventEnd,
      summary,
      location,
      description: input,
      timezone: "America/Los_Angeles",
    });

    // Sanitize the filename to avoid issues with special characters
    const sanitizedSummary = summary.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
    const filePath = `/tmp/${sanitizedSummary}.ics`;

    // Write ICS content to file
    fs.writeFileSync(filePath, calendar.toString(), "utf8");

    // Open the file with the default calendar application
    execSync(`open ${filePath}`);
    await showToast(
      ToastStyle.Success,
      "Event added",
      `Added "${summary}" to your Apple Calendar with location "${location || "N/A"}".`
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

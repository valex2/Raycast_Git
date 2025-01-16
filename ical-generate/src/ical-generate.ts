import { showToast, ToastStyle } from "@raycast/api";
import * as chrono from "chrono-node";
import ical from "ical-generator";
import { execSync } from "child_process";
import fs from "fs";

interface EventDetails {
  summary: string;
  start: Date;
  location?: string;
}

function parseEventDetails(input: string): EventDetails {
  const parsedResults = chrono.parse(input);
  if (parsedResults.length === 0) {
    throw new Error("Could not parse date and time.");
  }

  const parsedDate = parsedResults[0].start?.date();
  if (!parsedDate) {
    throw new Error("Could not parse a valid date.");
  }

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
    location,
  };
}

async function createCalendarEvent(input: string): Promise<void> {
  console.log("Received input:", input);

  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  try {
    // Extract the first time option from the input
    const timePattern = /(\d{1,2}:\d{2}[APM]{2})/g; // Regex pattern to match times
    const timeMatches = input.match(timePattern);
    if (!timeMatches || timeMatches.length === 0) {
      throw new Error("Could not find valid time options.");
    }

    // Take the first time option (Option 1)
    const firstTime = timeMatches[0];
    const parsedTime = chrono.parseDate(firstTime);
    if (!parsedTime) {
      throw new Error("Could not parse the time.");
    }

    // Set the title of the event to "Major workshop"
    const summary = "Major workshop";

    // Extract the full input as notes
    const notes = input.trim();

    // Set the location to "Zoom" if it's mentioned in the input
    const locationMatch = input.match(/\(.*\)/);
    const location = locationMatch ? locationMatch[0].replace(/[()]/g, "") : undefined;

    console.log("Parsed summary:", summary);
    console.log("Parsed start:", parsedTime);
    console.log("Parsed location:", location);
    console.log("Notes:", notes);

    // Generate ICS
    const calendar = ical({ name: "Raycast Events" });
    calendar.createEvent({
      start: parsedTime,
      end: new Date(parsedTime.getTime() + 60 * 60 * 1000), // Default to 1-hour duration
      summary,
      location, // Add location if available
      description: notes, // Set the input text as the notes
    });

    // Sanitize the filename to avoid issues with special characters
    const sanitizedSummary = summary.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
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
    await showToast(ToastStyle.Failure, "Failed to create event", error.message);
  }
}


export default async (args: { arguments?: { text?: string } }) => {
  console.log("Args received:", args); // Log the full args object
  const input = args.arguments?.text; // Access the text argument
  console.log("Input extracted:", input); // Log the extracted input

  if (!input || input.trim() === "") {
    console.log("No input provided.");
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  await createCalendarEvent(input);
};

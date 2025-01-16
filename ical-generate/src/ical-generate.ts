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

// Helper function to convert to Pacific Time (UTC - 8 or UTC - 7 depending on daylight saving time)
function convertToPacificTime(date: Date): Date {
  const options = { timeZone: 'America/Los_Angeles', timeZoneName: 'short' };
  return new Date(date.toLocaleString('en-US', options));
}

async function createCalendarEvent(input: string): Promise<void> {
  console.log("Received input:", input);

  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  let titleModified = false;

  try {
    // Sanitize the input string by removing extra quotes and trimming spaces
    input = input.trim().replace(/^["']|["']$/g, '');

    // Use chrono to parse the date and time from the input (handles a wide range of formats)
    const parsedResults = chrono.parse(input);
    if (parsedResults.length === 0 || !parsedResults[0].start) {
      console.warn("Could not find a valid date and time, proceeding with default behavior.");
    }

    const parsedDateTime = parsedResults.length > 0 && parsedResults[0].start ? parsedResults[0].start : undefined;

    // If parsedDateTime is invalid, use the current date as a fallback
    let eventStart = parsedDateTime ? new Date(parsedDateTime) : new Date();
    if (isNaN(eventStart.getTime())) {
      console.warn("Invalid parsed date, using current date and time as fallback.");
      titleModified = true;
      eventStart = new Date(); // Default to current date if parsed date is invalid
    }

    // Convert the event start time to Pacific Time
    eventStart = convertToPacificTime(eventStart);
    const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000); // Default to 1-hour duration

    // Extract the event summary (title) from the input before "Date:"
    let summary = input.split("Date:")[0].trim() || "Untitled Event";
    if (titleModified) {
      summary = `*** ${summary}`; // Add "***" to the summary to indicate a default was used
    }

    // Extract the full input as notes (everything after "Date:" including Zoom Link if present)
    const notes = input.trim();

    // Extract location (if present) using a regex looking for "Location:"
    const locationMatch = input.match(/Location:\s*([\s\S]+?)(?=\s*(Zoom Link:|$))/);
    const location = locationMatch ? locationMatch[1].trim() : "Location not specified";

    // Extract Zoom link (if present)
    const zoomLinkMatch = input.match(/Zoom Link:\s*(https?:\/\/\S+)/);
    const zoomLink = zoomLinkMatch ? zoomLinkMatch[1].trim() : undefined;

    console.log("Parsed summary:", summary);
    console.log("Parsed start:", eventStart);
    console.log("Parsed location:", location);
    console.log("Notes:", notes);

    // Generate ICS
    const calendar = ical({ name: "Raycast Events" });

    // Add event to the calendar with the Pacific Time zone
    const eventOptions: any = {
      start: eventStart,
      end: eventEnd, // Default to 1-hour duration
      summary,
      location, // Add location if available
      description: notes, // Set the input text as the notes
      timezone: 'America/Los_Angeles', // Set the timezone to Pacific Time
    };

    // If Zoom link exists, add it to the notes
    if (zoomLink) {
      eventOptions.description += `\nZoom Link: ${zoomLink}`;
    }

    calendar.createEvent(eventOptions);

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
    await showToast(ToastStyle.Failure, "Failed to create event", "An error occurred while processing the event.");
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

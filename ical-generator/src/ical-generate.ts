import { showToast, ToastStyle } from "@raycast/api";
import ical from "ical-generator";
import { execSync } from "child_process";
import fs from "fs";
import { PythonShell } from "python-shell";

interface EventDetails {
  title: string;
  start?: string;
  end?: string;
  location?: string;
  summary?: string;
}

// Function to parse event details using the Python script
async function parseEventDetailsWithSpaCy(input: string): Promise<EventDetails> {
  return new Promise((resolve, reject) => {
    // Python script file path
    const scriptPath = "/Users/Vassilis/Desktop/Raycast/ical-generator/parse_event_details.py";

    PythonShell.run(
      scriptPath,
      {
        pythonPath: "/Users/Vassilis/Desktop/Raycast/ical-env/bin/python3", // Path to virtual environment's Python
        args: [input],
      },
      (err, results) => {
        if (err) {
          console.error("Error executing Python script:", err);
          reject("Failed to parse event details.");
        } else {
          console.log("Raw Python Script Output:", results); // Log raw results for debugging
          try {
            const parsedDetails = JSON.parse(results?.[0] || "{}");
            console.log("Parsed Event Details:", parsedDetails);
            resolve(parsedDetails);
          } catch (parseError) {
            console.error("Error parsing Python script output:", parseError);
            reject("Failed to parse event details.");
          }
        }
      }
    );
  });
}

// Function to create a calendar event and open it in the calendar app
async function createCalendarEvent(input: string): Promise<void> {
  console.log("Received input:", input);

  if (!input || input.trim() === "") {
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  try {
    const { title, start, end, location, summary } = await parseEventDetailsWithSpaCy(input);

    console.log("Event Details from Python Script:", { title, start, end, location, summary });

    if (!title || !start) {
      console.error("Title or start time is missing:", { title, start });
      throw new Error("Failed to extract key event details.");
    }

    // Generate ICS
    const calendar = ical({ name: "Raycast Events" });
    calendar.createEvent({
      start: new Date(start),
      end: end ? new Date(end) : new Date(new Date(start).getTime() + 60 * 60 * 1000), // Default duration: 1 hour
      summary: title,
      description: summary,
      location,
    });

    const filePath = `/tmp/${title.replace(/\s+/g, "_")}.ics`;
    console.log("ICS File Path:", filePath);

    // Write the ICS file
    fs.writeFileSync(filePath, calendar.toString(), "utf8");
    console.log("ICS File Written Successfully:", filePath);

    // Open the ICS file with the default calendar application
    execSync(`open ${filePath}`);
    console.log("ICS File Opened in Calendar App.");

    await showToast(
      ToastStyle.Success,
      "Event added",
      `Added "${title}" to your Apple Calendar.`
    );
  } catch (error) {
    console.error("Error creating calendar event:", error);
    await showToast(ToastStyle.Failure, "Failed to create event", error.message);
  }
}


// Main entry point for the Raycast command
export default async (args: { arguments?: { text?: string } }) => {
  console.log("Args received:", args); // Log the full args object

  // Extract input from the arguments
  const input = args.arguments?.text?.trim();
  console.log("Extracted input:", input);

  if (!input) {
    console.log("No input provided.");
    await showToast(ToastStyle.Failure, "Input required", "Please describe the event details.");
    return;
  }

  await createCalendarEvent(input);
};

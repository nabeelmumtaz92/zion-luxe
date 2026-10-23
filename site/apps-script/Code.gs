// ZionLuxe Leads — Google Apps Script web app (receives the site form and appends a row).
// Setup: create a Google Sheet named "ZionLuxe Leads", Extensions > Apps Script, paste this file,
// Deploy > New deployment > Web app (Execute as: Me, Access: Anyone). Paste the /exec URL into
// FORM_ENDPOINT in script.js.
const HEADERS = ["Date","Name","Phone","Email","Destination","Dates","Travelers","Trip type","Budget","Source","Status","Next follow-up","Notes"];

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  const p = e.parameter;
  sheet.appendRow([new Date(), p.name, p.phone, p.email, p.destination, p.dates,
    p.travelers, p.tripType, p.budget, p.source || "", "New", "", p.notes || ""]);
  return ContentService.createTextOutput("ok");
}

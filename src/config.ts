import "dotenv/config";

export type AppConfig = {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  sharepointExcelUrl: string;
  googleCalendarName: string;
  timeZone: string;
  eventStart: string;
  eventEnd: string;
};

export function loadConfig(): AppConfig {
  return {
    googleClientId: requiredEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost",
    sharepointExcelUrl:
      process.env.SHAREPOINT_EXCEL_URL ||
      "https://nibm-my.sharepoint.com/:x:/g/personal/chandula_nibm_lk/IQDBA5Scq1DVRoesV2lJmSQXAVCeRXoAYpFP3J_IBQVhao8?download=1",
    googleCalendarName: process.env.GOOGLE_CALENDAR_NAME || "NIBM Schedule",
    timeZone: process.env.TIMEZONE || "Asia/Colombo",
    eventStart: process.env.EVENT_START || "09:00",
    eventEnd: process.env.EVENT_END || "16:00"
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

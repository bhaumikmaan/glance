import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { CursorUsageMetric, CursorUsageTimeframe, DashboardSnapshot } from "../domain/types";

const execFile = promisify(execFileCallback);

const USAGE_SUMMARY_URL = "https://cursor.com/api/usage-summary";
const TEAMS_URL = "https://cursor.com/api/dashboard/teams";
const FILTERED_USAGE_EVENTS_URL = "https://cursor.com/api/dashboard/get-filtered-usage-events";
const CLASSIFICATION_URL = "https://cursor.com/api/v2/analytics/team/conversation-classification";
const SEGMENTS_URL = "https://cursor.com/api/v2/analytics/team/conversation-segments";
const USAGE_DASHBOARD_URL = "https://cursor.com/dashboard/usage";
const ACCESS_TOKEN_KEY = "cursorAuth/accessToken";

type HistogramItem = { label: string; count: number };

type SnapshotShape = DashboardSnapshot["cursorUsage"];

export class CursorUsageService {
  private selectedTimeframe: CursorUsageTimeframe = "mtd";
  private selectedMetric: CursorUsageMetric = "categories";
  private cached?: SnapshotShape;
  private lastAuthError?: string;

  async setPreferences(payload: {
    timeframe?: CursorUsageTimeframe;
    metric?: CursorUsageMetric;
  }): Promise<void> {
    if (payload.timeframe) {
      this.selectedTimeframe = payload.timeframe;
    }
    if (payload.metric) {
      this.selectedMetric = payload.metric;
    }
  }

  getUsageDashboardUrl(): string {
    return USAGE_DASHBOARD_URL;
  }

  async getSnapshot(): Promise<SnapshotShape> {
    try {
      const authHeaders = await this.getAuthHeaders();
      const usageSummary = await this.fetchUsageSummary(authHeaders);
      const billingCycleStart = new Date(usageSummary.billingCycleStart);
      const billingCycleEnd = new Date(usageSummary.billingCycleEnd);
      const teamId = await this.fetchTeamId(authHeaders);
      const [recentResponse, classificationRaw, segmentsRaw] = await Promise.all([
        this.fetchFilteredEvents(authHeaders, {
          teamId,
          startDate: billingCycleStart.getTime(),
          endDate: billingCycleEnd.getTime(),
          page: 1,
          pageSize: 3
        }),
        this.fetchInsights(authHeaders, CLASSIFICATION_URL, this.selectedTimeframe),
        this.fetchInsights(authHeaders, SEGMENTS_URL, this.selectedTimeframe)
      ]);

      const normalized = this.buildSnapshot({
        usageSummary,
        recentEvents: recentResponse.usageEventsDisplay,
        classificationRaw,
        segmentsRaw
      });
      this.cached = normalized;
      this.lastAuthError = undefined;
      return normalized;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const base = this.cached ?? this.emptySnapshot();
      return {
        ...base,
        authenticated: false,
        reachable: false,
        warning: `Cursor usage unavailable: ${message}`
      };
    }
  }

  private buildSnapshot(payload: {
    usageSummary: {
      usedCents: number;
      limitCents: number;
      remainingCents: number;
      billingCycleStart: string;
      billingCycleEnd: string;
    };
    recentEvents: Array<Record<string, unknown>>;
    classificationRaw: unknown;
    segmentsRaw: unknown;
  }): SnapshotShape {
    const usedCents = payload.usageSummary.usedCents;
    const limitCents = payload.usageSummary.limitCents;
    const remainingCents = payload.usageSummary.remainingCents;
    const progressPercent =
      limitCents > 0 ? Math.max(0, Math.min(100, Math.round((usedCents / limitCents) * 100))) : 0;

    const recentRequests = payload.recentEvents.map((event, index) => ({
      id: `${String(event.timestamp ?? "unknown")}-${index}`,
      timestamp: String(event.timestamp ?? new Date().toISOString()),
      model: String(event.model ?? "Unknown"),
      chargedCents: numberOrZero(event.chargedCents),
      conversationId: typeof event.conversationId === "string" ? event.conversationId : undefined
    }));

    const classification = parseClassification(payload.classificationRaw);
    const segments = parseSegments(payload.segmentsRaw);
    const selected = pickMetricHistogram(classification, segments, this.selectedMetric);
    const total = selected.reduce((sum, item) => sum + item.count, 0);

    return {
      authenticated: true,
      reachable: true,
      monthly: {
        usedCents,
        limitCents,
        remainingCents,
        progressPercent,
        billingCycleStart: payload.usageSummary.billingCycleStart,
        billingCycleEnd: payload.usageSummary.billingCycleEnd
      },
      recentRequests,
      conversationInsights: {
        timeframe: this.selectedTimeframe,
        metric: this.selectedMetric,
        segments: selected.map((item) => ({
          label: item.label,
          count: item.count,
          percentage: total > 0 ? Number(((item.count / total) * 100).toFixed(1)) : 0
        }))
      },
      usageDashboardUrl: USAGE_DASHBOARD_URL,
      lastUpdated: new Date().toISOString()
    };
  }

  private emptySnapshot(): SnapshotShape {
    return {
      authenticated: false,
      reachable: false,
      monthly: {
        usedCents: 0,
        limitCents: 0,
        remainingCents: 0,
        progressPercent: 0
      },
      recentRequests: [],
      conversationInsights: {
        timeframe: this.selectedTimeframe,
        metric: this.selectedMetric,
        segments: []
      },
      usageDashboardUrl: USAGE_DASHBOARD_URL
    };
  }

  private async fetchUsageSummary(authHeaders: Record<string, string>): Promise<{
    usedCents: number;
    limitCents: number;
    remainingCents: number;
    billingCycleStart: string;
    billingCycleEnd: string;
  }> {
    const data = await this.fetchJson(USAGE_SUMMARY_URL, {
      method: "GET",
      headers: authHeaders
    });
    const root = asRecord(data);
    const individualUsage = asRecord(root.individualUsage);
    const overall = asRecord(individualUsage.overall);

    return {
      usedCents: numberOrZero(overall.used),
      limitCents: numberOrZero(overall.limit),
      remainingCents: numberOrZero(overall.remaining),
      billingCycleStart: String(root.billingCycleStart ?? new Date().toISOString()),
      billingCycleEnd: String(root.billingCycleEnd ?? new Date().toISOString())
    };
  }

  private async fetchTeamId(authHeaders: Record<string, string>): Promise<number> {
    const data = await this.fetchJson(TEAMS_URL, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Origin: "https://cursor.com"
      },
      body: "{}"
    });
    const record = asRecord(data);
    const teams = Array.isArray(record.teams) ? record.teams : [];
    if (teams.length < 1) {
      return 0;
    }
    const firstTeam = asRecord(teams[0]);
    return numberOrZero(firstTeam.id);
  }

  private async fetchFilteredEvents(
    authHeaders: Record<string, string>,
    payload: {
      teamId: number;
      startDate: number;
      endDate: number;
      page: number;
      pageSize: number;
    }
  ): Promise<{ usageEventsDisplay: Array<Record<string, unknown>> }> {
    const data = await this.fetchJson(FILTERED_USAGE_EVENTS_URL, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        Origin: "https://cursor.com"
      },
      body: JSON.stringify(payload)
    });

    const record = asRecord(data);
    const rawEvents = Array.isArray(record.usageEventsDisplay) ? record.usageEventsDisplay : [];
    return { usageEventsDisplay: rawEvents.map(asRecord) };
  }

  private async fetchInsights(
    authHeaders: Record<string, string>,
    endpoint: string,
    timeframe: CursorUsageTimeframe
  ): Promise<unknown> {
    const range = getDateRangeForTimeframe(timeframe);
    const url = new URL(endpoint);
    url.searchParams.set("startDate", range.startDate);
    url.searchParams.set("endDate", range.endDate);
    return this.fetchJson(url.toString(), { method: "GET", headers: authHeaders });
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.readAccessToken();
    const userId = extractUserIdFromToken(accessToken);
    return {
      Cookie: `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}`
    };
  }

  private async readAccessToken(): Promise<string> {
    const dbPath = resolveCursorStateDbPath();
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Cursor state DB not found at ${dbPath}`);
    }
    try {
      return readAccessTokenViaNodeSqlite(dbPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("cursorAuth/accessToken missing")) {
        this.lastAuthError = message;
        throw error;
      }
      try {
        return await readAccessTokenViaSqliteCli(dbPath);
      } catch (fallbackError) {
        this.lastAuthError =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        throw fallbackError;
      }
    }
  }
}

function resolveCursorStateDbPath(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(
      home,
      "Library",
      "Application Support",
      "Cursor",
      "User",
      "globalStorage",
      "state.vscdb"
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(config, "Cursor", "User", "globalStorage", "state.vscdb");
}

function readAccessTokenViaNodeSqlite(dbPath: string): string {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(ACCESS_TOKEN_KEY);
    const value = row?.value;
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("cursorAuth/accessToken missing in state.vscdb");
    }
    return value.trim();
  } finally {
    db.close();
  }
}

async function readAccessTokenViaSqliteCli(dbPath: string): Promise<string> {
  const sql = `SELECT value FROM ItemTable WHERE key='${ACCESS_TOKEN_KEY}';`;
  const { stdout } = await execFile("sqlite3", [dbPath, sql], {
    maxBuffer: 2 * 1024 * 1024,
    timeout: 15_000
  });
  const value = stdout.trim();
  if (!value) {
    throw new Error("cursorAuth/accessToken missing in state.vscdb");
  }
  return value;
}

function extractUserIdFromToken(token: string): string {
  const payload = decodeJwtPayload(token);
  const sub = String(payload.sub ?? "");
  const maybeUserId = sub.includes("|") ? (sub.split("|").pop() ?? "") : sub;
  if (maybeUserId.startsWith("user_")) {
    return maybeUserId;
  }
  const match = sub.match(/user_[A-Za-z0-9]+/);
  if (match) {
    return match[0];
  }
  throw new Error("Could not extract user id from Cursor access token.");
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) {
    return {};
  }
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseClassification(data: unknown): {
  intentDistribution: HistogramItem[];
  categories: HistogramItem[];
  taskComplexity: HistogramItem[];
  promptSpecificity: HistogramItem[];
} {
  const record = asRecord(data);
  return {
    intentDistribution: parseHistogram(record.intent_distribution, ["intent"]),
    categories: parseHistogram(record.categories_histogram, ["category"]),
    taskComplexity: parseHistogram(record.complexity_distribution, ["complexity"]),
    promptSpecificity: parseHistogram(record.guidance_level_distribution, [
      "guidance_level",
      "guidanceLevel"
    ])
  };
}

function parseSegments(data: unknown): {
  workType: HistogramItem[];
  categories: HistogramItem[];
  promptSpecificity: HistogramItem[];
} {
  const record = asRecord(data);
  return {
    workType: parseHistogram(record.work_type_histogram, ["work_type", "workType"]),
    categories: parseHistogram(record.categories_histogram, ["category"]),
    promptSpecificity: parseHistogram(record.guidance_level_distribution, [
      "guidance_level",
      "guidanceLevel"
    ])
  };
}

function parseHistogram(value: unknown, labelKeys: string[]): HistogramItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: HistogramItem[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const count = numberOrZero(record.count);
    if (count < 0) {
      continue;
    }
    const label = readLabel(record, labelKeys);
    if (!label) {
      continue;
    }
    parsed.push({ label, count });
  }
  return parsed;
}

function readLabel(record: Record<string, unknown>, preferred: string[]): string | undefined {
  for (const key of preferred) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "count") {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickMetricHistogram(
  classification: {
    intentDistribution: HistogramItem[];
    categories: HistogramItem[];
    taskComplexity: HistogramItem[];
    promptSpecificity: HistogramItem[];
  },
  segments: {
    workType: HistogramItem[];
    categories: HistogramItem[];
    promptSpecificity: HistogramItem[];
  },
  metric: CursorUsageMetric
): HistogramItem[] {
  if (metric === "workType") {
    return segments.workType;
  }
  if (metric === "intentDistribution") {
    return classification.intentDistribution;
  }
  if (metric === "taskComplexity") {
    return classification.taskComplexity;
  }
  if (metric === "promptSpecificity") {
    return segments.promptSpecificity.length
      ? segments.promptSpecificity
      : classification.promptSpecificity;
  }
  return segments.categories.length ? segments.categories : classification.categories;
}

function getDateRangeForTimeframe(timeframe: CursorUsageTimeframe): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const start = new Date(end);
  if (timeframe === "1d") {
    start.setDate(end.getDate() - 1);
  } else if (timeframe === "7d") {
    start.setDate(end.getDate() - 7);
  } else if (timeframe === "30d") {
    start.setDate(end.getDate() - 30);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end)
  };
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

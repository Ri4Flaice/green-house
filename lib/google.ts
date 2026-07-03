import { auth } from "@/auth";

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const SHEETS_ENDPOINT = "https://sheets.googleapis.com/v4/spreadsheets";

export type GoogleSpreadsheet = {
  id: string;
  name: string;
  modifiedTime?: string;
};

export type SheetValues = {
  sheetTitle: string;
  values: string[][];
};

export type SpreadsheetSheet = {
  title: string;
  index: number;
};

type DriveFilesResponse = {
  files?: GoogleSpreadsheet[];
  nextPageToken?: string;
};

type SpreadsheetMetaResponse = {
  sheets?: Array<{
    properties?: {
      title?: string;
      index?: number;
      sheetType?: string;
      hidden?: boolean;
    };
  }>;
};

type ValuesResponse = {
  values?: string[][];
};

export async function getAccessToken() {
  const session = await auth();

  if (session?.error === "RefreshTokenError") {
    throw new Error("Сессия Google истекла. Выйдите из аккаунта и войдите через Google заново.");
  }

  if (!session?.accessToken) {
    throw new Error("Не удалось получить доступ к Google. Войдите через Google заново.");
  }

  return session.accessToken;
}

function getGoogleApiErrorMessage(status: number, errorText: string) {
  if (status === 401) {
    return "Доступ к Google истек или был отозван. Выйдите из аккаунта и войдите через Google заново.";
  }

  if (status === 403) {
    return "У аккаунта Google нет доступа к этой таблице или нужные разрешения не выданы.";
  }

  if (status === 404) {
    return "Google таблица не найдена. Проверьте, что таблица существует и доступна этому аккаунту.";
  }

  return `Не удалось выполнить запрос к Google API. Код ошибки: ${status}. ${errorText}`;
}

async function googleFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(getGoogleApiErrorMessage(response.status, errorText));
  }

  return response.json() as Promise<T>;
}

export async function listSpreadsheets(accessToken: string) {
  const spreadsheets: GoogleSpreadsheet[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      fields: "nextPageToken,files(id,name,modifiedTime)"
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const data = await googleFetch<DriveFilesResponse>(
      `${DRIVE_FILES_ENDPOINT}?${params.toString()}`,
      accessToken
    );

    spreadsheets.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
    pageCount += 1;
  } while (pageToken && pageCount < 5);

  return spreadsheets;
}

export async function listSpreadsheetSheets(spreadsheetId: string, accessToken: string) {
  const metadata = await googleFetch<SpreadsheetMetaResponse>(
    `${SHEETS_ENDPOINT}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(title,index,sheetType,hidden)`,
    accessToken
  );

  return (metadata.sheets ?? [])
    .map((sheet) => sheet.properties)
    .filter((properties) => properties?.title && properties.sheetType !== "OBJECT" && !properties.hidden)
    .map((properties) => ({
      title: properties?.title ?? "",
      index: properties?.index ?? 0
    }))
    .sort((left, right) => left.index - right.index);
}

export async function readSheetValues(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<SheetValues> {
  const escapedTitle = sheetTitle.replaceAll("'", "''");
  const range = `'${escapedTitle}'!A:ZZ`;
  const values = await googleFetch<ValuesResponse>(
    `${SHEETS_ENDPOINT}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    accessToken
  );

  return {
    sheetTitle,
    values: values.values ?? []
  };
}

export async function readSelectedSheetValues(
  spreadsheetId: string,
  sheetTitles: string[],
  accessToken: string
) {
  const visibleSheets = await listSpreadsheetSheets(spreadsheetId, accessToken);
  const requestedTitles = new Set(sheetTitles.map((title) => title.trim()).filter(Boolean));
  const selectedSheets = visibleSheets.filter((sheet) => requestedTitles.has(sheet.title));

  if (!visibleSheets.length) {
    throw new Error("В Google таблице нет видимых листов с данными.");
  }

  if (!selectedSheets.length) {
    throw new Error("Выбранные листы не найдены или скрыты в Google таблице.");
  }

  return Promise.all(
    selectedSheets.map((sheet) => readSheetValues(spreadsheetId, sheet.title, accessToken))
  );
}

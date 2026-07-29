import { Job } from './types';

// Search for existing spreadsheet in Google Drive
async function findSpreadsheet(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent("name = 'Remix Cashflow Tracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to search Google Drive: ${errText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

// Create a new spreadsheet
async function createSpreadsheet(accessToken: string): Promise<string> {
  const url = 'https://www.googleapis.com/drive/v3/files';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Remix Cashflow Tracker',
      mimeType: 'application/vnd.google-apps.spreadsheet',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create Google Spreadsheet: ${errText}`);
  }

  const data = await response.json();
  return data.id;
}

// Fetch the title of the first sheet inside the spreadsheet
async function getFirstSheetTitle(accessToken: string, spreadsheetId: string): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    // Fallback if metadata read fails
    return 'Sheet1';
  }

  const data = await response.json();
  if (data.sheets && data.sheets.length > 0) {
    return data.sheets[0].properties.title;
  }
  return 'Sheet1';
}

// Format date nicely
function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Main sync function
export async function syncToGoogleSheets(
  accessToken: string,
  jobs: Job[]
): Promise<{ spreadsheetId: string; url: string }> {
  // 1. Find or create spreadsheet
  let spreadsheetId = await findSpreadsheet(accessToken);
  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(accessToken);
  }

  // 2. Get first sheet name
  const sheetTitle = await getFirstSheetTitle(accessToken, spreadsheetId);

  // 3. Prepare headers and rows
  const headers = [
    'ID งาน',
    'ชื่องาน',
    'ประเภทงาน',
    'ลูกค้า',
    'มูลค่ารวมก่อนหักภาษี (บาท)',
    'รับเงินแล้ว (บาท)',
    'คงเหลือค้างรับ (บาท)',
    'สถานะงาน/การชำระเงิน',
    'เครดิตเทอม (วัน)',
    'วันที่เริ่มงาน/ตกลงจ้าง',
    'วันกำหนดออนแอร์/ส่งงาน',
    'วันกำหนดชำระเงิน (Due Date)',
    'อัตราหัก ณ ที่จ่าย (%)',
    'ภาษีหัก ณ ที่จ่าย (บาท)',
    'วันทำการเท่านั้น (ไม่ใช่เสาร์อาทิตย์)',
    'บันทึกข้อความเพิ่มเติม',
  ];

  const rows = jobs.map((job) => {
    const whtRateVal = job.whtRate || 0;
    const whtAmountVal = job.whtAmount || Math.round(job.value * (whtRateVal / 100));
    return [
      job.id || '-',
      job.name || '-',
      job.type || 'Sponsored',
      job.client || '-',
      job.value || 0,
      job.received || 0,
      job.pending || 0,
      job.status || '-',
      job.creditTerm || 0,
      formatDate(job.startDate),
      formatDate(job.postDate),
      formatDate(job.payDate),
      whtRateVal,
      whtAmountVal,
      job.excludeHolidays ? 'ใช่' : 'ไม่ใช่',
      job.note || '',
    ];
  });

  const values = [headers, ...rows];

  // 4. Write data using batchUpdate or update values
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!A1?valueInputOption=USER_ENTERED`;
  
  const writeResponse = await fetch(writeUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: `${sheetTitle}!A1`,
      majorDimension: 'ROWS',
      values: values,
    }),
  });

  if (!writeResponse.ok) {
    const errText = await writeResponse.text();
    throw new Error(`Failed to write to Google Sheet: ${errText}`);
  }

  // Auto format header row (make it bold and background color) to be super beautiful!
  // We can do this using batchUpdate endpoint.
  try {
    const formatUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await fetch(formatUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0, // usually first sheet has ID 0, but if not it will ignore/gracefully skip
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.1,
                    green: 0.5,
                    blue: 0.3,
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 1.0,
                      green: 1.0,
                      blue: 1.0,
                    },
                  },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
        ],
      }),
    });
  } catch (e) {
    // If format fails, do not block the sync process
    console.error('Styling headers failed:', e);
  }

  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return { spreadsheetId, url };
}

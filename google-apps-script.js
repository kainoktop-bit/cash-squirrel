/**
 * Google Apps Script: Automated Financial Reports & Overdue Credit Reminders
 * 
 * Instructions:
 * 1. Open Google Sheets or go to https://script.google.com
 * 2. Create a new project and paste this script.
 * 3. In the script editor, click the clock icon (Triggers ⏰) on the left sidebar.
 * 4. Click "+ Add Trigger" at the bottom right, and set up TWO automated scheduled triggers:
 *    
 *    Trigger A: [ระบบส่งสรุปยอดเงินรายเดือน]
 *    - Choose function to run: "sendMonthlyCashFlowReport"
 *    - Choose deployment: "Head"
 *    - Event source: "Time-driven"
 *    - Type of time-based trigger: "Month timer"
 *    - Day of month: "1" (runs on the 1st of every month)
 *    - Time of day: "Midnight to 1am" (or any slot you prefer)
 *    
 *    Trigger B: [ระบบเช็คและทวงเงินค้างจ่ายอัตโนมัติ]
 *    - Choose function to run: "sendOverduePaymentAlerts"
 *    - Choose deployment: "Head"
 *    - Event source: "Time-driven"
 *    - Type of time-based trigger: "Day timer"
 *    - Time of day: "8am to 9am" (checks and alerts you every morning)
 * 
 * 5. Save and authorize Google permissions to allow sending email.
 * 
 * Once saved, this script runs completely in Google's cloud server hands-free!
 * It automatically syncs with your Supabase Cloud Database to fetch live data!
 */

// Cloud Connection Config
const SUPABASE_URL = "https://yyzdadhwogumkazfkvsk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_E8iQRzBcctPPsn0ts4jOHg_10O0ab_r"; // Your publishable key

/**
 * Trigger A: Main trigger function to send monthly cashflow reports
 * Runs on the 1st of every month.
 */
function sendMonthlyCashFlowReport() {
  try {
    Logger.log("Starting monthly cash flow report generator...");
    
    // Calculate last month period
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthKey = lastMonth.toISOString().substring(0, 7); // e.g. "2026-05"
    
    const monthNames = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const monthDisplay = monthNames[lastMonth.getMonth()] + " " + (lastMonth.getFullYear() + 543); // Thai Buddhist Era

    // 1. Fetch data from Supabase Cloud Database (using the user_cashflow_data table)
    const url = SUPABASE_URL + "/rest/v1/user_cashflow_data?select=*";
    const options = {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText() ? response.getContentText().trim() : "";
    
    if (responseCode !== 200) {
      throw new Error("Failed to fetch from Supabase. Status: " + responseCode + ", Response: " + responseText);
    }
    
    // Validate if response is HTML instead of JSON (e.g. project paused or wrong URL)
    if (responseText.indexOf("<!doctype") === 0 || responseText.indexOf("<!DOCTYPE") === 0 || responseText.indexOf("<html") === 0 || responseText.indexOf("<HTML") === 0) {
      throw new Error("\n\n[ข้อผิดพลาดการเชื่อมต่อ Supabase / Supabase Connection Error]\n" +
                      "--------------------------------------------------------------------------------\n" +
                      "สคริปต์ได้รับข้อมูลกลับมาเป็นหน้าเว็บ HTML แทนที่จะเป็นข้อมูลแบบ JSON!\n" +
                      "สาเหตุที่เป็นไปได้:\n" +
                      "1. คุณระบุค่า SUPABASE_URL ในสคริปต์นี้ผิด (ระบุเป็นที่อยู่ลิงก์แอปพลิเคชันนี้เอง หรือหน้าเว็บพอร์ทัล Supabase)\n" +
                      "   --> ค่าที่ถูกต้องจะต้องเป็น URL ของ API ตัวจริง เช่น https://xxxxxx.supabase.co\n" +
                      "2. โครงการ Supabase ของคุณถูก 'Pause' ชั่วคราว (กรุณาเข้าไปที่ Supabase Dashboard แล้วกด Restore เพื่อให้กลับมาทำงาน)\n" +
                      "3. ตาราง 'user_cashflow_data' ในระบบฐานข้อมูลมีการตั้งค่าสิทธิ์เข้าถึง (RLS) หรือการกรองที่ส่งผลให้เกิดการ Redirect\n\n" +
                      "ค่า SUPABASE_URL ปัจจุบันที่ระบุในสคริปต์คือ: " + SUPABASE_URL + "\n" +
                      "--------------------------------------------------------------------------------\n");
    }
    
    let allUsersData;
    try {
      allUsersData = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error("ไม่สามารถแปลงข้อมูลที่ได้รับจาก Supabase เป็น JSON ได้ (Error: " + parseErr.toString() + "). เนื้อหาข้อมูลที่ได้รับ: " + responseText.substring(0, 300));
    }
    
    if (!allUsersData || allUsersData.length === 0) {
      Logger.log("No user data found in Supabase.");
      return;
    }

    // Process report for each user account
    allUsersData.forEach(userData => {
      const userEmail = userData.email;
      const notifSettings = userData.notif_settings || {};
      
      // Check if notifications are disabled
      if (notifSettings.enabled === false) {
        Logger.log("Monthly report skipped: notifications are disabled for " + userEmail);
        return;
      }
      
      const recipientEmail = notifSettings.alertEmail || userEmail;
      const jobs = userData.jobs || [];
      const expenses = userData.expenses || [];
      const settings = userData.settings || { monthlyRevenueGoal: 50000, savingsPercentage: 40 };
      
      // Filter jobs and expenses for the target month
      const targetMonthJobs = jobs.filter(j => j.postDate && j.postDate.substring(0, 7) === monthKey);
      const targetMonthExpenses = expenses.filter(e => e.date && e.date.substring(0, 7) === monthKey);
      
      // Calculate totals
      const totalContract = targetMonthJobs.reduce((sum, j) => sum + (parseFloat(j.value) || 0), 0);
      const totalReceived = targetMonthJobs.reduce((sum, j) => sum + (parseFloat(j.received) || 0), 0);
      const totalPending = targetMonthJobs.reduce((sum, j) => sum + (parseFloat(j.pending) || 0), 0);
      
      // Include the baseline monthly expense (default is 12,000 Baht, matching app criteria)
      const fixedExpense = settings.monthlyExpense !== undefined ? (parseFloat(settings.monthlyExpense) || 0) : 12000;
      const totalVariableExpense = targetMonthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      const totalExpenses = fixedExpense + totalVariableExpense;
      const netCashFlow = totalReceived - totalExpenses;
      const savingsPercentage = settings.savingsPercentage !== undefined ? (parseFloat(settings.savingsPercentage) || 0) : 40;
      const actualSavings = Math.round(totalReceived * (savingsPercentage / 100));
      
      const completedDeals = targetMonthJobs.filter(j => j.pending === 0 || j.status === "done");
      
      // Build HTML Email Report
      const htmlBody = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff; color: #1f2937;">
          <div style="text-align: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
            <span style="background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 50px; text-transform: uppercase; letter-spacing: 1px;">Monthly Financial Report</span>
            <h1 style="color: #065f46; font-size: 22px; margin: 8px 0 0 0;">สรุปงบกระแสเงินสดรอบเดือน ${monthDisplay}</h1>
            <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0 0;">บัญชีผู้ใช้: ${userEmail}</p>
          </div>
          
          <!-- Summary Cards -->
          <div style="margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 50%; padding: 6px; box-sizing: border-box;">
                  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px; text-align: center;">
                    <span style="font-size: 10px; color: #15803d; text-transform: uppercase; font-weight: bold;">รายรับจริง (Received)</span>
                    <div style="font-size: 18px; font-weight: 800; color: #166534; margin-top: 4px;">฿${totalReceived.toLocaleString()}</div>
                  </div>
                </td>
                <td style="width: 50%; padding: 6px; box-sizing: border-box;">
                  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px; text-align: center;">
                    <span style="font-size: 10px; color: #b91c1c; text-transform: uppercase; font-weight: bold;">รายจ่ายจริง (Expenses)</span>
                    <div style="font-size: 18px; font-weight: 800; color: #991b1b; margin-top: 4px;">฿${totalExpenses.toLocaleString()}</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 6px; box-sizing: border-box;">
                  <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px; text-align: center; margin-top: 4px;">
                    <span style="font-size: 11px; color: #1d4ed8; text-transform: uppercase; font-weight: bold;">กระแสเงินสดสุทธิคงเหลือ (Net Cash Flow)</span>
                    <div style="font-size: 24px; font-weight: 900; color: ${netCashFlow >= 0 ? '#1e40af' : '#b91c1c'}; margin-top: 4px;">฿${netCashFlow.toLocaleString()}</div>
                  </div>
                </td>
              </tr>
            </table>
          </div>
          
          <!-- Financial metrics table -->
          <div style="margin-bottom: 24px; background-color: #f9fafb; border-radius: 12px; padding: 16px; border: 1px solid #f3f4f6;">
            <h3 style="font-size: 13px; color: #374151; margin: 0 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; font-weight: bold;">รายละเอียดการเงินแยกตามส่วน</h3>
            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
              <tr style="border-bottom: 1px dashed #e5e7eb;">
                <td style="padding: 6px 0; color: #4b5563;">มูลค่ารวมสัญญาดีลทั้งหมด:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">฿${totalContract.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e5e7eb;">
                <td style="padding: 6px 0; color: #4b5563;">ยอดโอนรับแล้วจริง:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #059669;">฿${totalReceived.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e5e7eb;">
                <td style="padding: 6px 0; color: #4b5563;">หัก ค่าใช้จ่ายคงที่รายเดือน (ตามเกณฑ์):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #b91c1c;">฿${fixedExpense.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e5e7eb;">
                <td style="padding: 6px 0; color: #4b5563;">หัก รายจ่ายผันแปรเพิ่มเติม:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #b45309;">฿${totalVariableExpense.toLocaleString()}</td>
              </tr>
              <tr style="border-bottom: 1px dashed #e5e7eb;">
                <td style="padding: 6px 0; color: #4b5563;">ยอดค้างชำระเครดิตตามเก็บ:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #d97706;">฿${totalPending.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #4b5563;">จำนวนโปรเจกต์งานดีล:</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; color: #111827;">${targetMonthJobs.length} งาน (สำเร็จครบถ้วน ${completedDeals.length} งาน)</td>
              </tr>
            </table>
          </div>
          
          <!-- Completed Jobs List -->
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 13px; color: #374151; margin: 0 0 10px 0; font-weight: bold;">📋 รายชื่อดีลงานในรอบเดือนนี้ (${targetMonthJobs.length} รายการ)</h3>
            ${targetMonthJobs.length === 0 ? `
              <div style="text-align: center; padding: 15px; font-size: 12px; color: #9ca3af; border: 1px dashed #e5e7eb; border-radius: 8px;">ไม่มีรายการงานดีลในรอบเดือนนี้</div>
            ` : `
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                  <tr style="background-color: #f3f4f6; text-align: left; border-bottom: 1px solid #d1d5db;">
                    <th style="padding: 8px 6px; font-weight: bold;">ชื่องานดีล</th>
                    <th style="padding: 8px 6px; font-weight: bold;">ลูกค้า</th>
                    <th style="padding: 8px 6px; text-align: right; font-weight: bold;">มูลค่างาน</th>
                    <th style="padding: 8px 6px; text-align: right; font-weight: bold;">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  ${targetMonthJobs.map(j => `
                    <tr style="border-bottom: 1px solid #f3f4f6;">
                      <td style="padding: 8px 6px; font-weight: bold; color: #111827;">${j.name}</td>
                      <td style="padding: 8px 6px; color: #4b5563;">${j.client || '-'}</td>
                      <td style="padding: 8px 6px; text-align: right; font-weight: bold; font-family: monospace;">฿${(j.value || 0).toLocaleString()}</td>
                      <td style="padding: 8px 6px; text-align: right;">
                        <span style="padding: 2px 6px; border-radius: 50px; font-size: 9px; font-weight: bold; ${j.pending === 0 ? 'background-color: #ecfdf5; color: #047857;' : 'background-color: #fffbeb; color: #b45309;'}">
                          ${j.pending === 0 ? 'ครบถ้วน' : 'ค้าง ฿' + (j.pending || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>

          <!-- Expenses List -->
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 13px; color: #374151; margin: 0 0 10px 0; font-weight: bold;">💸 รายการรายจ่ายในรอบเดือนนี้ (${targetMonthExpenses.length} รายการ)</h3>
            ${targetMonthExpenses.length === 0 ? `
              <div style="text-align: center; padding: 15px; font-size: 12px; color: #9ca3af; border: 1px dashed #e5e7eb; border-radius: 8px;">ไม่มีการลงบันทึกรายจ่ายในรอบเดือนนี้</div>
            ` : `
              <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                  <tr style="background-color: #f3f4f6; text-align: left; border-bottom: 1px solid #d1d5db;">
                    <th style="padding: 8px 6px; font-weight: bold;">รายการรายจ่าย</th>
                    <th style="padding: 8px 6px; font-weight: bold;">หมวดหมู่</th>
                    <th style="padding: 8px 6px; text-align: right; font-weight: bold;">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  ${targetMonthExpenses.map(e => `
                    <tr style="border-bottom: 1px solid #f3f4f6;">
                      <td style="padding: 8px 6px; font-weight: bold; color: #111827;">${e.name}</td>
                      <td style="padding: 8px 6px; color: #4b5563;">${e.category}</td>
                      <td style="padding: 8px 6px; text-align: right; font-weight: bold; font-family: monospace; color: #b91c1c;">฿${(e.amount || 0).toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
          </div>
          
          <div style="border-top: 1px solid #e5e7eb; padding-top: 15px; text-align: center; font-size: 11px; color: #9ca3af;">
            <p style="margin: 0;">รายงานนี้สร้างขึ้นอัตโนมัติจากระบบ กระรอกตุนเงิน สำหรับฟรีแลนซ์และครีเอเตอร์</p>
            <p style="margin: 4px 0 0 0;">พอร์ตเทลและสิทธิ์เข้าใช้งานได้รับการตรวจสอบความถูกต้องเรียบร้อยแล้ว</p>
          </div>
        </div>
      `;
      
      // Send the email
      MailApp.sendEmail({
        to: recipientEmail,
        subject: `[Monthly Cashflow Report] สรุปงบประแสเงินสดประจำเดือน ${monthDisplay} (${userEmail})`,
        htmlBody: htmlBody
      });
      
      Logger.log("Email sent successfully for account: " + userEmail + " to recipient: " + recipientEmail);
    });
    
  } catch (err) {
    Logger.log("Error generated in script execution: " + err.toString());
  }
}

/**
 * Trigger B: Daily checker for overdue credit terms (ทวงเงินอัตโนมัติ)
 * Checks for any unpaid bills due today or overdue, then sends you a warning email!
 */
function sendOverduePaymentAlerts() {
  try {
    Logger.log("Starting daily overdue credit term check...");
    
    // 1. Fetch data from Supabase Cloud Database (using the user_cashflow_data table)
    const url = SUPABASE_URL + "/rest/v1/user_cashflow_data?select=*";
    const options = {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText() ? response.getContentText().trim() : "";
    
    if (responseCode !== 200) {
      throw new Error("Failed to fetch from Supabase. Status: " + responseCode + ", Response: " + responseText);
    }
    
    // Validate if response is HTML instead of JSON (e.g. project paused or wrong URL)
    if (responseText.indexOf("<!doctype") === 0 || responseText.indexOf("<!DOCTYPE") === 0 || responseText.indexOf("<html") === 0 || responseText.indexOf("<HTML") === 0) {
      throw new Error("\n\n[ข้อผิดพลาดการเชื่อมต่อ Supabase / Supabase Connection Error]\n" +
                      "--------------------------------------------------------------------------------\n" +
                      "สคริปต์ได้รับข้อมูลกลับมาเป็นหน้าเว็บ HTML แทนที่จะเป็นข้อมูลแบบ JSON!\n" +
                      "สาเหตุที่เป็นไปได้:\n" +
                      "1. คุณระบุค่า SUPABASE_URL ในสคริปต์นี้ผิด (ระบุเป็นที่อยู่ลิงก์แอปพลิเคชันนี้เอง หรือหน้าเว็บพอร์ทัล Supabase)\n" +
                      "   --> ค่าที่ถูกต้องจะต้องเป็น URL ของ API ตัวจริง เช่น https://xxxxxx.supabase.co\n" +
                      "2. โครงการ Supabase ของคุณถูก 'Pause' ชั่วคราว (กรุณาเข้าไปที่ Supabase Dashboard แล้วกด Restore เพื่อให้กลับมาทำงาน)\n" +
                      "3. ตาราง 'user_cashflow_data' ในระบบฐานข้อมูลมีการตั้งค่าสิทธิ์เข้าถึง (RLS) หรือการกรองที่ส่งผลให้เกิดการ Redirect\n\n" +
                      "ค่า SUPABASE_URL ปัจจุบันที่ระบุในสคริปต์คือ: " + SUPABASE_URL + "\n" +
                      "--------------------------------------------------------------------------------\n");
    }
    
    let allUsersData;
    try {
      allUsersData = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error("ไม่สามารถแปลงข้อมูลที่ได้รับจาก Supabase เป็น JSON ได้ (Error: " + parseErr.toString() + "). เนื้อหาข้อมูลที่ได้รับ: " + responseText.substring(0, 300));
    }
    
    if (!allUsersData || allUsersData.length === 0) {
      Logger.log("No user data found in Supabase.");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allUsersData.forEach(userData => {
      const userEmail = userData.email;
      const notifSettings = userData.notif_settings || {};
      
      // Check if user has disabled notifications
      if (notifSettings.enabled === false) {
        Logger.log("Notifications are disabled for " + userEmail + ". Skipping.");
        return;
      }
      
      const jobs = userData.jobs || [];
      const recipientEmail = notifSettings.alertEmail || userEmail;
      
      // Filter overdue and due today jobs
      const overdueJobs = [];
      const dueTodayJobs = [];
      
      jobs.forEach(j => {
        // Unpaid check: status behavior is not 'done' and pending is > 0
        const isUnpaid = j.pending > 0 && j.paymentStatus !== "paid" && j.status !== "done";
        const targetDateStr = j.dueDate || j.payDate;
        
        if (isUnpaid && targetDateStr) {
          const targetDate = new Date(targetDateStr + "T00:00:00");
          const diffTime = targetDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays < 0) {
            overdueJobs.push({
              job: j,
              daysOverdue: Math.abs(diffDays),
              dateStr: targetDateStr
            });
          } else if (diffDays === 0) {
            dueTodayJobs.push({
              job: j,
              dateStr: targetDateStr
            });
          }
        }
      });
      
      if (overdueJobs.length === 0 && dueTodayJobs.length === 0) {
        Logger.log("No overdue or due-today jobs for user: " + userEmail);
        return;
      }
      
      // Build beautiful email body for alerts
      let alertHtml = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fca5a5; border-radius: 16px; background-color: #ffffff; color: #1f2937;">
          <div style="text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px;">
            <span style="background-color: #fef2f2; color: #dc2626; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 50px; text-transform: uppercase; letter-spacing: 1px; border: 1px solid #fee2e2;">Overdue Credit Alert</span>
            <h1 style="color: #991b1b; font-size: 20px; margin: 8px 0 0 0;">🚨 แจ้งเตือนเงินยังไม่เข้า! เลยกำหนดเครดิตเทอม</h1>
            <p style="font-size: 12px; color: #6b7280; margin: 4px 0 0 0;">บัญชีผู้ใช้: ${userEmail}</p>
          </div>
          
          <p style="font-size: 14px; line-height: 1.5; color: #374151;">
            ระบบตรวจพบความคืบหน้าทางการเงินว่า มีดีลงานของคุณที่<strong>เลยกำหนดเครดิตเทอม/ครบกำหนดในวันนี้</strong> แต่ยังมีสถานะค้างชำระเงินอยู่ ดังรายการต่อไปนี้:
          </p>
      `;
      
      if (overdueJobs.length > 0) {
        alertHtml += `
          <div style="margin-top: 20px; margin-bottom: 20px;">
            <h3 style="font-size: 13px; color: #b91c1c; margin: 0 0 10px 0; font-weight: bold;">⚠️ ดีลงานที่เกินกำหนดชำระเงิน (${overdueJobs.length} รายการ)</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background-color: #fef2f2; border-bottom: 1px solid #fca5a5; text-align: left;">
                  <th style="padding: 8px 6px; font-weight: bold; color: #991b1b;">ชื่องานดีล</th>
                  <th style="padding: 8px 6px; font-weight: bold; color: #991b1b;">ลูกค้า</th>
                  <th style="padding: 8px 6px; text-align: right; font-weight: bold; color: #991b1b;">ยอดค้างจ่าย</th>
                  <th style="padding: 8px 6px; text-align: right; font-weight: bold; color: #991b1b;">เลยกำหนดมาแล้ว</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        overdueJobs.forEach(item => {
          alertHtml += `
                <tr style="border-bottom: 1px solid #fee2e2;">
                  <td style="padding: 10px 6px; font-weight: bold; color: #111827;">${item.job.name}</td>
                  <td style="padding: 10px 6px; color: #4b5563;">${item.job.client || '-'}</td>
                  <td style="padding: 10px 6px; text-align: right; font-weight: bold; color: #b91c1c;">฿${(item.job.pending || 0).toLocaleString()}</td>
                  <td style="padding: 10px 6px; text-align: right; font-weight: bold; color: #dc2626; font-size: 11px;">
                    <span style="background-color: #fef2f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fee2e2;">
                      ${item.daysOverdue} วัน 🚨
                    </span>
                  </td>
                </tr>
          `;
        });
        
        alertHtml += `
              </tbody>
            </table>
          </div>
        `;
      }
      
      if (dueTodayJobs.length > 0) {
        alertHtml += `
          <div style="margin-top: 20px; margin-bottom: 20px;">
            <h3 style="font-size: 13px; color: #d97706; margin: 0 0 10px 0; font-weight: bold;">⏰ ดีลงานที่ครบกำหนดส่งเงินในวันนี้ (${dueTodayJobs.length} รายการ)</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background-color: #fffbeb; border-bottom: 1px solid #fde047; text-align: left;">
                  <th style="padding: 8px 6px; font-weight: bold; color: #b45309;">ชื่องานดีล</th>
                  <th style="padding: 8px 6px; font-weight: bold; color: #b45309;">ลูกค้า</th>
                  <th style="padding: 8px 6px; text-align: right; font-weight: bold; color: #b45309;">ยอดค้างจ่าย</th>
                  <th style="padding: 8px 6px; text-align: right; font-weight: bold; color: #b45309;">ดิวชำระ</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        dueTodayJobs.forEach(item => {
          alertHtml += `
                <tr style="border-bottom: 1px solid #fef3c7;">
                  <td style="padding: 10px 6px; font-weight: bold; color: #111827;">${item.job.name}</td>
                  <td style="padding: 10px 6px; color: #4b5563;">${item.job.client || '-'}</td>
                  <td style="padding: 10px 6px; text-align: right; font-weight: bold; color: #d97706;">฿${(item.job.pending || 0).toLocaleString()}</td>
                  <td style="padding: 10px 6px; text-align: right; font-weight: bold; color: #d97706; font-size: 11px;">วันนี้ ⏰</td>
                </tr>
          `;
        });
        
        alertHtml += `
              </tbody>
            </table>
          </div>
        `;
      }
      
      alertHtml += `
          <!-- Action Recommendations -->
          <div style="background-color: #f9fafb; border-radius: 12px; padding: 15px; border: 1px solid #e5e7eb; margin-top: 20px; font-size: 12px; line-height: 1.6;">
            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1f2937; font-weight: bold;">💡 คำแนะนำในการดำเนินการทวงถาม:</h4>
            <ol style="margin: 0; padding-left: 20px; color: #4b5563;">
              <li>เปิดแอปธนาคารหรือเช็คสเตทเมนต์ของคุณ เพื่อยืนยันว่าไม่มีเงินยอดดังกล่าวโอนเข้าจริง</li>
              <li>หากตรวจสอบแล้วพบว่ายังไม่ได้รับเงิน ให้ทักไลน์ อีเมล หรือโทรติดต่อผู้ดูแลดีลของเอเจนซี่เพื่อทวงถามความคืบหน้าทันที</li>
              <li>เมื่อได้รับยอดเงินเข้ามาในบัญชีจริงแล้ว ให้เปิดแอป <strong>กระรอกตุนเงิน</strong> กดแก้ไขรายการดีล แล้วปรับยอดคงค้างให้เป็น 0 เพื่อบันทึกเสร็จสมบูรณ์</li>
            </ol>
          </div>
          
          <div style="margin-top: 20px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 11px; color: #9ca3af;">
            <p style="margin: 0;">ระบบติดตามเครดิตเทอมและทวงเงินค้างชำระอัตโนมัติ (Daily Debt Tracker & Alert)</p>
            <p style="margin: 4px 0 0 0;">จัดทำและซิงค์ข้อมูลเรียบร้อยผ่าน กระรอกตุนเงิน</p>
          </div>
        </div>
      `;
      
      const countTotal = overdueJobs.length + dueTodayJobs.length;
      
      MailApp.sendEmail({
        to: recipientEmail,
        subject: `[ทวงเงินเครดิตเทอมอัตโนมัติ 🚨] พบงานค้างจ่ายเลยกำหนดดิว (${countTotal} รายการ) - สำหรับผู้ใช้: ${userEmail}`,
        htmlBody: alertHtml
      });
      
      Logger.log("Daily overdue report successfully sent to: " + recipientEmail + " for user: " + userEmail);
    });
    
  } catch (err) {
    Logger.log("Error generated in check: " + err.toString());
  }
}

const CONFIG = {
  "campaign_asset_segmentedQuery" : `
        SELECT 
          customer.descriptive_name,
          customer.id,
          asset.type,
          asset.id,
          campaign_asset.campaign, 
          campaign_asset.asset, 
          campaign_asset.field_type, 
          campaign_asset.resource_name, 
          metrics.clicks, 
          metrics.impressions, 
          metrics.top_impression_percentage, 
          metrics.cost_micros, 
          metrics.absolute_top_impression_percentage, 
          segments.asset_interaction_target.interaction_on_this_asset
        FROM campaign_asset 
        WHERE
          segments.date >= '2022-05-01'
          AND segments.date <= '2022-12-31'
          AND asset.type IN ('SITELINK')
      `,
      "sheetURL": `https://docs.google.com/spreadsheets/d/17bIUO95BcN2yBA2ZoWnSAfRnvKVd73AvIy7_Ho7B_Bs/`,
      "emailRecipient": `oleh.piddubnyi@groupone.com.pl`,
      "emailErrorsRecipient": `oleh.piddubnyi@groupone.com.pl`,
      "sheetName": `ReportV1`
}

// Crating Assets Dictionary for future matching
// F - Sitelink Texts Dictionary
function getAssets(){
  const assets = {};

  const query = `
      SELECT 
          asset.sitelink_asset.link_text, 
          asset.final_urls,
          asset.id 
      FROM asset 
  `;

  const report = AdsApp.report(query);  
  const rows = report.rows();

  while (rows.hasNext()) {
    let row = rows.next();
    
    if (!!row["asset.sitelink_asset.link_text"]){
      const key = row["asset.id"];
      const value = {
            sitelinkURL: row["asset.final_urls"],
            siteLinkText: row["asset.sitelink_asset.link_text"]
        };

      assets[key] = value ;
    }
  }

  return assets;
}

// F - Campaign Names Dictionary
function getCampaigns(){
  const campaigns = {};

  const query = `
      SELECT 
        campaign.name,
        campaign.id, 
        customer.id, 
        campaign.resource_name 
      FROM campaign 
  `;

  const report = AdsApp.report(query);  
  const rows = report.rows();

  while (rows.hasNext()) {
    let row = rows.next();
    
    const key = row["campaign.resource_name"];
    const value = row["campaign.name"];

    campaigns[key] = value ;
  }
  
  return campaigns;
}

// F - Get data from Google Ads App

function getReport(query) {

    const report = AdsApp.report(query);
    return report
}

// F - Matching Report taken by getReport function and Dictionaries. Creating New report format

function transformReport(report){
  const assetsDictionary = getAssets();
  const campaignDictionary = getCampaigns();
  
  const result = [];

  const rows = report.rows();
  while (rows.hasNext()) {

    let row = rows.next();

    // Replace IDs in report by Names form dictionaries
    const currentAsset = assetsDictionary[row["asset.id"]];
    const translatedAssetsText = currentAsset["siteLinkText"];
    const translatedAssetsURL =  currentAsset["sitelinkURL"].join(",");
    const currentCampaign = campaignDictionary[row["campaign_asset.campaign"]];
    
    result.push(
      {
        "Account ID": row["customer.id"],
        "Account Name": row["customer.descriptive_name"],
        "Asset ID": row["asset.id"],
        "Campaign": currentCampaign,
        "Link Text": translatedAssetsText,
        "Final URL": translatedAssetsURL,
        "Interaction on this Asset": !!row["segments.asset_interaction_target.interaction_on_this_asset"],
        "Clicks": row["metrics.clicks"], 
        "Impressions": row["metrics.impressions"], 
        "Cost": row["metrics.cost_micros"] / 1000000, 
        "Top Impression Share": row["metrics.top_impression_percentage"], 
        "Abs. Top Impression Share": row["metrics.absolute_top_impression_percentage"],                  
      }
    );
  }

  return result;
}

// F - Exporting New Report into Google Spreadsheet
function exportReport(sheet, spreadsheet, reportTable) {
  const report = reportTable;

  // Creating Headline for a report table, if it's empty
  if (!sheet.getLastRow()){
    sheet.appendRow(Object.keys(report[0]));
  }
  
  // Transforming Report from Object to Array for fast uploading
  let reportArray = [];
  for(const row of report){
      reportArray.push(Object.values(row));
    }
  
  // Set an empty range in Google Spreadsheet for uploading data from Array
  var range = sheet.getRange((sheet.getLastRow() + 1), 1,  (reportArray.length), (reportArray[0].length));
  range.setValues(reportArray); 
  
}

// F - Send Email with attached file
function sendEmail(recipient, fileURL) {

  // Getting useful data for the email text
  const currentAccount = AdsApp.currentAccount();    
  const accountName = currentAccount.getName();
  const accountID = currentAccount.getCustomerId();
  const attachment = SpreadsheetApp.openByUrl(fileURL);

  // Sending the email
  MailApp.sendEmail({
    to: recipient,
    subject: `Report for Sitelinks Extension is ready for ${accountName} (${accountID}) by "Get_That_F_Links_Report_Script"`,
    htmlBody: `Hi!<br>
              Script "Get_That_F_Links_Report_Script" created report for your ${accountID} <br>

              More information you may find in the attached file:<br>
              ${attachment.getUrl()}`
    });
  }

/// F - Is needed for debugging some code

function prettyPrint(obj){
  console.log(JSON.stringify(obj, null, 4));
}

// F - Main function. It's processed for itch account one by one

function runPerAccount(spreadsheet, sheet) {
  let report = getReport(CONFIG.campaign_asset_segmentedQuery);
  let result = transformReport(report);
    
//  prettyPrint(result);

  sendEmail(CONFIG.emailRecipient, CONFIG.sheetURL);
  exportReport(sheet, spreadsheet, result);
}

// F - Main MCC function
function main() {
  
  var accountSelector = AdsManagerApp.accounts();
  var accountIterator = accountSelector.get();
  
  // Getting Spreadsheet and clearing it
  const spreadsheet = SpreadsheetApp.openByUrl(CONFIG.sheetURL);
  const sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  sheet.clearContents();
  
  while (accountIterator.hasNext()) {
    var account = accountIterator.next();
    AdsManagerApp.select(account); 
    runPerAccount(spreadsheet, sheet);
}


}
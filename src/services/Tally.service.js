const axios = require("axios");
require("dotenv").config();
const { parseStringPromise } = require("xml2js");
const SellOrder = require("../models/salesOrder.model");


// Reference the environment variable
const TALLY_URL = process.env.TALLY_URL || "http://localhost:9001";

/**
 * POST SALES VOUCHER TO TALLY
 * + Update SellOrder.isTallyCreated ONLY after success
 */
exports.postSalesVoucher = async (inputData) => {
  try {
    /* ===========================
       DESTRUCTURE INPUT
    ============================ */
    let {
      sellOrderId,
      company,
      customerLedger,
      salesLedger,
      amount,
      voucherNumber,
      narration,
      date,
      voucherType,
      stockItems = []
    } = inputData;

    /* ===========================
       VALIDATIONS
    ============================ */
    if (!company) throw new Error("Company is required");
    if (!customerLedger) throw new Error("Customer ledger is required");
    if (!salesLedger) throw new Error("Sales ledger is required");
    if (!voucherType) throw new Error("Voucher type is required");

    if (amount === undefined || amount === null) {
      amount = 0;
    }

    /* ===========================
       DATE FORMAT (YYYYMMDD)
    ============================ */
    const voucherDate = date
      ? String(date).replace(/[-\/]/g, "")
      : new Date().toISOString().slice(0, 10).replace(/-/g, "");

    /* ===========================
       UNIQUE IDS
    ============================ */
    const guid = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const finalVoucherNumber = voucherNumber || Date.now().toString();

    /* ===========================
       INVENTORY XML
    ============================ */
    let stockItemsXML = "";

    if (Array.isArray(stockItems) && stockItems.length > 0) {
      const totalQty = stockItems.reduce(
        (sum, i) => sum + Number(i.quantity || 1),
        0
      );

      stockItemsXML = stockItems
        .map((item) => {
          const {
            name,
            quantity = 1,
            rate,
            amount: itemAmount,
            unit = "Nos",
            godownName = ""
          } = item;

          let finalRate = 0;
          let finalAmount = 0;

          if (itemAmount !== undefined && itemAmount !== null) {
            finalAmount = Number(itemAmount);
            finalRate = quantity ? finalAmount / quantity : 0;
          } else if (rate !== undefined && rate !== null) {
            finalRate = Number(rate);
            finalAmount = finalRate * quantity;
          } else {
            finalRate = totalQty ? amount / totalQty : 0;
            finalAmount = finalRate * quantity;
          }

          const godownXML = godownName
            ? `
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>${godownName}</GODOWNNAME>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <AMOUNT>${finalAmount.toFixed(2)}</AMOUNT>
                <ACTUALQTY>${quantity} ${unit}</ACTUALQTY>
                <BILLEDQTY>${quantity} ${unit}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>`
            : "";

          return `
            <INVENTORYALLOCATIONS.LIST>
              <STOCKITEMNAME>${name}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <RATE>${finalRate.toFixed(2)}/${unit}</RATE>
              <AMOUNT>${finalAmount.toFixed(2)}</AMOUNT>
              <ACTUALQTY>${quantity} ${unit}</ACTUALQTY>
              <BILLEDQTY>${quantity} ${unit}</BILLEDQTY>
              ${godownXML}
            </INVENTORYALLOCATIONS.LIST>
          `;
        })
        .join("");
    }

    /* ===========================
       FINAL XML PAYLOAD
    ============================ */
    const xmlPayload = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="${guid}" VCHTYPE="${voucherType}" ACTION="Create">
            <DATE>${voucherDate}</DATE>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${finalVoucherNumber}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${customerLedger}</PARTYLEDGERNAME>
            <NARRATION>${narration || ""}</NARRATION>

            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${customerLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${Number(amount).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${salesLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${Number(amount).toFixed(2)}</AMOUNT>
              ${stockItemsXML}
            </ALLLEDGERENTRIES.LIST>

          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
    `.trim();

    /* ===========================
       SEND TO TALLY
    ============================ */
    const response = await axios.post(TALLY_URL, xmlPayload, {
      headers: { "Content-Type": "application/xml" },
      timeout: 5000,
      validateStatus: (status) => status >= 200 && status < 500
    });

    const responseStr = String(response.data);

    /* ===========================
       PARSE TALLY RESPONSE
    ============================ */
    const created = Number(
      (responseStr.match(/<CREATED>(\d+)<\/CREATED>/) || [0, 0])[1]
    );
    const errors = Number(
      (responseStr.match(/<ERRORS>(\d+)<\/ERRORS>/) || [0, 0])[1]
    );
    const exceptions = Number(
      (responseStr.match(/<EXCEPTIONS>(\d+)<\/EXCEPTIONS>/) || [0, 0])[1]
    );
    const lineError = (
      responseStr.match(/<LINEERROR>(.*?)<\/LINEERROR>/s) || []
    )[1];

    if (lineError) throw new Error(`Tally error: ${lineError.trim()}`);
    if (exceptions > 0) throw new Error(`Tally exceptions: ${exceptions}`);
    if (errors > 0) throw new Error(`Tally errors: ${errors}`);
    if (created === 0) throw new Error("Voucher not created in Tally");

    /* ===========================
       UPDATE SELL ORDER (ONLY HERE)
    ============================ */
    if (sellOrderId) {
      await SellOrder.findByIdAndUpdate(
        sellOrderId,
        {
          isTallyCreated: true,
          tallyVoucherNumber: finalVoucherNumber,
          tallyCreatedAt: new Date()
        },
        { new: true }
      );
    }

    /* ===========================
       SUCCESS RESPONSE
    ============================ */
    return {
      success: true,
      message: "Sales voucher posted successfully",
      voucherNumber: finalVoucherNumber,
      amount,
      stockItemsCount: stockItems.length,
      vouchersCreated: created
    };

  } catch (err) {
    /* ===========================
       TIMEOUT HANDLING
    ============================ */
    if (err.code === "ECONNABORTED" || err.message.includes("timeout")) {
      return {
        success: true,
        message: "Voucher may be created in Tally (timeout)",
        warning: "timeout"
      };
    }
    throw err;
  }
};


// exports.getAllVouchers = async (inputData) => {
//   try {
//     let { company, fromDate, toDate } = inputData;

//     // Format dates for Tally (YYYYMMDD)
//     const formattedFromDate = fromDate 
//       ? String(fromDate).replace(/[-\/]/g, '') 
//       : '20260101'; 

//     const formattedToDate = toDate 
//       ? String(toDate).replace(/[-\/]/g, '') 
//       : '20261231';

//     const companyTag = company ? `<SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>` : '';

//     // Build XML payload with FETCH command for Stock Group (PARENT)
// const xmlPayload = `<ENVELOPE>
//   <HEADER>
//     <VERSION>1</VERSION>
//     <TALLYREQUEST>Export</TALLYREQUEST>
//     <TYPE>Data</TYPE>
//     <ID>Day Book</ID> </HEADER>
//   <BODY>
//     <DESC>
//       <STATICVARIABLES>
//         <SVCURRENTCOMPANY>${company || 'Test_Company'}</SVCURRENTCOMPANY>
//         <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
//         <SVFROMDATE TYPE="Date">${formattedFromDate}</SVFROMDATE>
//         <SVTODATE TYPE="Date">${formattedToDate}</SVTODATE>
//         <EXPLODEINVENTORYENTRIES>Yes</EXPLODEINVENTORYENTRIES>
//         <EXPLODEALLLEVELS>Yes</EXPLODEALLLEVELS>
//       </STATICVARIABLES>
//     </DESC>
//   </BODY>
// </ENVELOPE>`;

//     // Send request to Tally
//     const response = await axios.post(TALLY_URL, xmlPayload, {
//       headers: { "Content-Type": "application/xml" },
//       timeout: 15000
//     });

//     const responseStr = String(response.data);

//     // RETURN RAW XML FIRST TO INSPECT
//     return {
//       success: true,
//       message: "Raw XML retrieved for inspection",
//       rawXml: responseStr 
//     };

//   } catch (err) {
//     throw new Error(`Failed to retrieve vouchers: ${err.message}`);
//   }
// };

exports.getAllVouchers = async (inputData) => {
    try {
        let { company, fromDate, toDate } = inputData;

        // Format dates
        const formattedFromDate = fromDate
            ? String(fromDate).replace(/[-\/]/g, '')
            : '20200101'; // Default start date if not provided

        const formattedToDate = toDate
            ? String(toDate).replace(/[-\/]/g, '')
            : new Date().toISOString().slice(0, 10).replace(/-/g, ''); // Default today

        // Include company tag if provided
        const companyTag = company ? `<SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>` : '';

        // Build XML payload
        const xmlPayload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>VoucherRegister</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        ${companyTag}
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE TYPE="Date">${formattedFromDate}</SVFROMDATE>
        <SVTODATE TYPE="Date">${formattedToDate}</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

        // Send request to Tally
        const response = await axios.post(TALLY_URL, xmlPayload, {
            headers: { "Content-Type": "application/xml" },
            timeout: 15000
        });

        const responseStr = String(response.data);

        // Parse vouchers from XML
        const vouchers = parseVouchersFromXML(responseStr);

        return {
            success: true,
            message: vouchers.length > 0 ? "Vouchers retrieved successfully" : "No vouchers found",
            count: vouchers.length,
            vouchers,
            fromDate: formattedFromDate,
            toDate: formattedToDate,
            company: company || 'Current'
        };

    } catch (err) {
        throw new Error(`Failed to retrieve vouchers: ${err.message}`);
    }
};

function parseVouchersFromXML(xmlStr) {
    const vouchers = [];
    // Match each main VOUCHER block
    const voucherMatches = xmlStr.matchAll(/<VOUCHER[^>]*>([\s\S]*?)<\/VOUCHER>/g);

    for (const match of voucherMatches) {
        const voucherXML = match[1];
        const voucher = {
            date: (voucherXML.match(/<DATE>([\s\S]*?)<\/DATE>/i) || [])[1] || "",
            voucherType: (voucherXML.match(/<VOUCHERTYPENAME>([\s\S]*?)<\/VOUCHERTYPENAME>/i) || [])[1] || "",
            voucherNumber: (voucherXML.match(/<VOUCHERNUMBER>([\s\S]*?)<\/VOUCHERNUMBER>/i) || [])[1] || "",
            partyName: (voucherXML.match(/<PARTYLEDGERNAME>([\s\S]*?)<\/PARTYLEDGERNAME>/i) || [])[1] || "",
            ledgerEntries: [],
            stockItems: []
        };

        // 1. Parse Ledger Entries (Matches LEDGERENTRIES and ALLLEDGERENTRIES)
        const ledgerMatches = voucherXML.matchAll(/<(?:ALL)?LEDGERENTRIES\.LIST>([\s\S]*?)<\/(?:ALL)?LEDGERENTRIES\.LIST>/g);
        for (const lm of ledgerMatches) {
            const lXML = lm[1];
            const name = (lXML.match(/<LEDGERNAME>([\s\S]*?)<\/LEDGERNAME>/i) || [])[1];
            if (name) {
                voucher.ledgerEntries.push({
                    ledgerName: name,
                    amount: parseFloat((lXML.match(/<AMOUNT>([\s\S]*?)<\/AMOUNT>/i) || [])[1] || 0),
                    isDeemedPositive: (lXML.match(/<ISDEEMEDPOSITIVE>([\s\S]*?)<\/ISDEEMEDPOSITIVE>/i) || [])[1] || ""
                });
            }
        }

        // 2. Parse Inventory (Matches ALLINVENTORYENTRIES and INVENTORYALLOCATIONS)
        const stockMatches = voucherXML.matchAll(/<(?:ALLINVENTORYENTRIES|INVENTORYALLOCATIONS)\.LIST>([\s\S]*?)<\/(?:ALLINVENTORYENTRIES|INVENTORYALLOCATIONS)\.LIST>/g);
        for (const sm of stockMatches) {
            const sXML = sm[1];
            const itemName = (sXML.match(/<STOCKITEMNAME>([\s\S]*?)<\/STOCKITEMNAME>/i) || [])[1];

            if (itemName) {
                voucher.stockItems.push({
                    name: itemName,
                    stockGroup: (sXML.match(/<PARENT>([\s\S]*?)<\/PARENT>/i) || [])[1] || "",
                    quantity: (sXML.match(/<ACTUALQTY>([\s\S]*?)<\/ACTUALQTY>/i) || [])[1] || "",
                    rate: (sXML.match(/<RATE>([\s\S]*?)<\/RATE>/i) || [])[1] || "",
                    amount: parseFloat((sXML.match(/<AMOUNT>([\s\S]*?)<\/AMOUNT>/i) || [])[1] || 0)
                });

                // Check for 'Sales' ledger nested inside the item block
                const innerLedgerMatch = sXML.match(/<ACCOUNTINGALLOCATIONS\.LIST>([\s\S]*?)<\/ACCOUNTINGALLOCATIONS\.LIST>/i);
                if (innerLedgerMatch) {
                    const hXML = innerLedgerMatch[1];
                    voucher.ledgerEntries.push({
                        ledgerName: (hXML.match(/<LEDGERNAME>([\s\S]*?)<\/LEDGERNAME>/i) || [])[1] || "",
                        amount: parseFloat((hXML.match(/<AMOUNT>([\s\S]*?)<\/AMOUNT>/i) || [])[1] || 0),
                        isDeemedPositive: (hXML.match(/<ISDEEMEDPOSITIVE>([\s\S]*?)<\/ISDEEMEDPOSITIVE>/i) || [])[1] || ""
                    });
                }
            }
        }
        vouchers.push(voucher);
    }
    return vouchers;
}

exports.fetchCompaniesFromTally = async () => {
    const xmlRequest = `
    <ENVELOPE>
        <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Collection</TYPE>
            <ID>List of Companies</ID>
        </HEADER>
        <BODY>
            <DESC>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                </STATICVARIABLES>
            </DESC>
        </BODY>
    </ENVELOPE>`;

    const response = await axios.post('http://localhost:9001', xmlRequest, {
        headers: { 'Content-Type': 'text/xml' }
    });

    return response.data;
};

exports.fetchLedgersFromTally = async () => {
    // The exact XML payload from your Python implementation
    const xmlRequest = `
    <ENVELOPE>
        <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>EXPORT</TALLYREQUEST>
            <TYPE>COLLECTION</TYPE>
            <ID>List of Ledgers</ID>
        </HEADER>
        <BODY>
            <DESC>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                </STATICVARIABLES>
            </DESC>
        </BODY>
    </ENVELOPE>`;

    try {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { 'Content-Type': 'text/xml' }
        });

        // Tally identifies requests and sends a response accordingly
        // Handling special characters like '&' similar to your Python .replace("&amp;", "and")
        if (typeof response.data === 'string') {
            return response.data.replace(/&amp;/g, "and");
        }

        return response.data;
    } catch (err) {
        throw new Error(`Failed to reach Tally: ${err.message}`);
    }
};

exports.fetchItemsFromTally = async () => {
    const xmlRequest = `
  <ENVELOPE>
    <HEADER>
      <VERSION>1</VERSION>
      <TALLYREQUEST>EXPORT</TALLYREQUEST>
      <TYPE>COLLECTION</TYPE>
      <ID>List of Stock Items</ID>
    </HEADER>

    <BODY>
      <DESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </DESC>
    </BODY>
  </ENVELOPE>`;

    try {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { "Content-Type": "text/xml" },
        });

        if (typeof response.data === "string") {
            return response.data.replace(/&amp;/g, "and");
        }

        return response.data;
    } catch (err) {
        throw new Error(`Failed to reach Tally: ${err.message}`);
    }
};

exports.fetchUnitsFromTally = async () => {
    const xmlRequest = `
  <ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>Unit Collection</ID>
 </HEADER>

 <BODY>
  <DESC>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="Unit Collection">
      <TYPE>Unit</TYPE>
      <FETCH>NAME,SYMBOL</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>
`;

    try {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { "Content-Type": "text/xml" },
        });

        if (typeof response.data === "string") {
            return response.data.replace(/&amp;/g, "and");
        }

        return response.data;
    } catch (err) {
        throw new Error(`Failed to reach Tally: ${err.message}`);
    }
};
// controllers/tally.controller.js
const { TallyService } = require("../services");
const { parseStringPromise } = require("xml2js");
const axios = require("axios");

// Make sure your controller looks exactly like this:
exports.createSalesVoucher = async (req, res) => {
  try {
    const {
      sellOrderId, // ✅ important
      ...voucherData
    } = req.body;

    const result = await TallyService.postSalesVoucher({
      ...voucherData,
      sellOrderId
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error("Error creating voucher:", err.message);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.getAllVouchers = async (req, res) => {
  try {
    const { company, fromDate, toDate } = req.body; // input via Postman
    const result = await TallyService.getAllVouchers({ company, fromDate, toDate });
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCompanies = async (req, res, next) => {
  try {
    const xmlData = await TallyService.fetchCompaniesFromTally();
    const result = await parseStringPromise(xmlData);

    // Path: ENVELOPE -> BODY -> DATA -> COLLECTION -> COMPANY
    const collection = result.ENVELOPE.BODY[0].DATA[0].COLLECTION[0];
    const companies = collection.COMPANY || [];

    const companyList = companies.map((comp) => ({
      name: comp.$.NAME, // Extracting the 'NAME' attribute
      isCurrent: comp.$.ISCURRENTPAYROLLCOMPANY === "Yes", // Checks if it is the active one
    }));

    res.status(200).json({
      success: true,
      total: companyList.length,
      companies: companyList,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch companies: " + error.message,
    });
  }
};

exports.getLedgers = async (req, res) => {
  try {
    const rawXml = await TallyService.fetchLedgersFromTally();

    // Translate local XML format into JSON
    const result = await parseStringPromise(rawXml);

    // Validation based on Tally Response Template
    if (!result.ENVELOPE || !result.ENVELOPE.BODY) {
      throw new Error("Invalid Tally response structure.");
    }

    // Equivalent to Python's .findall('./BODY/DATA/COLLECTION/LEDGER')
    // Tally Collection structure: BODY -> DATA -> COLLECTION -> LEDGER
    const dataNode = result.ENVELOPE.BODY[0].DATA[0];
    const collection = dataNode.COLLECTION[0];
    const ledgerArray = collection.LEDGER || [];

    // In Tally XML, names are attributes accessed via '$' in xml2js
    const ledgerNames = ledgerArray.map((ledger) => ledger.$.NAME);

    res.status(200).json({
      success: true,
      total: ledgerNames.length,
      ledgers: ledgerNames, // Returns a list of names like your Python print loop
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Node.js Implementation Error: " + error.message,
    });
  }
};

exports.getItems = async (req, res) => {
  try {
    // 1️⃣ Fetch raw XML from Tally (same as ledgers)
    const rawXml = await TallyService.fetchItemsFromTally();

    // 2️⃣ Convert XML to JSON
    const result = await parseStringPromise(rawXml);

    // 3️⃣ Basic validation
    if (!result.ENVELOPE || !result.ENVELOPE.BODY) {
      throw new Error("Invalid Tally response structure.");
    }

    // 4️⃣ Navigate Tally's XML structure: BODY -> DATA -> COLLECTION -> STOCKITEM
    const dataNode = result.ENVELOPE.BODY[0].DATA[0];
    const collection = dataNode.COLLECTION[0];
    const itemArray = collection.STOCKITEM || [];

    // 5️⃣ Extract names (attribute '$.NAME')
    const itemNames = itemArray.map((item) => item.$.NAME);

    // 6️⃣ Return JSON response
    res.status(200).json({
      success: true,
      total: itemNames.length,
      items: itemNames, // List of stock item names
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Node.js Implementation Error: " + error.message,
    });
  }
};

exports.getUnits = async (req, res) => {
  try {
    const rawXml = await TallyService.fetchUnitsFromTally();

    const result = await parseStringPromise(rawXml);

    if (!result.ENVELOPE || !result.ENVELOPE.BODY) {
      throw new Error("Invalid Tally response structure.");
    }

    const dataNode = result.ENVELOPE.BODY[0].DATA[0];
    const collection = dataNode.COLLECTION[0];
    const unitArray = collection.UNIT || [];

    const unitNames = unitArray.map((unit) => unit.$.NAME);

    res.status(200).json({
      success: true,
      total: unitNames.length,
      units: unitNames,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Node.js Implementation Error: " + error.message,
    });
  }
};


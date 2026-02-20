const pricingService = require('../services/pricing.service');

const uploadAndMergeCSV = async (req, res) => {
  try {
    const file = req.files?.[0]; // using multer's upload.any()

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const result = await pricingService.processCSV(file);

    return res.status(200).json({
      success: true,
      message: result || 'CSV processed successfully',
    });
  } catch (error) {
    console.error('❌ CSV Upload Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

module.exports = {
  uploadAndMergeCSV,
};
